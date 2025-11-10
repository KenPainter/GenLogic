import type { NewSchema } from '../../new-schema.js';

/**
 * Generate PL/pgSQL code to update aggregation columns in parent tables
 *
 * Aggregations are batched by (parentTable, fkColumn) to minimize database round-trips.
 *
 * Trigger Timing:
 * - INSERT: Called from BEFORE INSERT trigger (all aggregations work correctly on new rows)
 * - UPDATE: Called from AFTER UPDATE trigger (MIN/MAX need post-mutation state for subqueries)
 * - DELETE: Called from AFTER DELETE trigger (MIN/MAX need post-mutation state for subqueries)
 *
 * For INSERT: Batch all SUM/COUNT/MIN/MAX into single UPDATE per parent row
 * For UPDATE: Two paths:
 *   - FK changed: Two batched UPDATEs (subtract all from old parent, add all to new parent)
 *   - FK same: Single batched UPDATE with deltas for changed columns
 * For DELETE: Batch all operations into single UPDATE (SUM subtract, COUNT decrement, MIN/MAX recalculate)
 *
 * Note: WHERE clauses on automations are NOT supported. To achieve filtered aggregations,
 * use formula columns that compute 1/0 values and SUM them instead of COUNT.
 *
 * Performance tip: For MIN/MAX operations, consider creating an index on (fk_column, aggregated_column)
 * to speed up the recalculation subqueries.
 */

interface AggregationInfo {
  parentCol: string;
  operation: 'SUM' | 'COUNT' | 'MIN' | 'MAX';
  sourceColumn: string;
}

interface AggregationGroup {
  parentTable: string;
  parentPK: string;
  fkColumn: string;
  aggregations: AggregationInfo[];
}

export function generatePushToParents(
  tableName: string,
  newSchema: NewSchema,
  triggerType: 'INSERT' | 'UPDATE' | 'DELETE'
): string[] {
  const table = newSchema.tables[tableName];
  if (!table) {
    return [];
  }

  // Group aggregations by (parentTable, fkColumn)
  const groups = new Map<string, AggregationGroup>();

  // Scan all parent tables for aggregation columns sourced from this table
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

      const operation = parentColDef.automationType as 'SUM' | 'COUNT' | 'MIN' | 'MAX';
      const sourceColumn = parentColDef.automationSourceColumn || '';
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

      // Create or update group
      const groupKey = `${parentTableName}|${fkColumn}`;
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          parentTable: parentTableName,
          parentPK,
          fkColumn,
          aggregations: [],
        };
        groups.set(groupKey, group);
      }

      group.aggregations.push({
        parentCol,
        operation,
        sourceColumn,
      });
    }
  }

  // Generate SQL for each group
  const lines: string[] = [];

  for (const group of groups.values()) {
    if (triggerType === 'INSERT') {
      lines.push(...generateInsertUpdate(tableName, group));
    } else if (triggerType === 'DELETE') {
      lines.push(...generateDeleteUpdate(tableName, group));
    } else if (triggerType === 'UPDATE') {
      lines.push(...generateUpdateLogic(tableName, group));
    }
  }

  return lines;
}

/**
 * Generate INSERT logic: Single batched UPDATE adding/incrementing all aggregations
 */
function generateInsertUpdate(tableName: string, group: AggregationGroup): string[] {
  const lines: string[] = [];
  const setClauses: string[] = [];

  for (const agg of group.aggregations) {
    if (agg.operation === 'COUNT') {
      setClauses.push(`"${agg.parentCol}" = "${agg.parentCol}" + 1`);
    } else if (agg.operation === 'SUM') {
      setClauses.push(`"${agg.parentCol}" = "${agg.parentCol}" + NEW."${agg.sourceColumn}"`);
    } else if (agg.operation === 'MIN') {
      setClauses.push(`"${agg.parentCol}" = LEAST("${agg.parentCol}", NEW."${agg.sourceColumn}")`);
    } else if (agg.operation === 'MAX') {
      setClauses.push(`"${agg.parentCol}" = GREATEST("${agg.parentCol}", NEW."${agg.sourceColumn}")`);
    }
  }

  const columnCount = group.aggregations.length;
  const columnWord = columnCount === 1 ? 'column' : 'columns';
  lines.push(`  -- Update ${group.parentTable} aggregations (${columnCount} ${columnWord})`);
  lines.push(`  UPDATE "${group.parentTable}"`);
  lines.push(`  SET ${setClauses.join(',\n      ')}`);
  lines.push(`  WHERE "${group.parentPK}" = NEW."${group.fkColumn}";`);

  return lines;
}

/**
 * Generate DELETE logic: Single batched UPDATE subtracting/decrementing, with unconditional MIN/MAX recalculation
 */
function generateDeleteUpdate(tableName: string, group: AggregationGroup): string[] {
  const lines: string[] = [];
  const setClauses: string[] = [];

  for (const agg of group.aggregations) {
    if (agg.operation === 'COUNT') {
      setClauses.push(`"${agg.parentCol}" = "${agg.parentCol}" - 1`);
    } else if (agg.operation === 'SUM') {
      setClauses.push(`"${agg.parentCol}" = "${agg.parentCol}" - OLD."${agg.sourceColumn}"`);
    } else if (agg.operation === 'MIN') {
      setClauses.push(`"${agg.parentCol}" = (SELECT MIN("${agg.sourceColumn}") FROM "${tableName}" WHERE "${group.fkColumn}" = OLD."${group.fkColumn}")`);
    } else if (agg.operation === 'MAX') {
      setClauses.push(`"${agg.parentCol}" = (SELECT MAX("${agg.sourceColumn}") FROM "${tableName}" WHERE "${group.fkColumn}" = OLD."${group.fkColumn}")`);
    }
  }

  const columnCount = group.aggregations.length;
  const columnWord = columnCount === 1 ? 'column' : 'columns';
  lines.push(`  -- Update ${group.parentTable} aggregations (${columnCount} ${columnWord})`);
  lines.push(`  UPDATE "${group.parentTable}"`);
  lines.push(`  SET ${setClauses.join(',\n      ')}`);
  lines.push(`  WHERE "${group.parentPK}" = OLD."${group.fkColumn}";`);

  return lines;
}

/**
 * Generate UPDATE logic: Two paths
 * - FK changed: Two batched UPDATEs (one for old parent, one for new parent)
 * - FK same: Single batched UPDATE with deltas
 */
function generateUpdateLogic(tableName: string, group: AggregationGroup): string[] {
  const lines: string[] = [];

  // Build condition: FK changed OR any source column changed
  const conditions: string[] = [`NEW."${group.fkColumn}" IS DISTINCT FROM OLD."${group.fkColumn}"`];

  for (const agg of group.aggregations) {
    if (agg.operation !== 'COUNT') {
      // COUNT doesn't care about source column changes when FK is same
      conditions.push(`NEW."${agg.sourceColumn}" IS DISTINCT FROM OLD."${agg.sourceColumn}"`);
    }
  }

  const columnCount = group.aggregations.length;
  const columnWord = columnCount === 1 ? 'column' : 'columns';
  lines.push(`  -- Update ${group.parentTable} aggregations (${columnCount} ${columnWord})`);
  lines.push(`  IF ${conditions.join(' OR ')} THEN`);

  // Path 1: FK changed - update two different parent rows
  lines.push(`    IF NEW."${group.fkColumn}" IS DISTINCT FROM OLD."${group.fkColumn}" THEN`);

  // Subtract from old parent
  const oldSetClauses: string[] = [];
  for (const agg of group.aggregations) {
    if (agg.operation === 'COUNT') {
      oldSetClauses.push(`"${agg.parentCol}" = "${agg.parentCol}" - 1`);
    } else if (agg.operation === 'SUM') {
      oldSetClauses.push(`"${agg.parentCol}" = "${agg.parentCol}" - OLD."${agg.sourceColumn}"`);
    } else if (agg.operation === 'MIN' || agg.operation === 'MAX') {
      const minmax = agg.operation === 'MIN' ? 'MIN' : 'MAX';
      oldSetClauses.push(`"${agg.parentCol}" = (SELECT ${minmax}("${agg.sourceColumn}") FROM "${tableName}" WHERE "${group.fkColumn}" = OLD."${group.fkColumn}")`);
    }
  }

  lines.push(`      UPDATE "${group.parentTable}"`);
  lines.push(`      SET ${oldSetClauses.join(',\n          ')}`);
  lines.push(`      WHERE "${group.parentPK}" = OLD."${group.fkColumn}";`);

  // Add to new parent
  const newSetClauses: string[] = [];
  for (const agg of group.aggregations) {
    if (agg.operation === 'COUNT') {
      newSetClauses.push(`"${agg.parentCol}" = "${agg.parentCol}" + 1`);
    } else if (agg.operation === 'SUM') {
      newSetClauses.push(`"${agg.parentCol}" = "${agg.parentCol}" + NEW."${agg.sourceColumn}"`);
    } else if (agg.operation === 'MIN') {
      newSetClauses.push(`"${agg.parentCol}" = LEAST("${agg.parentCol}", NEW."${agg.sourceColumn}")`);
    } else if (agg.operation === 'MAX') {
      newSetClauses.push(`"${agg.parentCol}" = GREATEST("${agg.parentCol}", NEW."${agg.sourceColumn}")`);
    }
  }

  lines.push(`      UPDATE "${group.parentTable}"`);
  lines.push(`      SET ${newSetClauses.join(',\n          ')}`);
  lines.push(`      WHERE "${group.parentPK}" = NEW."${group.fkColumn}";`);

  // Path 2: FK same - update deltas on single row
  lines.push(`    ELSE`);

  const deltaSetClauses: string[] = [];
  for (const agg of group.aggregations) {
    if (agg.operation === 'COUNT') {
      // COUNT doesn't change when FK is same
      continue;
    } else if (agg.operation === 'SUM') {
      deltaSetClauses.push(`"${agg.parentCol}" = "${agg.parentCol}" + (NEW."${agg.sourceColumn}" - OLD."${agg.sourceColumn}")`);
    } else if (agg.operation === 'MIN' || agg.operation === 'MAX') {
      // Recalculate MIN/MAX unconditionally
      const minmax = agg.operation === 'MIN' ? 'MIN' : 'MAX';
      deltaSetClauses.push(`"${agg.parentCol}" = (SELECT ${minmax}("${agg.sourceColumn}") FROM "${tableName}" WHERE "${group.fkColumn}" = NEW."${group.fkColumn}")`);
    }
  }

  if (deltaSetClauses.length > 0) {
    lines.push(`      UPDATE "${group.parentTable}"`);
    lines.push(`      SET ${deltaSetClauses.join(',\n          ')}`);
    lines.push(`      WHERE "${group.parentPK}" = NEW."${group.fkColumn}";`);
  }

  lines.push(`    END IF;`);
  lines.push(`  END IF;`);

  return lines;
}
