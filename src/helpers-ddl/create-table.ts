import type { NewSchemaDiff } from '../newschema-diff.js';
import type { NewSchema } from '../new-schema.js';
import type { ColumnDef } from '../new-schema-subtypes.js';

/**
 * Build column DDL for CREATE TABLE statements
 * Includes all modifiers: type, size, NOT NULL, DEFAULT, PRIMARY KEY
 */
function buildColumnDDL(col: ColumnDef): string {
  // Use 'serial' for serial columns, otherwise use the base type
  let ddl = col.serial ? 'serial' : col.type;

  // Add size/precision (but NOT for serial - serial doesn't have size notation)
  if (!col.serial) {
    // For character types
    if (col.character_maximum_length !== undefined) {
      ddl += `(${col.character_maximum_length})`;
    }
    // For numeric/decimal types that support precision/scale
    // NOTE: PostgreSQL integer types (smallint, integer, bigint) do NOT support precision/scale syntax
    else if (col.numeric_precision !== undefined) {
      const typesWithPrecision = ['numeric', 'decimal', 'real', 'double precision'];
      if (typesWithPrecision.includes(col.type)) {
        if (col.numeric_scale !== undefined) {
          ddl += `(${col.numeric_precision},${col.numeric_scale})`;
        } else {
          ddl += `(${col.numeric_precision})`;
        }
      }
    }
  }

  // Add NOT NULL (nullable: false means NOT NULL)
  if (col.nullable === false) {
    ddl += ' not null';
  }

  // Add DEFAULT (but NOT for serial - the nextval is implicit)
  if (!col.serial && col.defaultValue !== undefined) {
    ddl += ` default ${col.defaultValue}`;
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
