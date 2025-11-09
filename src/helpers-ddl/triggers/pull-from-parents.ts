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
 * Generate PL/pgSQL code to pull SYNC values from parent tables
 *
 * OPTIMIZATION: Groups multiple SYNC columns from the same parent table into a single SELECT.
 * Instead of 5 separate SELECTs hitting the same parent row, we fetch all columns at once.
 *
 * For BEFORE INSERT: Pull all SYNC columns
 * For BEFORE UPDATE: Only pull SYNC columns where FK changed
 *
 * Example output:
 *   -- SYNC from batches (5 columns)
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

  // Group SYNC columns by (sourceTable, fkColumn, parentPK)
  // This allows us to batch multiple columns from the same parent into one SELECT
  const syncGroups = new Map<string, SyncGroup>();

  for (const [colName, colDef] of Object.entries(table.columns)) {
    if (!colDef.automationType || colDef.automationType !== 'SYNC') {
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
      // Only pull if FK changed
      lines.push(`  -- SYNC from ${group.sourceTable} (${columnCount} column${columnCount > 1 ? 's' : ''})`);
      lines.push(`  IF NEW."${group.fkColumn}" IS DISTINCT FROM OLD."${group.fkColumn}" THEN`);
      lines.push(`    SELECT ${sourceColumns}`);
      lines.push(`    INTO ${targetColumns}`);
      lines.push(`    FROM "${group.sourceTable}" WHERE "${group.parentPK}" = NEW."${group.fkColumn}";`);
      lines.push(`  END IF;`);
    } else {
      // INSERT: always pull
      lines.push(`  -- SYNC from ${group.sourceTable} (${columnCount} column${columnCount > 1 ? 's' : ''})`);
      lines.push(`  SELECT ${sourceColumns}`);
      lines.push(`  INTO ${targetColumns}`);
      lines.push(`  FROM "${group.sourceTable}" WHERE "${group.parentPK}" = NEW."${group.fkColumn}";`);
    }
  }

  return lines;
}
