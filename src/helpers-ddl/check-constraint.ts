import type { NewSchemaDiff } from '../newschema-diff.js';
import type { ConstraintDef } from '../new-schema-subtypes.js';

/**
 * Generate all CHECK constraint DDL statements (drops then adds)
 * Diff compares by normalized definition, so modifications appear as drop old + add new
 */
export function generateCheckConstraintDDL(
  diff: NewSchemaDiff,
  tablesInLayer: string[]
): string[] {
  const statements: string[] = [];
  const tableSet = new Set(tablesInLayer);

  // Drop CHECK constraints
  for (const op of diff.constraintsToDrop) {
    if (tableSet.has(op.table)) {
      statements.push(
        `ALTER TABLE "${op.table}" DROP CONSTRAINT "${op.constraint.name}";`
      );
    }
  }

  // Add CHECK constraints
  for (const op of diff.constraintsToAdd) {
    if (tableSet.has(op.table)) {
      statements.push(
        `ALTER TABLE "${op.table}" ` +
        `ADD CONSTRAINT "${op.constraint.name}" ` +
        `${op.constraint.constraint_definition};`
      );
    }
  }

  return statements;
}
