import type { NewSchemaDiff } from '../newschema-diff.js';
import type { ColumnDef } from '../new-schema-subtypes.js';

/**
 * Build ALTER COLUMN statements for modifying an existing column
 * PostgreSQL requires separate ALTER statements for different modifications
 * Returns array of ALTER statements
 */
function buildAlterColumnDDL(
  tableName: string,
  columnName: string,
  oldCol: ColumnDef,
  newCol: ColumnDef
): string[] {
  const statements: string[] = [];

  // Build new type string
  let newType = newCol.type;
  if (newCol.character_maximum_length !== undefined) {
    newType += `(${newCol.character_maximum_length})`;
  } else if (newCol.numeric_precision !== undefined) {
    if (newCol.numeric_scale !== undefined) {
      newType += `(${newCol.numeric_precision},${newCol.numeric_scale})`;
    } else {
      newType += `(${newCol.numeric_precision})`;
    }
  }

  // Check if type changed
  let oldType = oldCol.type;
  if (oldCol.character_maximum_length !== undefined) {
    oldType += `(${oldCol.character_maximum_length})`;
  } else if (oldCol.numeric_precision !== undefined) {
    if (oldCol.numeric_scale !== undefined) {
      oldType += `(${oldCol.numeric_precision},${oldCol.numeric_scale})`;
    } else {
      oldType += `(${oldCol.numeric_precision})`;
    }
  }

  if (newType !== oldType) {
    statements.push(
      `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" TYPE ${newType};`
    );
  }

  // Check if nullability changed
  if (oldCol.nullable !== newCol.nullable) {
    if (newCol.nullable === false) {
      statements.push(
        `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" SET NOT NULL;`
      );
    } else {
      statements.push(
        `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" DROP NOT NULL;`
      );
    }
  }

  // Check if default changed
  if (oldCol.defaultValue !== newCol.defaultValue) {
    if (newCol.defaultValue !== undefined) {
      statements.push(
        `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" SET DEFAULT ${newCol.defaultValue};`
      );
    } else {
      statements.push(
        `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" DROP DEFAULT;`
      );
    }
  }

  return statements;
}

/**
 * Generate ALTER TABLE ALTER COLUMN statements for this layer
 * May generate multiple statements per column (type, nullable, default are separate operations)
 */
export function generateModifyColumnDDL(
  diff: NewSchemaDiff,
  tablesInLayer: string[]
): string[] {
  const statements: string[] = [];
  const tableSet = new Set(tablesInLayer);

  for (const op of diff.columnsToModify) {
    if (tableSet.has(op.table)) {
      // ColumnDefs are already in the diff - no schema lookups needed
      const alterStatements = buildAlterColumnDDL(
        op.table,
        op.column,
        op.oldColumnDef,
        op.newColumnDef
      );
      statements.push(...alterStatements);
    }
  }

  return statements;
}
