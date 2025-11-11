import type { NewSchema } from '../../new-schema.js';

/**
 * Generate PL/pgSQL code to initialize aggregation columns on parent INSERT
 *
 * This prevents users from inserting bogus aggregation values that would persist
 * because SUM and COUNT use delta updates rather than full recalculation.
 *
 * Initialization values:
 * - SUM: 0 (additive aggregation, no children = 0 sum)
 * - COUNT: 0 (no children = 0 count)
 * - MAX: NULL (SQL semantics: MAX of empty set is NULL)
 * - MIN: NULL (SQL semantics: MIN of empty set is NULL)
 */
export function generateInitializeAggregations(
  tableName: string,
  newSchema: NewSchema
): string[] {
  const table = newSchema.tables[tableName];
  if (!table || !table.columns) {
    return [];
  }

  const lines: string[] = [];
  const aggregationColumns: Array<{ colName: string; operation: string }> = [];

  // Find all aggregation columns in this table
  for (const [colName, colDef] of Object.entries(table.columns)) {
    if (colDef.automation && colDef.automationType) {
      const operation = colDef.automationType;
      if (operation === 'SUM' || operation === 'COUNT' || operation === 'MAX' || operation === 'MIN') {
        aggregationColumns.push({ colName, operation });
      }
    }
  }

  // If no aggregations, return empty
  if (aggregationColumns.length === 0) {
    return [];
  }

  // Generate initialization code
  lines.push('  -- Initialize aggregations to empty-state values');
  for (const { colName, operation } of aggregationColumns) {
    if (operation === 'SUM' || operation === 'COUNT') {
      lines.push(`  NEW."${colName}" := 0;`);
    } else if (operation === 'MAX' || operation === 'MIN') {
      lines.push(`  NEW."${colName}" := NULL;`);
    }
  }

  return lines;
}
