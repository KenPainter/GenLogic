import type { NewSchemaDiff } from '../newschema-diff.js';
import type { ForeignKeyDef } from '../new-schema-subtypes.js';

/**
 * Generate DROP CONSTRAINT statements for foreign keys
 * Handles two sources:
 * 1. foreignKeysToDrop - FKs being removed from schema
 * 2. foreignKeysToModify - FKs being changed (drop old, will add new later)
 */
export function generateDropForeignKeyDDL(
  diff: NewSchemaDiff,
  tablesInLayer: string[]
): string[] {
  const statements: string[] = [];
  const tableSet = new Set(tablesInLayer);

  // Drop FKs being removed
  for (const op of diff.foreignKeysToDrop) {
    if (tableSet.has(op.table)) {
      statements.push(
        `ALTER TABLE "${op.table}" DROP CONSTRAINT "${op.fkName}";`
      );
    }
  }

  // Drop old FKs being modified (will add new definition later)
  for (const op of diff.foreignKeysToModify) {
    if (tableSet.has(op.table)) {
      statements.push(
        `ALTER TABLE "${op.table}" DROP CONSTRAINT "${op.fkName}";`
      );
    }
  }

  return statements;
}

/**
 * Build ADD CONSTRAINT statement for a foreign key
 */
function buildAddForeignKeyDDL(tableName: string, fk: ForeignKeyDef): string {
  // Map deleteAction to SQL clause
  let onDeleteClause = '';
  if (fk.deleteAction) {
    const action = fk.deleteAction.toUpperCase().replace('_', ' '); // "set_null" -> "SET NULL"
    onDeleteClause = ` ON DELETE ${action}`;
  }

  return (
    `ALTER TABLE "${tableName}" ` +
    `ADD CONSTRAINT "${fk.name}" ` +
    `FOREIGN KEY ("${fk.childColumn}") ` +
    `REFERENCES "${fk.parentTable}" ("${fk.parentColumn}")` +
    `${onDeleteClause};`
  );
}

/**
 * Generate ADD CONSTRAINT statements for foreign keys
 * Handles two sources:
 * 1. foreignKeysToAdd - New FKs being added to schema
 * 2. foreignKeysToModify - FKs being changed (add new definition after dropping old)
 */
export function generateAddForeignKeyDDL(
  diff: NewSchemaDiff,
  tablesInLayer: string[]
): string[] {
  const statements: string[] = [];
  const tableSet = new Set(tablesInLayer);

  // Add new FKs
  for (const op of diff.foreignKeysToAdd) {
    if (tableSet.has(op.table)) {
      statements.push(buildAddForeignKeyDDL(op.table, op.fk));
    }
  }

  // Add modified FKs (with new definition)
  for (const op of diff.foreignKeysToModify) {
    if (tableSet.has(op.table)) {
      statements.push(buildAddForeignKeyDDL(op.table, op.newFk));
    }
  }

  return statements;
}
