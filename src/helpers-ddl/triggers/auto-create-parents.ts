import type { NewSchema } from '../../new-schema.js';

/**
 * Generate PL/pgSQL code to auto-create parent rows
 *
 * For BEFORE INSERT: If FK references non-existent parent and autoCreateParent is true, create parent
 * For BEFORE UPDATE: If FK changed and references non-existent parent and autoCreateParent is true, create parent
 *
 * Example: Child table "transactions" has FK to "accounts" with auto create parent
 * If user inserts transaction with account_id = 100 and account 100 doesn't exist,
 * automatically create account row with account_id = 100
 *
 * Important: Only auto-creates when FK value is NOT NULL. If FK is NULL, no parent is created.
 *
 * Generated code:
 *   IF NEW.account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounts WHERE account_id = NEW.account_id) THEN
 *     INSERT INTO accounts (account_id) VALUES (NEW.account_id);
 *   END IF;
 */
export function generateAutoCreateParents(
  tableName: string,
  newSchema: NewSchema,
  triggerType: 'INSERT' | 'UPDATE'
): string[] {
  const table = newSchema.tables[tableName];
  if (!table || !table.foreignKeys) {
    return [];
  }

  const lines: string[] = [];

  // Find all FKs with autoCreateParent enabled
  for (const fk of Object.values(table.foreignKeys)) {
    if (!fk.autoCreateParent) {
      continue;
    }

    const parentTable = fk.parentTable;
    const childColumn = fk.childColumn;
    const parentColumn = fk.parentColumn;

    if (triggerType === 'UPDATE') {
      // Only auto-create if FK changed and is not NULL
      lines.push(`  -- Auto-create parent in ${parentTable} if needed`);
      lines.push(`  IF NEW."${childColumn}" IS DISTINCT FROM OLD."${childColumn}" THEN`);
      lines.push(`    IF NEW."${childColumn}" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${parentTable}" WHERE "${parentColumn}" = NEW."${childColumn}") THEN`);
      lines.push(`      INSERT INTO "${parentTable}" ("${parentColumn}") VALUES (NEW."${childColumn}");`);
      lines.push(`    END IF;`);
      lines.push(`  END IF;`);
    } else {
      // INSERT: only auto-create if FK value is not NULL
      lines.push(`  -- Auto-create parent in ${parentTable} if needed`);
      lines.push(`  IF NEW."${childColumn}" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${parentTable}" WHERE "${parentColumn}" = NEW."${childColumn}") THEN`);
      lines.push(`    INSERT INTO "${parentTable}" ("${parentColumn}") VALUES (NEW."${childColumn}");`);
      lines.push(`  END IF;`);
    }
  }

  return lines;
}
