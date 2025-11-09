import type { NewSchemaDiff } from '../newschema-diff.js';
import type { UniqueConstraintDef } from '../new-schema-subtypes.js';

/**
 * Generate all UNIQUE constraint DDL statements (drops then adds)
 * Diff compares by normalized definition (sorted column list), so modifications appear as drop old + add new
 */
export function generateUniqueConstraintDDL(
  diff: NewSchemaDiff,
  tablesInLayer: string[]
): string[] {
  const statements: string[] = [];
  const tableSet = new Set(tablesInLayer);

  // Drop UNIQUE constraints
  for (const op of diff.uniqueConstraintsToDrop) {
    if (tableSet.has(op.table)) {
      statements.push(
        `ALTER TABLE "${op.table}" DROP CONSTRAINT "${op.constraintName}";`
      );
    }
  }

  // Add UNIQUE constraints
  for (const op of diff.uniqueConstraintsToAdd) {
    if (tableSet.has(op.table)) {
      const columnList = op.constraint.columns.map(col => `"${col}"`).join(', ');
      statements.push(
        `ALTER TABLE "${op.table}" ` +
        `ADD CONSTRAINT "${op.constraint.name}" ` +
        `UNIQUE (${columnList});`
      );
    }
  }

  return statements;
}
