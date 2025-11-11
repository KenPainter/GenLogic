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
 *
 * Note: Push to parents moved to AFTER INSERT for consistency and to prevent
 *       potential trigger recursion in complex automation scenarios
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
 * Generate AFTER INSERT trigger for a table
 *
 * Sequence:
 * 1. Push to parents - Update aggregation columns (SUM/COUNT/MAX/MIN) in parent tables
 *
 * Note: Aggregations moved to AFTER INSERT for consistency with UPDATE/DELETE
 *       and to prevent trigger recursion in complex automation scenarios
 */
function generateAfterInsertTrigger(
  tableName: string,
  newSchema: NewSchema
): string | null {
  const table = newSchema.tables[tableName];
  if (!table) {
    return null;
  }

  const sections: string[] = [];

  // Step 1: Push to parents (aggregations)
  const pushCode = generatePushToParents(tableName, newSchema, 'INSERT');
  if (pushCode.length > 0) {
    sections.push(pushCode.join('\n'));
  }

  // If no operations needed, don't create trigger
  if (sections.length === 0) {
    return null;
  }

  const functionName = `${tableName}_after_insert_genlogic`;
  const triggerName = `${tableName}_after_insert_genlogic`;

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
  AFTER INSERT ON "${tableName}"
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
 *
 * Note: Push to children (SYNC) and push to parents (aggregations) moved to AFTER UPDATE
 *       trigger to prevent trigger recursion when SYNC columns interact with formulas
 *       and aggregations
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
 * Generate AFTER UPDATE trigger for a table
 *
 * Sequence:
 * 1. Push to children - Update SYNC columns in child tables if parent columns changed
 *                       (SNAPSHOT is intentionally excluded - values frozen at capture time)
 * 2. Push to parents - Update aggregation columns (SUM/COUNT/MAX/MIN) in parent tables
 *
 * Note: Both push operations moved to AFTER UPDATE to prevent trigger recursion.
 *       Parent row mutation completes before any cascading updates occur.
 */
function generateAfterUpdateTrigger(
  tableName: string,
  newSchema: NewSchema
): string | null {
  const table = newSchema.tables[tableName];
  if (!table) {
    return null;
  }

  const sections: string[] = [];

  // Step 1: Push to children (SYNC)
  const pushToChildrenCode = generatePushToChildren(tableName, newSchema);
  if (pushToChildrenCode.length > 0) {
    sections.push(pushToChildrenCode.join('\n'));
  }

  // Step 2: Push to parents (aggregations)
  const pushCode = generatePushToParents(tableName, newSchema, 'UPDATE');
  if (pushCode.length > 0) {
    sections.push(pushCode.join('\n'));
  }

  // If no operations needed, don't create trigger
  if (sections.length === 0) {
    return null;
  }

  const functionName = `${tableName}_after_update_genlogic`;
  const triggerName = `${tableName}_after_update_genlogic`;

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
  AFTER UPDATE ON "${tableName}"
  FOR EACH ROW EXECUTE FUNCTION ${functionName}();
`.trim();
}

/**
 * Generate AFTER DELETE trigger for a table
 *
 * Sequence:
 * 1. Push to parents - Decrement COUNT, reduce SUM, recalculate MAX/MIN in parent tables
 *
 * Note: Aggregations moved to AFTER DELETE to ensure MIN/MAX recalculations
 *       see the post-mutation state of the table (critical for subqueries)
 */
function generateAfterDeleteTrigger(
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

  const functionName = `${tableName}_after_delete_genlogic`;
  const triggerName = `${tableName}_after_delete_genlogic`;

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
  AFTER DELETE ON "${tableName}"
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

    // Generate AFTER INSERT trigger (for aggregations)
    const afterInsertTrigger = generateAfterInsertTrigger(tableName, newSchema);
    if (afterInsertTrigger) {
      statements.push(afterInsertTrigger);
    }

    // Generate BEFORE UPDATE trigger
    const beforeUpdateTrigger = generateBeforeUpdateTrigger(tableName, newSchema);
    if (beforeUpdateTrigger) {
      statements.push(beforeUpdateTrigger);
    }

    // Generate AFTER UPDATE trigger (for push operations)
    const afterUpdateTrigger = generateAfterUpdateTrigger(tableName, newSchema);
    if (afterUpdateTrigger) {
      statements.push(afterUpdateTrigger);
    }

    // Generate AFTER DELETE trigger (for aggregations)
    const afterDeleteTrigger = generateAfterDeleteTrigger(tableName, newSchema);
    if (afterDeleteTrigger) {
      statements.push(afterDeleteTrigger);
    }
  }

  return statements;
}
