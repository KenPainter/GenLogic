import type { NewSchema } from '../../new-schema.js';

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrite formula expression to qualify column references with NEW.
 *
 * User formulas are written as plain SQL: "debits - credits"
 * In triggers, we need: "NEW.debits - NEW.credits"
 *
 * Strategy: Replace each column name (with word boundaries) with NEW."column_name"
 * Process longest column names first to avoid partial matches.
 */
function rewriteFormulaForTrigger(
  formula: string,
  columnNames: string[]
): string {
  // Sort by length descending to handle columns with common prefixes
  // e.g., process "amount_input" before "amount"
  const sortedColumns = [...columnNames].sort((a, b) => b.length - a.length);

  let rewritten = formula;
  for (const colName of sortedColumns) {
    // Match column name with word boundaries (case-insensitive)
    const regex = new RegExp(`\\b${escapeRegex(colName)}\\b`, 'gi');
    rewritten = rewritten.replace(regex, `NEW."${colName}"`);
  }

  return rewritten;
}

/**
 * Generate PL/pgSQL code to calculate formula columns
 *
 * Formula columns are ALWAYS recalculated on both INSERT and UPDATE.
 * This is simpler, faster, and more correct than tracking dependencies.
 *
 * Formula columns are evaluated in dependency order (stored in table.columnLayers)
 * Layer 0 formulas depend only on base columns
 * Layer 1 formulas may depend on Layer 0 formulas, etc.
 *
 * Example formula in YAML: "debits - credits"
 * Generated trigger code: NEW."balance" := NEW."debits" - NEW."credits";
 *
 * Performance note: Always recalculating is faster than checking dependencies.
 * Cascade prevention: push-to-parents checks if values actually changed before propagating.
 */
export function generateCalculateFormulas(
  tableName: string,
  newSchema: NewSchema,
  triggerType: 'INSERT' | 'UPDATE'
): string[] {
  const table = newSchema.tables[tableName];
  if (!table || !table.columns || !table.columnLayers) {
    return [];
  }

  const lines: string[] = [];

  // Get all column names for formula rewriting
  const columnNames = Object.keys(table.columns);

  // Process formula columns in layer order
  const layerNumbers = Object.keys(table.columnLayers).map(Number).sort((a, b) => a - b);

  for (const layerNum of layerNumbers) {
    const columnsInLayer = table.columnLayers[layerNum];
    if (!columnsInLayer) continue;

    for (const colName of columnsInLayer) {
      const colDef = table.columns[colName];
      if (!colDef || !colDef.formula) {
        continue;
      }

      // Rewrite formula to qualify column references with NEW.
      const rewrittenFormula = rewriteFormulaForTrigger(colDef.formula, columnNames);

      // Always calculate - simpler and faster than checking dependencies
      lines.push(`  -- Formula: ${colName}`);
      lines.push(`  NEW."${colName}" := ${rewrittenFormula};`);
    }
  }

  return lines;
}
