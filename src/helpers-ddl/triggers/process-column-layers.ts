import type { NewSchema } from '../../new-schema.js';

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrite formula expression to qualify column references with NEW.
 */
function rewriteFormulaForTrigger(
  formula: string,
  columnNames: string[]
): string {
  const sortedColumns = [...columnNames].sort((a, b) => b.length - a.length);
  let rewritten = formula;
  for (const colName of sortedColumns) {
    const regex = new RegExp(`\\b${escapeRegex(colName)}\\b`, 'gi');
    rewritten = rewritten.replace(regex, `NEW."${colName}"`);
  }
  return rewritten;
}

/**
 * Process columns by layer, handling both formulas and SYNC/SNAPSHOT operations
 *
 * This replaces the separate generatePullFromParents and generateCalculateFormulas
 * with a unified layer-based approach that respects dependencies.
 *
 * For each layer:
 * - SYNC/SNAPSHOT columns: Pull from parent via FK
 * - Formula columns: Calculate using formula expression
 */
export function generateProcessColumnLayers(
  tableName: string,
  newSchema: NewSchema,
  triggerType: 'INSERT' | 'UPDATE'
): string[] {
  const table = newSchema.tables[tableName];
  if (!table || !table.columns || !table.columnLayers) {
    return [];
  }

  const lines: string[] = [];
  const columnNames = Object.keys(table.columns);

  // Group SYNC columns by their FK lookup for efficiency
  interface SyncGroup {
    sourceTable: string;
    fkColumn: string;
    parentPK: string;
    columns: Array<{ colName: string; sourceColumn: string }>;
  }

  // Process each layer in order
  const layerNumbers = Object.keys(table.columnLayers).map(Number).sort((a, b) => a - b);

  for (const layerNum of layerNumbers) {
    const columnsInLayer = table.columnLayers[layerNum];
    if (!columnsInLayer || columnsInLayer.length === 0) continue;

    // Separate columns by type within this layer
    const syncColumns: string[] = [];
    const formulaColumns: string[] = [];

    for (const colName of columnsInLayer) {
      const colDef = table.columns[colName];
      if (!colDef) continue;

      if (colDef.automation && (colDef.automationType === 'SYNC' || colDef.automationType === 'SNAPSHOT')) {
        syncColumns.push(colName);
      } else if (colDef.formula) {
        formulaColumns.push(colName);
      }
    }

    // Process SYNC/SNAPSHOT columns in this layer
    if (syncColumns.length > 0) {
      const syncGroups = new Map<string, SyncGroup>();

      for (const colName of syncColumns) {
        const colDef = table.columns[colName];
        if (!colDef || !colDef.automationType) continue;

        const sourceTable = colDef.automationSourceTable;
        const sourceColumn = colDef.automationSourceColumn;
        const explicitFKColumn = colDef.automationFKColumn;

        if (!sourceTable || !sourceColumn) continue;

        // Find FK column
        let fkColumn: string | undefined;
        if (explicitFKColumn) {
          fkColumn = explicitFKColumn;
        } else {
          for (const fk of Object.values(table.foreignKeys || {})) {
            if (fk.parentTable === sourceTable) {
              fkColumn = fk.childColumn;
              break;
            }
          }
        }

        if (!fkColumn) continue;

        const parentTable = newSchema.tables[sourceTable];
        const parentPK = parentTable?.pkColumn;
        if (!parentPK) continue;

        const groupKey = `${sourceTable}:${fkColumn}:${parentPK}`;

        if (!syncGroups.has(groupKey)) {
          syncGroups.set(groupKey, {
            sourceTable,
            fkColumn,
            parentPK,
            columns: []
          });
        }

        syncGroups.get(groupKey)!.columns.push({ colName, sourceColumn });
      }

      // Generate SYNC code for this layer
      for (const group of syncGroups.values()) {
        const selectColumns = group.columns.map(c => `"${c.sourceColumn}"`).join(', ');
        const intoColumns = group.columns.map(c => `NEW."${c.colName}"`).join(', ');

        lines.push(`  -- SYNC/SNAPSHOT from ${group.sourceTable} (${group.columns.length} column${group.columns.length > 1 ? 's' : ''})`);

        // For UPDATE triggers: only pull if FK changed (prevents SNAPSHOT from updating on parent changes)
        // For INSERT triggers: always pull (no OLD record to compare)
        if (triggerType === 'UPDATE') {
          lines.push(`  IF NEW."${group.fkColumn}" IS DISTINCT FROM OLD."${group.fkColumn}" THEN`);
          lines.push(`    SELECT ${selectColumns}`);
          lines.push(`    INTO ${intoColumns}`);
          lines.push(`    FROM "${group.sourceTable}" WHERE "${group.parentPK}" = NEW."${group.fkColumn}";`);
          lines.push(`  END IF;`);
        } else {
          lines.push(`  SELECT ${selectColumns}`);
          lines.push(`  INTO ${intoColumns}`);
          lines.push(`  FROM "${group.sourceTable}" WHERE "${group.parentPK}" = NEW."${group.fkColumn}";`);
        }
      }
    }

    // Process formula columns in this layer
    for (const colName of formulaColumns) {
      const colDef = table.columns[colName];
      if (!colDef || !colDef.formula) continue;

      const rewrittenFormula = rewriteFormulaForTrigger(colDef.formula, columnNames);
      lines.push(`  -- Formula: ${colName}`);
      lines.push(`  NEW."${colName}" := ${rewrittenFormula};`);
    }
  }

  return lines;
}
