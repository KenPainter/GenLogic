import type { NewSchema } from '../../new-schema.js';

/**
 * Generate PL/pgSQL code to update aggregation columns in parent tables
 *
 * For BEFORE INSERT: Increment COUNT, add to SUM, recalculate MAX/MIN
 * For BEFORE UPDATE: Adjust aggregations if source column or FK changed
 * For BEFORE DELETE: Decrement COUNT, subtract from SUM, recalculate MAX/MIN
 *
 * Note: WHERE clauses on automations are NOT supported. To achieve filtered aggregations,
 * use formula columns that compute 1/0 values and SUM them instead of COUNT.
 *
 * Example: Parent table "accounts" has column "balance" with automation:
 *   automation: SUM transactions.amount
 * When a transaction is inserted/updated/deleted, we need to update accounts.balance
 */
export function generatePushToParents(
  tableName: string,
  newSchema: NewSchema,
  triggerType: 'INSERT' | 'UPDATE' | 'DELETE'
): string[] {
  const table = newSchema.tables[tableName];
  if (!table) {
    return [];
  }

  const lines: string[] = [];

  // Find all parent tables that have aggregation columns sourced from this table
  for (const [parentTableName, parentTable] of Object.entries(newSchema.tables)) {
    if (!parentTable.columns) continue;

    for (const [parentCol, parentColDef] of Object.entries(parentTable.columns)) {
      if (!parentColDef.automationType || !parentColDef.automationSourceTable) {
        continue;
      }

      // Skip if this aggregation doesn't source from current table
      if (parentColDef.automationSourceTable !== tableName) {
        continue;
      }

      const operation = parentColDef.automationType;
      const sourceColumn = parentColDef.automationSourceColumn;
      const explicitFKColumn = parentColDef.automationFKColumn;

      // Find FK column from this table to parent table
      let fkColumn: string | undefined;
      if (explicitFKColumn) {
        fkColumn = explicitFKColumn;
      } else {
        for (const fk of Object.values(table.foreignKeys || {})) {
          if (fk.parentTable === parentTableName) {
            fkColumn = fk.childColumn;
            break;
          }
        }
      }

      if (!fkColumn) {
        continue;
      }

      // Get parent table's PK
      const parentPK = parentTable.pkColumn;
      if (!parentPK) {
        continue;
      }

      // Generate code based on operation type and trigger type
      if (operation === 'SUM') {
        if (triggerType === 'INSERT') {
          lines.push(`  -- Update SUM in ${parentTableName}.${parentCol}`);
          lines.push(`  UPDATE "${parentTableName}"`);
          lines.push(`  SET "${parentCol}" = "${parentCol}" + NEW."${sourceColumn}"`);
          lines.push(`  WHERE "${parentPK}" = NEW."${fkColumn}";`);
        } else if (triggerType === 'UPDATE') {
          lines.push(`  -- Update SUM in ${parentTableName}.${parentCol}`);
          lines.push(`  IF NEW."${sourceColumn}" IS DISTINCT FROM OLD."${sourceColumn}" OR NEW."${fkColumn}" IS DISTINCT FROM OLD."${fkColumn}" THEN`);
          lines.push(`    -- Subtract old value from old parent`);
          lines.push(`    UPDATE "${parentTableName}"`);
          lines.push(`    SET "${parentCol}" = "${parentCol}" - OLD."${sourceColumn}"`);
          lines.push(`    WHERE "${parentPK}" = OLD."${fkColumn}";`);
          lines.push(`    -- Add new value to new parent`);
          lines.push(`    UPDATE "${parentTableName}"`);
          lines.push(`    SET "${parentCol}" = "${parentCol}" + NEW."${sourceColumn}"`);
          lines.push(`    WHERE "${parentPK}" = NEW."${fkColumn}";`);
          lines.push(`  END IF;`);
        } else if (triggerType === 'DELETE') {
          lines.push(`  -- Update SUM in ${parentTableName}.${parentCol}`);
          lines.push(`  UPDATE "${parentTableName}"`);
          lines.push(`  SET "${parentCol}" = "${parentCol}" - OLD."${sourceColumn}"`);
          lines.push(`  WHERE "${parentPK}" = OLD."${fkColumn}";`);
        }
      } else if (operation === 'COUNT') {
        if (triggerType === 'INSERT') {
          lines.push(`  -- Update COUNT in ${parentTableName}.${parentCol}`);
          lines.push(`  UPDATE "${parentTableName}"`);
          lines.push(`  SET "${parentCol}" = "${parentCol}" + 1`);
          lines.push(`  WHERE "${parentPK}" = NEW."${fkColumn}";`);
        } else if (triggerType === 'UPDATE') {
          // Only update if FK changed (moving row to different parent)
          lines.push(`  -- Update COUNT in ${parentTableName}.${parentCol}`);
          lines.push(`  IF NEW."${fkColumn}" IS DISTINCT FROM OLD."${fkColumn}" THEN`);
          lines.push(`    -- Decrement old parent`);
          lines.push(`    UPDATE "${parentTableName}"`);
          lines.push(`    SET "${parentCol}" = "${parentCol}" - 1`);
          lines.push(`    WHERE "${parentPK}" = OLD."${fkColumn}";`);
          lines.push(`    -- Increment new parent`);
          lines.push(`    UPDATE "${parentTableName}"`);
          lines.push(`    SET "${parentCol}" = "${parentCol}" + 1`);
          lines.push(`    WHERE "${parentPK}" = NEW."${fkColumn}";`);
          lines.push(`  END IF;`);
        } else if (triggerType === 'DELETE') {
          lines.push(`  -- Update COUNT in ${parentTableName}.${parentCol}`);
          lines.push(`  UPDATE "${parentTableName}"`);
          lines.push(`  SET "${parentCol}" = "${parentCol}" - 1`);
          lines.push(`  WHERE "${parentPK}" = OLD."${fkColumn}";`);
        }
      } else if (operation === 'MAX') {
        if (triggerType === 'INSERT') {
          lines.push(`  -- Update MAX in ${parentTableName}.${parentCol}`);
          lines.push(`  UPDATE "${parentTableName}"`);
          lines.push(`  SET "${parentCol}" = GREATEST("${parentCol}", NEW."${sourceColumn}")`);
          lines.push(`  WHERE "${parentPK}" = NEW."${fkColumn}";`);
        } else if (triggerType === 'UPDATE') {
          lines.push(`  -- Update MAX in ${parentTableName}.${parentCol}`);
          lines.push(`  IF NEW."${sourceColumn}" IS DISTINCT FROM OLD."${sourceColumn}" OR NEW."${fkColumn}" IS DISTINCT FROM OLD."${fkColumn}" THEN`);
          lines.push(`    -- Recalculate MAX for old parent (if we were the max)`);
          lines.push(`    UPDATE "${parentTableName}"`);
          lines.push(`    SET "${parentCol}" = (SELECT MAX("${sourceColumn}") FROM "${tableName}" WHERE "${fkColumn}" = OLD."${fkColumn}")`);
          lines.push(`    WHERE "${parentPK}" = OLD."${fkColumn}";`);
          lines.push(`    -- Update MAX for new parent`);
          lines.push(`    UPDATE "${parentTableName}"`);
          lines.push(`    SET "${parentCol}" = GREATEST("${parentCol}", NEW."${sourceColumn}")`);
          lines.push(`    WHERE "${parentPK}" = NEW."${fkColumn}";`);
          lines.push(`  END IF;`);
        } else if (triggerType === 'DELETE') {
          lines.push(`  -- Update MAX in ${parentTableName}.${parentCol} (recalculate if we were the max)`);
          lines.push(`  IF OLD."${sourceColumn}" = (SELECT "${parentCol}" FROM "${parentTableName}" WHERE "${parentPK}" = OLD."${fkColumn}") THEN`);
          lines.push(`    UPDATE "${parentTableName}"`);
          lines.push(`    SET "${parentCol}" = (SELECT MAX("${sourceColumn}") FROM "${tableName}" WHERE "${fkColumn}" = OLD."${fkColumn}")`);
          lines.push(`    WHERE "${parentPK}" = OLD."${fkColumn}";`);
          lines.push(`  END IF;`);
        }
      } else if (operation === 'MIN') {
        if (triggerType === 'INSERT') {
          lines.push(`  -- Update MIN in ${parentTableName}.${parentCol}`);
          lines.push(`  UPDATE "${parentTableName}"`);
          lines.push(`  SET "${parentCol}" = LEAST("${parentCol}", NEW."${sourceColumn}")`);
          lines.push(`  WHERE "${parentPK}" = NEW."${fkColumn}";`);
        } else if (triggerType === 'UPDATE') {
          lines.push(`  -- Update MIN in ${parentTableName}.${parentCol}`);
          lines.push(`  IF NEW."${sourceColumn}" IS DISTINCT FROM OLD."${sourceColumn}" OR NEW."${fkColumn}" IS DISTINCT FROM OLD."${fkColumn}" THEN`);
          lines.push(`    -- Recalculate MIN for old parent (if we were the min)`);
          lines.push(`    UPDATE "${parentTableName}"`);
          lines.push(`    SET "${parentCol}" = (SELECT MIN("${sourceColumn}") FROM "${tableName}" WHERE "${fkColumn}" = OLD."${fkColumn}")`);
          lines.push(`    WHERE "${parentPK}" = OLD."${fkColumn}";`);
          lines.push(`    -- Update MIN for new parent`);
          lines.push(`    UPDATE "${parentTableName}"`);
          lines.push(`    SET "${parentCol}" = LEAST("${parentCol}", NEW."${sourceColumn}")`);
          lines.push(`    WHERE "${parentPK}" = NEW."${fkColumn}";`);
          lines.push(`  END IF;`);
        } else if (triggerType === 'DELETE') {
          lines.push(`  -- Update MIN in ${parentTableName}.${parentCol} (recalculate if we were the min)`);
          lines.push(`  IF OLD."${sourceColumn}" = (SELECT "${parentCol}" FROM "${parentTableName}" WHERE "${parentPK}" = OLD."${fkColumn}") THEN`);
          lines.push(`    UPDATE "${parentTableName}"`);
          lines.push(`    SET "${parentCol}" = (SELECT MIN("${sourceColumn}") FROM "${tableName}" WHERE "${fkColumn}" = OLD."${fkColumn}")`);
          lines.push(`    WHERE "${parentPK}" = OLD."${fkColumn}";`);
          lines.push(`  END IF;`);
        }
      }
    }
  }

  return lines;
}
