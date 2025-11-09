import type { NewSchema } from '../new-schema.js';

/**
 * Generate SQL script to repair/recalculate all formula and aggregation columns
 *
 * This script walks upward through the table layers, unconditionally updating:
 * 1. Formula columns - recalculated from their expressions
 * 2. Aggregation columns - recalculated from source tables
 *
 * Use cases:
 * - After manual data fixes that bypassed triggers
 * - Migration recovery if something went wrong
 * - Initial bulk data import without triggers
 * - Periodic verification/sanity checks
 * - Debugging trigger correctness
 *
 * The script processes tables in layer order (bottom-up) to ensure dependencies
 * are satisfied before aggregating upward.
 */

/**
 * Generate repair SQL for all tables in the schema
 */
export function generateAggregationRepair(newSchema: NewSchema): string[] {
  const sql: string[] = [];

  sql.push('-- ============================================');
  sql.push('-- AGGREGATION REPAIR SCRIPT');
  sql.push('-- ============================================');
  sql.push('-- This script recalculates all formula and aggregation columns');
  sql.push('-- Run this after manual data changes to restore data integrity');
  sql.push('--');
  sql.push('-- IMPORTANT: This script updates ALL rows in ALL tables');
  sql.push('-- Consider running in a transaction for large datasets');
  sql.push('-- ============================================');
  sql.push('');

  // Process layers from bottom to top
  const layerCount = Math.max(...Object.values(newSchema.tables).map(t => t.layer || 0)) + 1;

  for (let layerNum = 0; layerNum < layerCount; layerNum++) {
    const tablesInLayer = Object.entries(newSchema.tables)
      .filter(([_, table]) => table.layer === layerNum)
      .map(([name, _]) => name);

    if (tablesInLayer.length === 0) continue;

    sql.push(`-- Layer ${layerNum}: ${tablesInLayer.join(', ')}`);
    sql.push('');

    for (const tableName of tablesInLayer) {
      const repairSQL = generateTableRepair(tableName, newSchema);
      if (repairSQL) {
        sql.push(repairSQL);
        sql.push('');
      }
    }
  }

  sql.push('-- ============================================');
  sql.push('-- END AGGREGATION REPAIR SCRIPT');
  sql.push('-- ============================================');

  return sql;
}

/**
 * Generate repair UPDATE statement for a single table
 */
function generateTableRepair(tableName: string, newSchema: NewSchema): string | null {
  const table = newSchema.tables[tableName];
  if (!table || !table.columns) {
    return null;
  }

  const setClauses: string[] = [];

  // First pass: Collect formula columns
  const formulaColumns: [string, any][] = [];
  const aggregationColumns: [string, any][] = [];

  for (const [colName, colDef] of Object.entries(table.columns)) {
    if (colDef.formula) {
      formulaColumns.push([colName, colDef]);
    } else if (colDef.automationType && colDef.automationType !== 'SYNC') {
      aggregationColumns.push([colName, colDef]);
    }
    // Skip SYNC columns - they should pull from parent, not be calculated here
  }

  // Process formulas first (they may be dependencies for aggregations)
  for (const [colName, colDef] of formulaColumns) {
    // Formulas need to be qualified with table name for UPDATE context
    const formulaSQL = qualifyFormulaForUpdate(colDef.formula, tableName, table.columns || {});
    setClauses.push(`  "${colName}" = ${formulaSQL}`);
  }

  // Process aggregations
  for (const [colName, colDef] of aggregationColumns) {
    const subquery = convertAutomationToSubquery(tableName, colDef, newSchema);
    if (subquery) {
      setClauses.push(`  "${colName}" = ${subquery}`);
    }
  }

  if (setClauses.length === 0) {
    return null;
  }

  const lines: string[] = [];
  lines.push(`-- Repair ${tableName} (${setClauses.length} columns)`);
  lines.push(`UPDATE "${tableName}"`);
  lines.push(`SET`);
  lines.push(setClauses.join(',\n'));
  lines.push(`;`);

  return lines.join('\n');
}

/**
 * Convert automation expression to SQL subquery
 *
 * Examples:
 *   COUNT ledger.ledger_id → (SELECT COUNT("ledger_id") FROM "ledger" WHERE "batch_id" = "batches"."batch_id")
 *   SUM ledger.amount → (SELECT SUM("amount") FROM "ledger" WHERE "batch_id" = "batches"."batch_id")
 *   MAX ledger.date → (SELECT MAX("date") FROM "ledger" WHERE "batch_id" = "batches"."batch_id")
 */
function convertAutomationToSubquery(
  parentTableName: string,
  colDef: any,
  newSchema: NewSchema
): string | null {
  const automationType = colDef.automationType; // SUM, COUNT, MAX, MIN
  const sourceTable = colDef.automationSourceTable;
  const sourceColumn = colDef.automationSourceColumn || '';
  const fkColumn = colDef.automationFKColumn;

  if (!automationType || !sourceTable) {
    return null;
  }

  // Get the parent table's PK (for the WHERE clause correlation)
  const parentTable = newSchema.tables[parentTableName];
  const parentPK = parentTable?.pkColumn;
  if (!parentPK) {
    return null;
  }

  // Find the FK column if not explicitly specified
  let childFKColumn = fkColumn;
  if (!childFKColumn) {
    const childTable = newSchema.tables[sourceTable];
    if (childTable?.foreignKeys) {
      for (const fk of Object.values(childTable.foreignKeys)) {
        if (fk.parentTable === parentTableName) {
          childFKColumn = fk.childColumn;
          break;
        }
      }
    }
  }

  if (!childFKColumn) {
    return null;
  }

  // Build the aggregate function call
  let aggFunc: string;
  if (automationType === 'COUNT') {
    aggFunc = `COUNT("${sourceColumn}")`;
  } else if (automationType === 'SUM') {
    aggFunc = `SUM("${sourceColumn}")`;
  } else if (automationType === 'MIN') {
    aggFunc = `MIN("${sourceColumn}")`;
  } else if (automationType === 'MAX') {
    aggFunc = `MAX("${sourceColumn}")`;
  } else {
    return null;
  }

  // Build the subquery
  const subquery = `(SELECT ${aggFunc} FROM "${sourceTable}" WHERE "${childFKColumn}" = "${parentTableName}"."${parentPK}")`;

  // Wrap with COALESCE for appropriate default values
  // COUNT should default to 0, numeric SUM should default to 0, MIN/MAX can be NULL
  if (automationType === 'COUNT') {
    return `COALESCE(${subquery}, 0)`;
  } else if (automationType === 'SUM' && colDef.nullable === false) {
    // Only default SUM to 0 if column is NOT NULL
    return `COALESCE(${subquery}, 0)`;
  } else {
    // MIN/MAX or nullable SUM can remain NULL
    return subquery;
  }
}

/**
 * Qualify formula expressions with table name for UPDATE context
 *
 * In UPDATE statements, bare column names refer to the current row's values.
 * For formulas, we need to use table-qualified names like "tablename"."column"
 *
 * Example: amount * 2 → "ledger"."amount" * 2
 */
function qualifyFormulaForUpdate(formula: string, tableName: string, columns: Record<string, any>): string {
  // Get all column names from the table, sorted by length (longest first to avoid partial matches)
  const columnNames = Object.keys(columns).sort((a, b) => b.length - a.length);

  // Helper to escape regex special characters
  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  let rewritten = formula;

  // Replace each column name with table-qualified version
  for (const colName of columnNames) {
    // Use word boundaries to match whole column names only
    const regex = new RegExp(`\\b${escapeRegex(colName)}\\b`, 'gi');
    rewritten = rewritten.replace(regex, `"${tableName}"."${colName}"`);
  }

  return rewritten;
}
