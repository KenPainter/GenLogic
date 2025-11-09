import type { NewSchemaDiff } from '../newschema-diff.js';

/**
 * Generate DROP CONSTRAINT statements for PRIMARY KEY removal
 * Must happen BEFORE column modifications in layer processing
 */
export function generateDropPrimaryKeyDDL(
  diff: NewSchemaDiff,
  tablesInLayer: string[]
): string[] {
  const statements: string[] = [];
  const tableSet = new Set(tablesInLayer);

  for (const pkChange of diff.primaryKeyChanges) {
    if (tableSet.has(pkChange.table)) {
      // Only drop if there was an old PK
      if (pkChange.oldPkColumns.length > 0) {
        // PostgreSQL auto-names PK constraints as: tablename_pkey
        const constraintName = `${pkChange.table}_pkey`;
        statements.push(
          `ALTER TABLE "${pkChange.table}" DROP CONSTRAINT "${constraintName}";`
        );
      }
    }
  }

  return statements;
}

/**
 * Generate ADD PRIMARY KEY statements
 * Must happen AFTER column modifications in layer processing
 */
export function generateAddPrimaryKeyDDL(
  diff: NewSchemaDiff,
  tablesInLayer: string[]
): string[] {
  const statements: string[] = [];
  const tableSet = new Set(tablesInLayer);

  for (const pkChange of diff.primaryKeyChanges) {
    if (tableSet.has(pkChange.table)) {
      // Only add if there is a new PK
      if (pkChange.newPkColumns.length > 0) {
        const columnList = pkChange.newPkColumns.map(col => `"${col}"`).join(', ');
        statements.push(
          `ALTER TABLE "${pkChange.table}" ADD PRIMARY KEY (${columnList});`
        );
      }
    }
  }

  return statements;
}
