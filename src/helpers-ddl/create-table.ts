import type { NewSchemaDiff } from '../newschema-diff.js';
import type { NewSchema } from '../new-schema.js';
import type { ColumnDef } from '../new-schema-subtypes.js';
import { buildColumnTypeString, formatDefaultValue } from './build-column-type.js';

/**
 * Build column DDL for CREATE TABLE statements
 * Includes all modifiers: type, size, NOT NULL, DEFAULT, PRIMARY KEY
 */
function buildColumnDDL(col: ColumnDef): string {
  // Build the type string (type + size/precision)
  let ddl = buildColumnTypeString(col);

  // Add NOT NULL (nullable: false means NOT NULL)
  if (col.nullable === false) {
    ddl += ' not null';
  }

  // Add DEFAULT (but NOT for serial - the nextval is implicit)
  if (!col.serial && col.defaultValue !== undefined) {
    ddl += ` default ${formatDefaultValue(col)}`;
  }

  // Add PRIMARY KEY
  if (col.isPrimaryKey) {
    ddl += ' primary key';
  }

  return ddl;
}

/**
 * Find the serial column in a table (if any)
 * Used for setting sequence starting value
 */
function findSerialColumn(tableDef: { columns?: Record<string, ColumnDef> }): string | null {
  if (!tableDef.columns) {
    return null;
  }

  for (const [colName, colDef] of Object.entries(tableDef.columns)) {
    if (colDef.serial) {
      return colName;
    }
  }

  return null;
}

/**
 * Generate CREATE TABLE statements for tables in this layer
 * For tables with serial columns, also sets sequence to start at 100
 * to leave room for system seed rows (1-99)
 */
export function generateCreateTableDDL(
  diff: NewSchemaDiff,
  schema: NewSchema,
  tablesInLayer: string[]
): string[] {
  const statements: string[] = [];
  const tableSet = new Set(tablesInLayer);

  for (const tableName of diff.tablesToCreate) {
    if (tableSet.has(tableName)) {
      const tableDef = schema.tables[tableName];
      const columns: string[] = [];

      // Build column definitions from individual properties
      for (const [colName, colDef] of Object.entries(tableDef.columns || {})) {
        const columnDDL = buildColumnDDL(colDef);
        columns.push(`  "${colName}" ${columnDDL}`);
      }

      statements.push(`CREATE TABLE "${tableName}" (\n${columns.join(',\n')}\n);`);

      // Initialize serial sequence to 100 to reserve 1-99 for seed rows
      const serialColumn = findSerialColumn(tableDef);
      if (serialColumn) {
        const sequenceName = `${tableName}_${serialColumn}_seq`;
        statements.push(`SELECT setval('${sequenceName}', 100, false);`);
      }
    }
  }

  return statements;
}
