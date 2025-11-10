import type { NewSchemaDiff } from '../newschema-diff.js';
import type { ColumnDef } from '../new-schema-subtypes.js';
import { buildColumnTypeString, formatDefaultValue } from './build-column-type.js';

/**
 * Build column DDL for ALTER TABLE ADD COLUMN statements
 * Excludes PRIMARY KEY (which should be added as a separate table constraint)
 */
function buildAddColumnDDL(col: ColumnDef): string {
  // Build the type string (type + size/precision)
  let ddl = buildColumnTypeString(col);

  // Add NOT NULL
  if (col.nullable === false) {
    ddl += ' not null';
  }

  // Add DEFAULT (but NOT for serial)
  if (!col.serial && col.defaultValue !== undefined) {
    ddl += ` default ${formatDefaultValue(col)}`;
  }

  // NOTE: PRIMARY KEY is NOT included - add it as a table constraint separately

  return ddl;
}

/**
 * Generate ALTER TABLE ADD COLUMN statements for this layer
 */
export function generateAddColumnDDL(
  diff: NewSchemaDiff,
  tablesInLayer: string[]
): string[] {
  const statements: string[] = [];
  const tableSet = new Set(tablesInLayer);

  for (const op of diff.columnsToAdd) {
    if (tableSet.has(op.table)) {
      // ColumnDef is already in the diff - no schema lookup needed
      const columnDDL = buildAddColumnDDL(op.columnDef);
      statements.push(`ALTER TABLE "${op.table}" ADD COLUMN "${op.column}" ${columnDDL};`);
    }
  }

  return statements;
}
