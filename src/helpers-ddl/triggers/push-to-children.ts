import type { NewSchema } from '../../new-schema.js';

interface SyncColumnMapping {
  childColumn: string;    // Column in child table to update
  parentColumn: string;   // Column in parent table that's the source
}

interface PushToChildGroup {
  childTable: string;           // Child table name
  childFKColumn: string;        // FK column in child table
  parentPKColumn: string;       // PK column in parent table
  columns: SyncColumnMapping[]; // All SYNC columns to update
}

/**
 * Generate PL/pgSQL code to push SYNC column changes to child tables
 *
 * ONLY for UPDATE triggers on parent tables.
 * When a parent column changes, push the new value to all child rows that SYNC it.
 *
 * OPTIMIZATION: Groups multiple SYNC columns to same child table into one UPDATE.
 *
 * Example: When accounts.category changes, update all ledger rows:
 *   IF NEW."category" IS DISTINCT FROM OLD."category" THEN
 *     UPDATE ledger
 *     SET category = NEW.category
 *     WHERE account_id = NEW.account_id;
 *   END IF;
 */
export function generatePushToChildren(
  tableName: string,
  newSchema: NewSchema
): string[] {
  const table = newSchema.tables[tableName];
  if (!table || !table.columns) {
    return [];
  }

  // Find all child tables that SYNC columns from this parent table
  // Group by (childTable, childFKColumn) for batching
  const pushGroups = new Map<string, PushToChildGroup>();

  // Scan all tables to find children that SYNC from this parent
  for (const [childTableName, childTable] of Object.entries(newSchema.tables)) {
    if (!childTable.columns) continue;

    for (const [childColName, childColDef] of Object.entries(childTable.columns)) {
      // Look for SYNC automation that sources from this parent table
      if (childColDef.automationType !== 'SYNC') continue;
      if (childColDef.automationSourceTable !== tableName) continue;

      const parentSourceColumn = childColDef.automationSourceColumn;
      const explicitFKColumn = childColDef.automationFKColumn;

      if (!parentSourceColumn) continue;

      // Find FK from child to parent
      let childFKColumn: string | undefined;
      if (explicitFKColumn) {
        childFKColumn = explicitFKColumn;
      } else {
        // Search for FK that references this parent table
        for (const fk of Object.values(childTable.foreignKeys || {})) {
          if (fk.parentTable === tableName) {
            childFKColumn = fk.childColumn;
            break;
          }
        }
      }

      if (!childFKColumn) continue;

      // Get parent PK
      const parentPK = table.pkColumn;
      if (!parentPK) continue;

      // Group key: child table + FK column
      const groupKey = `${childTableName}:${childFKColumn}`;

      if (!pushGroups.has(groupKey)) {
        pushGroups.set(groupKey, {
          childTable: childTableName,
          childFKColumn,
          parentPKColumn: parentPK,
          columns: []
        });
      }

      pushGroups.get(groupKey)!.columns.push({
        childColumn: childColName,
        parentColumn: parentSourceColumn
      });
    }
  }

  // Generate UPDATE statements for each child group
  const lines: string[] = [];

  for (const group of pushGroups.values()) {
    // Build list of parent columns that trigger the update
    const parentColumns = group.columns.map(c => c.parentColumn);
    const uniqueParentColumns = [...new Set(parentColumns)];

    // Build condition: IF any parent column changed
    const conditions = uniqueParentColumns.map(col => `NEW."${col}" IS DISTINCT FROM OLD."${col}"`);

    // Build SET clause
    const setStatements = group.columns.map(c => `"${c.childColumn}" = NEW."${c.parentColumn}"`);

    const columnCount = group.columns.length;
    lines.push(`  -- Push SYNC to ${group.childTable} (${columnCount} column${columnCount > 1 ? 's' : ''})`);
    lines.push(`  IF ${conditions.join(' OR ')} THEN`);
    lines.push(`    UPDATE "${group.childTable}"`);
    lines.push(`    SET ${setStatements.join(', ')}`);
    lines.push(`    WHERE "${group.childFKColumn}" = NEW."${group.parentPKColumn}";`);
    lines.push(`  END IF;`);
  }

  return lines;
}
