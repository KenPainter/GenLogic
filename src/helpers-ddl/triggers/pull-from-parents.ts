import type { NewSchema } from '../../new-schema.js';

interface SyncColumnInfo {
  targetColumn: string;      // Column in child table to populate
  sourceColumn: string;       // Column in parent table to read from
}

interface SyncGroup {
  sourceTable: string;        // Parent table name
  fkColumn: string;           // FK column in child table
  parentPK: string;           // PK column in parent table
  columns: SyncColumnInfo[];  // All columns to sync from this parent
}

/**
 * Generate PL/pgSQL code to pull SYNC/SNAPSHOT values from parent tables
 *
 * SYNC vs SNAPSHOT:
 * - Both automation types get identical treatment in this function
 * - Both pull values on INSERT
 * - Both pull values on UPDATE when FK changes
 * - The ONLY difference is in push-to-children.ts:
 *   * SYNC: Parent updates push to children (see push-to-children.ts)
 *   * SNAPSHOT: Parent updates do NOT push to children (frozen at capture time)
 *
 * OPTIMIZATION: Groups multiple SYNC/SNAPSHOT columns from the same parent table into a single SELECT.
 * Instead of 5 separate SELECTs hitting the same parent row, we fetch all columns at once.
 *
 * For BEFORE INSERT: Pull all SYNC/SNAPSHOT columns
 * For BEFORE UPDATE: Only pull SYNC/SNAPSHOT columns where FK changed
 *
 * Example output:
 *   -- SYNC/SNAPSHOT from batches (5 columns)
 *   IF NEW."batch_id" IS DISTINCT FROM OLD."batch_id" THEN
 *     SELECT "description", "account_id_base", "category_base", "date", "sign_flip"
 *     INTO NEW."description_from_batch", NEW."account_id_base", NEW."category_base",
 *          NEW."date_from_batch", NEW."sign_flip"
 *     FROM "batches" WHERE "batch_id" = NEW."batch_id";
 *   END IF;
 */
export function generatePullFromParents(
  tableName: string,
  newSchema: NewSchema,
  triggerType: 'INSERT' | 'UPDATE'
): string[] {
  const table = newSchema.tables[tableName];
  if (!table || !table.columns) {
    return [];
  }

  // Group SYNC/SNAPSHOT columns by (sourceTable, fkColumn, parentPK)
  // This allows us to batch multiple columns from the same parent into one SELECT
  // IMPORTANT: Both SYNC and SNAPSHOT are handled identically here - they both pull on INSERT and FK changes
  const syncGroups = new Map<string, SyncGroup>();

  for (const [colName, colDef] of Object.entries(table.columns)) {
    // Include both SYNC and SNAPSHOT - they have identical pull behavior
    // The difference is only in push-to-children.ts (SYNC pushes, SNAPSHOT doesn't)
    if (!colDef.automationType || (colDef.automationType !== 'SYNC' && colDef.automationType !== 'SNAPSHOT')) {
      continue;
    }

    const sourceTable = colDef.automationSourceTable;
    const sourceColumn = colDef.automationSourceColumn;
    const explicitFKColumn = colDef.automationFKColumn;

    if (!sourceTable || !sourceColumn) {
      // Skip invalid automation (should have been caught in validation)
      continue;
    }

    // Find FK column that references the source table
    let fkColumn: string | undefined;
    if (explicitFKColumn) {
      fkColumn = explicitFKColumn;
    } else {
      // Search for FK that references sourceTable
      for (const fk of Object.values(table.foreignKeys || {})) {
        if (fk.parentTable === sourceTable) {
          fkColumn = fk.childColumn;
          break;
        }
      }
    }

    if (!fkColumn) {
      continue;
    }

    // Get parent table's PK column
    const parentTable = newSchema.tables[sourceTable];
    const parentPK = parentTable?.pkColumn;
    if (!parentPK) {
      continue;
    }

    // Group key: combine sourceTable, fkColumn, and parentPK
    // This handles cases where same table is referenced via different FKs
    const groupKey = `${sourceTable}:${fkColumn}:${parentPK}`;

    if (!syncGroups.has(groupKey)) {
      syncGroups.set(groupKey, {
        sourceTable,
        fkColumn,
        parentPK,
        columns: []
      });
    }

    syncGroups.get(groupKey)!.columns.push({
      targetColumn: colName,
      sourceColumn: sourceColumn
    });
  }

  // Generate one SELECT per group
  const lines: string[] = [];

  for (const group of syncGroups.values()) {
    const columnCount = group.columns.length;
    const sourceColumns = group.columns.map(c => `"${c.sourceColumn}"`).join(', ');
    const targetColumns = group.columns.map(c => `NEW."${c.targetColumn}"`).join(', ');

    if (triggerType === 'UPDATE') {
      // Only pull if FK changed (applies to both SYNC and SNAPSHOT)
      lines.push(`  -- SYNC/SNAPSHOT from ${group.sourceTable} (${columnCount} column${columnCount > 1 ? 's' : ''})`);
      lines.push(`  IF NEW."${group.fkColumn}" IS DISTINCT FROM OLD."${group.fkColumn}" THEN`);
      lines.push(`    SELECT ${sourceColumns}`);
      lines.push(`    INTO ${targetColumns}`);
      lines.push(`    FROM "${group.sourceTable}" WHERE "${group.parentPK}" = NEW."${group.fkColumn}";`);
      lines.push(`  END IF;`);
    } else {
      // INSERT: always pull (applies to both SYNC and SNAPSHOT)
      lines.push(`  -- SYNC/SNAPSHOT from ${group.sourceTable} (${columnCount} column${columnCount > 1 ? 's' : ''})`);
      lines.push(`  SELECT ${sourceColumns}`);
      lines.push(`  INTO ${targetColumns}`);
      lines.push(`  FROM "${group.sourceTable}" WHERE "${group.parentPK}" = NEW."${group.fkColumn}";`);
    }
  }

  return lines;
}
