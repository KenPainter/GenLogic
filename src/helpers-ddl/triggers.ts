import type { NewSchema } from '../new-schema.js';
import { generateAutoCreateParents } from './triggers/auto-create-parents.js';
import { generatePullFromParents } from './triggers/pull-from-parents.js';
import { generateCalculateFormulas } from './triggers/calculate-formulas.js';
import { generatePushToParents } from './triggers/push-to-parents.js';
import { generatePushToChildren } from './triggers/push-to-children.js';

/**
 * Trigger Generation for GenLogic Automation
 *
 * SYNC vs SNAPSHOT Implementation:
 * ================================
 * Both automation types are nearly identical - the ONLY difference is in parent UPDATE behavior:
 *
 * SYNC:
 *   - INSERT: Pull from parent ✓ (pull-from-parents.ts)
 *   - UPDATE (FK changes): Pull from new parent ✓ (pull-from-parents.ts)
 *   - UPDATE (parent value changes): Push to children ✓ (push-to-children.ts)
 *
 * SNAPSHOT:
 *   - INSERT: Pull from parent ✓ (pull-from-parents.ts)
 *   - UPDATE (FK changes): Pull from new parent ✓ (pull-from-parents.ts)
 *   - UPDATE (parent value changes): Do nothing ✗ (excluded from push-to-children.ts)
 *
 * Implementation:
 * - pull-from-parents.ts: Handles BOTH SYNC and SNAPSHOT (line 59)
 * - push-to-children.ts: Handles ONLY SYNC (line 58 excludes SNAPSHOT)
 */

/**
 * Generate BEFORE INSERT trigger for a table
 *
 * Sequence:
 * 2. Auto-create parents - If FK references non-existent parent, create parent row
 * 3. Pull from parents - Fetch SYNC/SNAPSHOT values from parent tables via FK
 *                        (SYNC and SNAPSHOT have identical behavior on INSERT)
 * 4. Calculate formulas - Evaluate formula expressions in dependency order
 * 6. Push to parents - Update aggregation columns (SUM/COUNT/MAX/MIN) in parent tables
 */
function generateBeforeInsertTrigger(
  tableName: string,
  newSchema: NewSchema
): string | null {
  const table = newSchema.tables[tableName];
  if (!table) {
    return null;
  }

  const sections: string[] = [];

  // Step 2: Auto-create parents
  const autoCreateCode = generateAutoCreateParents(tableName, newSchema, 'INSERT');
  if (autoCreateCode.length > 0) {
    sections.push(autoCreateCode.join('\n'));
  }

  // Step 3: Pull from parents (SYNC/SNAPSHOT)
  const pullCode = generatePullFromParents(tableName, newSchema, 'INSERT');
  if (pullCode.length > 0) {
    sections.push(pullCode.join('\n'));
  }

  // Step 4: Calculate formulas
  const formulaCode = generateCalculateFormulas(tableName, newSchema, 'INSERT');
  if (formulaCode.length > 0) {
    sections.push(formulaCode.join('\n'));
  }

  // Step 6: Push to parents (aggregations)
  const pushCode = generatePushToParents(tableName, newSchema, 'INSERT');
  if (pushCode.length > 0) {
    sections.push(pushCode.join('\n'));
  }

  // If no operations needed, don't create trigger
  if (sections.length === 0) {
    return null;
  }

  const functionName = `${tableName}_before_insert_genlogic`;
  const triggerName = `${tableName}_before_insert_genlogic`;

  return `
CREATE OR REPLACE FUNCTION ${functionName}()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
${sections.join('\n\n')}

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ${triggerName}
  BEFORE INSERT ON "${tableName}"
  FOR EACH ROW EXECUTE FUNCTION ${functionName}();
`.trim();
}

/**
 * Generate BEFORE UPDATE trigger for a table
 *
 * Sequence:
 * 2. Auto-create parents - If FK changed to reference non-existent parent, create parent row
 * 3. Pull from parents - Re-fetch SYNC/SNAPSHOT values if FK changed
 *                        (SYNC and SNAPSHOT have identical behavior on FK changes)
 * 4. Recalculate formulas - Evaluate formula expressions based on changed input columns
 * 5. Push to children - Update SYNC columns in child tables if parent columns changed
 *                       (SNAPSHOT is intentionally excluded - values frozen at capture time)
 * 6. Push to parents - Recalculate aggregation columns in parent tables
 */
function generateBeforeUpdateTrigger(
  tableName: string,
  newSchema: NewSchema
): string | null {
  const table = newSchema.tables[tableName];
  if (!table) {
    return null;
  }

  const sections: string[] = [];

  // Step 2: Auto-create parents
  const autoCreateCode = generateAutoCreateParents(tableName, newSchema, 'UPDATE');
  if (autoCreateCode.length > 0) {
    sections.push(autoCreateCode.join('\n'));
  }

  // Step 3: Pull from parents (SYNC/SNAPSHOT)
  const pullCode = generatePullFromParents(tableName, newSchema, 'UPDATE');
  if (pullCode.length > 0) {
    sections.push(pullCode.join('\n'));
  }

  // Step 4: Recalculate formulas
  const formulaCode = generateCalculateFormulas(tableName, newSchema, 'UPDATE');
  if (formulaCode.length > 0) {
    sections.push(formulaCode.join('\n'));
  }

  // Step 5: Push to children (SYNC)
  const pushToChildrenCode = generatePushToChildren(tableName, newSchema);
  if (pushToChildrenCode.length > 0) {
    sections.push(pushToChildrenCode.join('\n'));
  }

  // Step 6: Push to parents (aggregations)
  const pushCode = generatePushToParents(tableName, newSchema, 'UPDATE');
  if (pushCode.length > 0) {
    sections.push(pushCode.join('\n'));
  }

  // If no operations needed, don't create trigger
  if (sections.length === 0) {
    return null;
  }

  const functionName = `${tableName}_before_update_genlogic`;
  const triggerName = `${tableName}_before_update_genlogic`;

  return `
CREATE OR REPLACE FUNCTION ${functionName}()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
${sections.join('\n\n')}

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ${triggerName}
  BEFORE UPDATE ON "${tableName}"
  FOR EACH ROW EXECUTE FUNCTION ${functionName}();
`.trim();
}

/**
 * Generate BEFORE DELETE trigger for a table
 *
 * Sequence:
 * 1. Push to parents - Decrement COUNT, reduce SUM, recalculate MAX/MIN in parent tables
 */
function generateBeforeDeleteTrigger(
  tableName: string,
  newSchema: NewSchema
): string | null {
  const table = newSchema.tables[tableName];
  if (!table) {
    return null;
  }

  const sections: string[] = [];

  // Step 1: Push to parents (aggregations)
  const pushCode = generatePushToParents(tableName, newSchema, 'DELETE');
  if (pushCode.length > 0) {
    sections.push(pushCode.join('\n'));
  }

  // If no operations needed, don't create trigger
  if (sections.length === 0) {
    return null;
  }

  const functionName = `${tableName}_before_delete_genlogic`;
  const triggerName = `${tableName}_before_delete_genlogic`;

  return `
CREATE OR REPLACE FUNCTION ${functionName}()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
${sections.join('\n\n')}

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ${triggerName}
  BEFORE DELETE ON "${tableName}"
  FOR EACH ROW EXECUTE FUNCTION ${functionName}();
`.trim();
}

/**
 * Generate all triggers for tables in this layer
 * Main entry point called by processor
 */
export function generateTriggersDDL(
  newSchema: NewSchema,
  tablesInLayer: string[]
): string[] {
  const statements: string[] = [];

  for (const tableName of tablesInLayer) {
    // Generate BEFORE INSERT trigger
    const insertTrigger = generateBeforeInsertTrigger(tableName, newSchema);
    if (insertTrigger) {
      statements.push(insertTrigger);
    }

    // Generate BEFORE UPDATE trigger
    const updateTrigger = generateBeforeUpdateTrigger(tableName, newSchema);
    if (updateTrigger) {
      statements.push(updateTrigger);
    }

    // Generate BEFORE DELETE trigger
    const deleteTrigger = generateBeforeDeleteTrigger(tableName, newSchema);
    if (deleteTrigger) {
      statements.push(deleteTrigger);
    }
  }

  return statements;
}
