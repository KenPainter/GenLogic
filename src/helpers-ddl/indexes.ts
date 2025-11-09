import type { NewSchemaDiff } from '../newschema-diff.js';
import type { IndexDef } from '../new-schema-subtypes.js';

/**
 * Generate all index DDL statements (drops then adds)
 * Diff compares by normalized definition (sorted column list), so modifications appear as drop old + add new
 *
 * Note: Some "indexes" may actually be backing indexes for UNIQUE/PK constraints
 * Those should be handled by the constraint DDL, not here
 * We skip indexes that match constraint naming patterns
 */
export function generateIndexDDL(
  diff: NewSchemaDiff,
  tablesInLayer: string[]
): string[] {
  const statements: string[] = [];
  const tableSet = new Set(tablesInLayer);

  // Drop indexes
  // Skip constraint-backed indexes (_key, _pkey, unique_*)
  for (const op of diff.indexesToDrop) {
    if (tableSet.has(op.table)) {
      if (op.indexName.endsWith('_key') ||
          op.indexName.endsWith('_pkey') ||
          op.indexName.startsWith('unique_')) {
        continue;
      }
      statements.push(
        `DROP INDEX "${op.indexName}";`
      );
    }
  }

  // Add indexes
  // Skip constraint-backed indexes (_key, _pkey, unique_*)
  for (const op of diff.indexesToAdd) {
    if (tableSet.has(op.table)) {
      if (op.index.name.endsWith('_key') ||
          op.index.name.endsWith('_pkey') ||
          op.index.name.startsWith('unique_')) {
        continue;
      }
      const columnList = op.index.columns.map(col => `"${col}"`).join(', ');
      statements.push(
        `CREATE INDEX "${op.index.name}" ` +
        `ON "${op.table}" (${columnList});`
      );
    }
  }

  return statements;
}
