import type { GenLogicSchema, AutomationDefinition } from './types.js';
import type { ProcessedSchema } from './schema-processor.js';
import { DataFlowGraphValidator } from './graph.js';

// Types for consolidated trigger generation
// One trigger per table handles all automations in sequence

interface TableAutomations {
  tableName: string;

  // SYNC to other tables: propagate INSERT/UPDATE/DELETE to sibling tables
  syncTargets: Array<{
    targetTable: string;
    syncName: string;  // Name from sync: { ledger: {...} }
    direction: 'push' | 'pull' | 'bidirectional';
    operations: ('insert' | 'update' | 'delete')[];
    matchColumns: Record<string, string>;  // source: target - always propagated
    matchConditions?: string[];  // Extra WHERE conditions
    columnMap?: Record<string, string>;  // Data columns to sync
    literals?: Record<string, string>;  // Constants (INSERT only)
  }>;

  // SPREAD to other tables: generate multiple rows based on date range + interval
  spreadTargets: Array<{
    targetTable: string;
    spreadName: string;  // Name from spread: { transactions: {...} }
    operations: ('insert' | 'update' | 'delete')[];
    generate: {
      startDate: string;   // Column name
      endDate: string;     // Column name
      interval: string;    // Column name
    };
    columnMap?: Record<string, string>;  // Data columns to copy
    literals?: Record<string, string>;  // Constants
    trackingColumn: string;  // FK in target pointing back to source
  }>;

  // PUSH to children: this table is parent, cascade to children on UPDATE
  pushToChildren: Array<{
    childTable: string;
    foreignKeyName: string;
    fkColumns: string[];  // The FK columns in child table that point to this parent
    parentPKColumns: string[];  // The PK columns in this parent table that FK references
    columns: Array<{
      parentColumn: string;  // Column in this table
      childColumn: string;   // Column in child table
      isFetchUpdates: boolean; // true for FETCH_UPDATES, false for FETCH
    }>;
  }>;

  // PULL from parents: this table is child, fetch from parents when FK changes
  pullFromParents: Array<{
    parentTable: string;
    foreignKeyName: string;
    fkColumns: string[];  // The FK columns that point to parent
    columns: Array<{
      parentColumn: string;  // Column to fetch FROM parent
      childColumn: string;   // Column to store IN this table
    }>;
  }>;

  // Calculated columns in dependency order
  calculatedColumns: Array<{
    columnName: string;
    expression: string;
  }>;

  // PUSH to parents: this table is child, aggregate to parents
  pushToParents: Array<{
    parentTable: string;
    foreignKeyName: string;
    fkColumns: string[];  // The FK columns that point to parent
    aggregations: Array<{
      parentColumn: string;      // Column in parent to update
      aggregationType: string;   // SUM, COUNT, MAX, MIN, LATEST
      childColumn: string;       // Column in this table to aggregate
    }>;
  }>;
}

/**
 * Trigger Generation Engine
 *
 * GENLOGIC CORE BUSINESS LOGIC: Generate PostgreSQL triggers for all automation types
 * CONSOLIDATED APPROACH: One BEFORE trigger per table handles all automations with change detection
 */
export class TriggerGenerator {

  /**
   * Generate all triggers for the schema
   * NEW APPROACH: Consolidated triggers with change detection to prevent infinite loops
   */
  generateTriggers(schema: GenLogicSchema, processedSchema: ProcessedSchema): string[] {
    const triggerSQL: string[] = [];

    if (!schema.tables) return triggerSQL;

    // Group all automations and calculated columns by table
    const tableAutomations = this.groupAutomationsByTable(schema, processedSchema);

    // Generate consolidated triggers for each table
    for (const [tableName, automations] of Object.entries(tableAutomations)) {
      const triggers = this.generateConsolidatedTriggers(tableName, automations, processedSchema);
      triggerSQL.push(...triggers);
    }

    return triggerSQL;
  }

  /**
   * Group all automations and calculated columns by table
   * Returns a map of table name to all its automation requirements
   */
  private groupAutomationsByTable(schema: GenLogicSchema, processedSchema: ProcessedSchema): Record<string, TableAutomations> {
    const tableAutomations: Record<string, TableAutomations> = {};

    if (!schema.tables) return tableAutomations;

    // Initialize all tables
    for (const tableName of Object.keys(schema.tables)) {
      tableAutomations[tableName] = {
        tableName,
        syncTargets: [],
        spreadTargets: [],
        pushToChildren: [],
        pullFromParents: [],
        calculatedColumns: [],
        pushToParents: []
      };
    }

    // Collect calculated columns for each table
    const graphValidator = new DataFlowGraphValidator();
    const calculatedGraphs = graphValidator.buildCalculatedColumnGraphs(schema);

    for (const [tableName, table] of Object.entries(schema.tables)) {
      if (!table.columns) continue;

      // Collect calculated columns
      const calculatedCols: Array<{ name: string; expression: string }> = [];
      for (const [columnName, column] of Object.entries(table.columns)) {
        if (column && typeof column === 'object' && 'calculated' in column) {
          calculatedCols.push({
            name: columnName,
            expression: (column as any).calculated
          });
        }
      }

      // Sort calculated columns in dependency order
      if (calculatedCols.length > 0) {
        const graph = calculatedGraphs.get(tableName);
        if (graph) {
          const sortedColumns = graphValidator.topologicalSortCalculatedColumns(graph);
          if (sortedColumns) {
            tableAutomations[tableName].calculatedColumns = sortedColumns
              .map(colName => calculatedCols.find(c => c.name === colName))
              .filter(c => c !== undefined)
              .map(c => ({ columnName: c!.name, expression: c!.expression }));
          }
        }
      }
    }

    // Collect automations and categorize them by table
    for (const [targetTable, table] of Object.entries(schema.tables)) {
      if (!table.columns) continue;

      for (const [targetColumn, column] of Object.entries(table.columns)) {
        if (!column || typeof column !== 'object' || !('automation' in column)) continue;

        const automation = (column as any).automation as AutomationDefinition;
        if (!automation) continue;

        const sourceTable = automation.table;
        const fkName = automation.foreign_key;
        const sourceColumn = automation.column;

        if (['SUM', 'COUNT', 'MAX', 'MIN', 'LATEST'].includes(automation.type)) {
          // Aggregation: sourceTable (child) aggregates to targetTable (parent)
          // Automation is DEFINED on targetTable (parent) but TRIGGER goes on sourceTable (child)
          // FK is FROM sourceTable (child) TO targetTable (parent)
          const fkColumns = this.getFKColumnNames(sourceTable, targetTable, fkName, processedSchema);

          // This goes in sourceTable's "pushToParents" (trigger on child table)
          let pushToParent = tableAutomations[sourceTable].pushToParents.find(
            p => p.parentTable === targetTable && p.foreignKeyName === fkName
          );
          if (!pushToParent) {
            pushToParent = {
              parentTable: targetTable,
              foreignKeyName: fkName,
              fkColumns,
              aggregations: []
            };
            tableAutomations[sourceTable].pushToParents.push(pushToParent);
          }
          pushToParent.aggregations.push({
            parentColumn: targetColumn,
            aggregationType: automation.type,
            childColumn: sourceColumn
          });

        } else if (['SNAPSHOT', 'FOLLOW'].includes(automation.type)) {
          // Cascade: sourceTable (parent) pushes to targetTable (child)
          // Automation is DEFINED on targetTable (child) but TRIGGERS go on BOTH tables
          // FK is FROM targetTable (child) TO sourceTable (parent)
          const fkColumns = this.getFKColumnNames(targetTable, sourceTable, fkName, processedSchema);

          // Trigger on parent: pushToChildren (when parent updates, push to child)
          let pushToChild = tableAutomations[sourceTable].pushToChildren.find(
            p => p.childTable === targetTable && p.foreignKeyName === fkName
          );
          if (!pushToChild) {
            // Get parent PK columns to know what the FK references
            const parentPKColumns = this.getTablePrimaryKeys(sourceTable, processedSchema);

            pushToChild = {
              childTable: targetTable,
              foreignKeyName: fkName,
              fkColumns,
              parentPKColumns,
              columns: []
            };
            tableAutomations[sourceTable].pushToChildren.push(pushToChild);
          }
          pushToChild.columns.push({
            parentColumn: sourceColumn,
            childColumn: targetColumn,
            isFetchUpdates: automation.type === 'FOLLOW'
          });

          // Trigger on child: pullFromParents (when FK changes, pull from new parent)
          let pullFromParent = tableAutomations[targetTable].pullFromParents.find(
            p => p.parentTable === sourceTable && p.foreignKeyName === fkName
          );
          if (!pullFromParent) {
            pullFromParent = {
              parentTable: sourceTable,
              foreignKeyName: fkName,
              fkColumns,
              columns: []
            };
            tableAutomations[targetTable].pullFromParents.push(pullFromParent);
          }
          pullFromParent.columns.push({
            parentColumn: sourceColumn,
            childColumn: targetColumn
          });
        }
      }
    }

    // Collect sync definitions for each table
    for (const [tableName, table] of Object.entries(schema.tables)) {
      if (!table.sync) continue;

      for (const [syncName, syncDef] of Object.entries(table.sync)) {
        const direction = syncDef.direction || 'push';
        const operations = syncDef.operations || ['insert', 'update', 'delete'];

        const syncTarget: any = {
          targetTable: syncName,
          syncName,
          direction,
          operations,
          matchColumns: syncDef.match_columns
        };
        if (syncDef.match_conditions) {
          syncTarget.matchConditions = syncDef.match_conditions;
        }
        if (syncDef.column_map) {
          syncTarget.columnMap = syncDef.column_map;
        }
        if (syncDef.literals) {
          syncTarget.literals = syncDef.literals;
        }
        tableAutomations[tableName].syncTargets.push(syncTarget);
      }
    }

    // Collect spread definitions for each table
    for (const [tableName, table] of Object.entries(schema.tables)) {
      if (!table.spread) continue;

      for (const [spreadName, spreadDef] of Object.entries(table.spread)) {
        const operations = spreadDef.operations || ['insert', 'update', 'delete'];

        const spreadTarget: any = {
          targetTable: spreadName,
          spreadName,
          operations,
          generate: {
            startDate: spreadDef.generate.start_date,
            endDate: spreadDef.generate.end_date,
            interval: spreadDef.generate.interval
          },
          trackingColumn: spreadDef.tracking_column
        };
        if (spreadDef.column_map) {
          spreadTarget.columnMap = spreadDef.column_map;
        }
        if (spreadDef.literals) {
          spreadTarget.literals = spreadDef.literals;
        }
        tableAutomations[tableName].spreadTargets.push(spreadTarget);
      }
    }

    return tableAutomations;
  }

  /**
   * Get the FK column names that reference from child to parent
   */
  private getFKColumnNames(childTable: string, _parentTable: string, fkName: string, processedSchema: ProcessedSchema): string[] {
    const childProcessedTable = processedSchema.tables[childTable];
    if (!childProcessedTable) return [];

    // Use the FK column mapping from processed schema
    return childProcessedTable.fkColumnMapping[fkName] || [];
  }

  /**
   * Generate change detection condition for a single column
   * Uses IS DISTINCT FROM for NULL-safe comparison
   */
  private generateChangeDetection(columnName: string): string {
    return `OLD.${columnName} IS DISTINCT FROM NEW.${columnName}`;
  }

  /**
   * Generate change detection condition for multiple columns (OR)
   */
  private generateChangeDetectionMultiple(columnNames: string[]): string {
    if (columnNames.length === 0) return 'FALSE';
    if (columnNames.length === 1) return this.generateChangeDetection(columnNames[0]);
    return columnNames.map(col => this.generateChangeDetection(col)).join(' OR ');
  }

  /**
   * Generate FK change detection
   */
  private generateFKChangeDetection(fkColumns: string[]): string {
    return this.generateChangeDetectionMultiple(fkColumns);
  }

  /**
   * Generate consolidated triggers for a table
   * One BEFORE trigger per operation (INSERT/UPDATE/DELETE)
   */
  private generateConsolidatedTriggers(tableName: string, automations: TableAutomations, processedSchema: ProcessedSchema): string[] {
    const triggers: string[] = [];

    // Determine which operations need triggers
    const hasSyncInsert = automations.syncTargets.some(s => s.operations.includes('insert'));
    const hasSyncUpdate = automations.syncTargets.some(s => s.operations.includes('update'));
    const hasSyncDelete = automations.syncTargets.some(s => s.operations.includes('delete'));

    const hasSpreadInsert = automations.spreadTargets.some(s => s.operations.includes('insert'));
    const hasSpreadUpdate = automations.spreadTargets.some(s => s.operations.includes('update'));
    const hasSpreadDelete = automations.spreadTargets.some(s => s.operations.includes('delete'));

    const needsInsert = automations.pushToChildren.length > 0 ||
                        automations.pullFromParents.length > 0 ||
                        automations.calculatedColumns.length > 0 ||
                        automations.pushToParents.length > 0 ||
                        hasSyncInsert ||
                        hasSpreadInsert;

    const needsUpdate = automations.pushToChildren.length > 0 ||
                        automations.pullFromParents.length > 0 ||
                        automations.calculatedColumns.length > 0 ||
                        automations.pushToParents.length > 0 ||
                        hasSyncUpdate ||
                        hasSpreadUpdate;

    const needsDelete = automations.pushToParents.length > 0 || hasSyncDelete || hasSpreadDelete;

    if (needsInsert) {
      triggers.push(this.generateConsolidatedInsertTrigger(tableName, automations, processedSchema));
    }

    if (needsUpdate) {
      triggers.push(this.generateConsolidatedUpdateTrigger(tableName, automations, processedSchema));
    }

    if (needsDelete) {
      triggers.push(this.generateConsolidatedDeleteTrigger(tableName, automations, processedSchema));
    }

    return triggers;
  }

  /**
   * Generate consolidated BEFORE INSERT trigger
   */
  private generateConsolidatedInsertTrigger(tableName: string, automations: TableAutomations, processedSchema: ProcessedSchema): string {
    const functionName = `${tableName}_before_insert_genlogic`;
    const triggerName = `${tableName}_before_insert_genlogic`;

    const sections: string[] = [];

    // Step 1: PULL from parents (get initial values FIRST)
    const pulls = this.generatePullFromParents(automations, 'INSERT', processedSchema);
    if (pulls) sections.push(pulls);

    // Step 2: PUSH to children (SNAPSHOT and FOLLOW both trigger on INSERT)
    const fetchPushes = this.generatePushToChildren(automations, 'INSERT');
    if (fetchPushes) sections.push(fetchPushes);

    // Step 3: Calculate calculated columns
    const calcs = this.generateCalculatedColumns(automations);
    if (calcs) sections.push(calcs);

    // Step 4: PUSH to parents (aggregations)
    const pushes = this.generatePushToParents(automations, 'INSERT', processedSchema);
    if (pushes) sections.push(pushes);

    // Step 5: SYNC to other tables
    const syncs = this.generateSyncOperations(automations, 'INSERT');
    if (syncs) sections.push(syncs);

    // Step 6: SPREAD to other tables (generate multiple rows)
    const spreads = this.generateSpreadOperations(automations, 'INSERT');
    if (spreads) sections.push(spreads);

    const functionBody = sections.length > 0 ? sections.join('\n\n') : '  -- No automations for INSERT';

    return `
CREATE OR REPLACE FUNCTION ${functionName}()
RETURNS TRIGGER AS $$
BEGIN
${functionBody}

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ${triggerName}
  BEFORE INSERT ON ${tableName}
  FOR EACH ROW EXECUTE FUNCTION ${functionName}();
`;
  }

  /**
   * Generate consolidated BEFORE UPDATE trigger
   */
  private generateConsolidatedUpdateTrigger(tableName: string, automations: TableAutomations, processedSchema: ProcessedSchema): string {
    const functionName = `${tableName}_before_update_genlogic`;
    const triggerName = `${tableName}_before_update_genlogic`;

    const sections: string[] = [];

    // Step 1: PULL from parents (if FK changed, get new values FIRST)
    const pulls = this.generatePullFromParents(automations, 'UPDATE', processedSchema);
    if (pulls) sections.push(pulls);

    // Step 2: PUSH to children (FOLLOW only, with change detection)
    const pushes = this.generatePushToChildren(automations, 'UPDATE');
    if (pushes) sections.push(pushes);

    // Step 3: Calculate calculated columns
    const calcs = this.generateCalculatedColumns(automations);
    if (calcs) sections.push(calcs);

    // Step 4: PUSH to parents (aggregations with change detection)
    const parentPushes = this.generatePushToParents(automations, 'UPDATE', processedSchema);
    if (parentPushes) sections.push(parentPushes);

    // Step 5: SYNC to other tables
    const syncs = this.generateSyncOperations(automations, 'UPDATE');
    if (syncs) sections.push(syncs);

    // Step 6: SPREAD to other tables (regenerate if dates changed)
    const spreads = this.generateSpreadOperations(automations, 'UPDATE');
    if (spreads) sections.push(spreads);

    const functionBody = sections.length > 0 ? sections.join('\n\n') : '  -- No automations for UPDATE';

    return `
CREATE OR REPLACE FUNCTION ${functionName}()
RETURNS TRIGGER AS $$
BEGIN
${functionBody}

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ${triggerName}
  BEFORE UPDATE ON ${tableName}
  FOR EACH ROW EXECUTE FUNCTION ${functionName}();
`;
  }

  /**
   * Generate consolidated BEFORE DELETE trigger
   */
  private generateConsolidatedDeleteTrigger(tableName: string, automations: TableAutomations, processedSchema: ProcessedSchema): string {
    const functionName = `${tableName}_before_delete_genlogic`;
    const triggerName = `${tableName}_before_delete_genlogic`;

    const sections: string[] = [];

    // Step 1: PUSH to parents on DELETE (remove aggregations)
    const pushes = this.generatePushToParents(automations, 'DELETE', processedSchema);
    if (pushes) sections.push(pushes);

    // Step 2: SYNC to other tables (delete matching rows)
    const syncs = this.generateSyncOperations(automations, 'DELETE');
    if (syncs) sections.push(syncs);

    // Step 3: SPREAD to other tables (delete all generated rows)
    const spreads = this.generateSpreadOperations(automations, 'DELETE');
    if (spreads) sections.push(spreads);

    const functionBody = sections.length > 0 ? sections.join('\n\n') : '  -- No automations for DELETE';

    return `
CREATE OR REPLACE FUNCTION ${functionName}()
RETURNS TRIGGER AS $$
BEGIN
${functionBody}

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ${triggerName}
  BEFORE DELETE ON ${tableName}
  FOR EACH ROW EXECUTE FUNCTION ${functionName}();
`;
  }

  /**
   * Generate PUSH to children logic (SNAPSHOT/FOLLOW)
   */
  private generatePushToChildren(automations: TableAutomations, operation: 'INSERT' | 'UPDATE'): string | null {
    if (automations.pushToChildren.length === 0) return null;

    const sections: string[] = [];
    sections.push('  -- Step 2: PUSH to children (cascade parent values)');

    for (const push of automations.pushToChildren) {
      const setStatements: string[] = [];
      const changedColumns: string[] = [];

      for (const col of push.columns) {
        // SNAPSHOT: only on INSERT (one-time copy)
        // FOLLOW: on both INSERT and UPDATE (keep synchronized)
        if (operation === 'INSERT' || col.isFetchUpdates) {
          setStatements.push(`${col.childColumn} = NEW.${col.parentColumn}`);
          changedColumns.push(col.parentColumn);
        }
      }

      if (setStatements.length === 0) continue;

      // Build WHERE clause: child's FK columns match parent's PK columns
      // Example: WHERE child_begin_balance_id = NEW.begin_balance_id
      const fkWhereConditions = push.fkColumns.map((fkCol, idx) => {
        const parentPKCol = push.parentPKColumns[idx];
        return `${fkCol} = NEW.${parentPKCol}`;
      }).join(' AND ');

      if (operation === 'UPDATE') {
        // Add change detection: only push if parent columns changed
        const changeDetection = this.generateChangeDetectionMultiple(changedColumns);
        sections.push(`  IF ${changeDetection} THEN`);
        sections.push(`    UPDATE ${push.childTable} SET`);
        sections.push(`      ${setStatements.join(',\n      ')}`);
        sections.push(`    WHERE ${fkWhereConditions};`);
        sections.push(`  END IF;`);
      } else {
        // INSERT: no change detection needed
        sections.push(`  UPDATE ${push.childTable} SET`);
        sections.push(`    ${setStatements.join(',\n    ')}`);
        sections.push(`  WHERE ${fkWhereConditions};`);
      }
    }

    return sections.join('\n');
  }

  /**
   * Generate PULL from parents logic
   */
  private generatePullFromParents(automations: TableAutomations, operation: 'INSERT' | 'UPDATE', processedSchema: ProcessedSchema): string | null {
    if (automations.pullFromParents.length === 0) return null;

    const sections: string[] = [];
    sections.push('  -- Step 1: PULL from parents (fetch parent values)');

    for (const pull of automations.pullFromParents) {
      const parentPKColumns = this.getTablePrimaryKeys(pull.parentTable, processedSchema);
      if (parentPKColumns.length === 0) continue;

      // Build SELECT list
      const selectCols = pull.columns.map(c => c.parentColumn).join(', ');

      // Build WHERE clause: parent PK = child FK
      const whereConditions = pull.fkColumns.map((fkCol, idx) => {
        const parentPKCol = parentPKColumns[idx];
        return `${parentPKCol} = NEW.${fkCol}`;
      }).join(' AND ');

      if (operation === 'UPDATE') {
        // Only PULL if FK changed
        const fkChangeDetection = this.generateFKChangeDetection(pull.fkColumns);
        sections.push(`  IF ${fkChangeDetection} THEN`);
        sections.push(`    SELECT ${selectCols} INTO ${pull.columns.map(c => `NEW.${c.childColumn}`).join(', ')}`);
        sections.push(`    FROM ${pull.parentTable}`);
        sections.push(`    WHERE ${whereConditions};`);
        sections.push(`  END IF;`);
      } else {
        // INSERT: always PULL
        sections.push(`  SELECT ${selectCols} INTO ${pull.columns.map(c => `NEW.${c.childColumn}`).join(', ')}`);
        sections.push(`  FROM ${pull.parentTable}`);
        sections.push(`  WHERE ${whereConditions};`);
      }
    }

    return sections.join('\n');
  }

  /**
   * Generate calculated columns logic
   */
  private generateCalculatedColumns(automations: TableAutomations): string | null {
    if (automations.calculatedColumns.length === 0) return null;

    const sections: string[] = [];
    sections.push('  -- Step 3: Calculate calculated columns (in dependency order)');

    for (const calc of automations.calculatedColumns) {
      const qualifiedExpression = this.qualifyColumnReferences(calc.expression, automations.tableName);
      sections.push(`  NEW.${calc.columnName} := ${qualifiedExpression};`);
    }

    return sections.join('\n');
  }

  /**
   * Qualify column references in expressions with NEW. prefix
   * Converts: "debits - credits" to "NEW.debits - NEW.credits"
   * Preserves: literals, functions, keywords
   */
  private qualifyColumnReferences(expression: string, tableName: string): string {
    // For now, use a simple regex approach
    // Match identifiers that could be column names
    // Avoid matching SQL keywords and function names

    const sqlKeywords = new Set([
      'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AND', 'OR', 'NOT', 'NULL',
      'TRUE', 'FALSE', 'IS', 'IN', 'LIKE', 'BETWEEN', 'EXISTS',
      'COALESCE', 'NULLIF', 'CAST', 'EXTRACT', 'SUBSTRING', 'TRIM',
      'UPPER', 'LOWER', 'LENGTH', 'CONCAT', 'REPLACE',
      'SUM', 'COUNT', 'AVG', 'MAX', 'MIN', 'ABS', 'ROUND', 'CEIL', 'FLOOR'
    ]);

    // Replace identifiers that are not keywords or already qualified
    return expression.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match, identifier) => {
      // Don't qualify if it's a SQL keyword
      if (sqlKeywords.has(identifier.toUpperCase())) {
        return match;
      }

      // Don't qualify if already qualified with NEW., OLD., or table prefix
      if (expression.includes(`NEW.${identifier}`) ||
          expression.includes(`OLD.${identifier}`) ||
          expression.includes(`${tableName}.${identifier}`)) {
        return match;
      }

      // Qualify with NEW.
      return `NEW.${identifier}`;
    });
  }

  /**
   * Generate PUSH to parents logic (aggregations)
   */
  private generatePushToParents(automations: TableAutomations, operation: 'INSERT' | 'UPDATE' | 'DELETE', processedSchema: ProcessedSchema): string | null {
    if (automations.pushToParents.length === 0) return null;

    const sections: string[] = [];
    sections.push('  -- Step 4: PUSH to parents (aggregate to parent tables)');

    for (const push of automations.pushToParents) {
      for (const agg of push.aggregations) {
        const row = operation === 'DELETE' ? 'OLD' : 'NEW';

        if (operation === 'INSERT') {
          // INSERT: Simple increment
          sections.push(this.generateAggregationInsert(agg, push, row, processedSchema));

        } else if (operation === 'UPDATE') {
          // UPDATE: Check if source column changed, then adjust
          const changeDetection = this.generateChangeDetection(agg.childColumn);
          sections.push(`  IF ${changeDetection} THEN`);
          sections.push(this.generateAggregationUpdate(agg, push, processedSchema));
          sections.push(`  END IF;`);

        } else if (operation === 'DELETE') {
          // DELETE: Decrement
          sections.push(this.generateAggregationDelete(agg, push, row, processedSchema));
        }
      }
    }

    return sections.join('\n');
  }

  /**
   * Get primary key columns for a table
   */
  private getTablePrimaryKeys(tableName: string, processedSchema: ProcessedSchema): string[] {
    const table = processedSchema.tables[tableName];
    if (!table) return ['id']; // Fallback to 'id'

    const pkColumns: string[] = [];
    const allColumns = { ...table.columns, ...table.generatedColumns };

    for (const [colName, colDef] of Object.entries(allColumns)) {
      if (colDef.primary_key) {
        pkColumns.push(colName);
      }
    }

    return pkColumns.length > 0 ? pkColumns : ['id']; // Fallback to 'id'
  }

  /**
   * Generate aggregation INSERT logic
   * NOTE: Aggregation columns have DEFAULT 0, so COALESCE not needed on parent columns
   * Child columns still need COALESCE as they may be NULL
   */
  private generateAggregationInsert(agg: any, push: any, row: string, processedSchema: ProcessedSchema): string {
    const fkCol = push.fkColumns[0]; // Assume single FK column
    const parentPK = this.getTablePrimaryKeys(push.parentTable, processedSchema)[0]; // Use first PK

    switch (agg.aggregationType) {
      case 'SUM':
        return `    UPDATE ${push.parentTable} SET ${agg.parentColumn} = ${agg.parentColumn} + COALESCE(${row}.${agg.childColumn}, 0) WHERE ${parentPK} = ${row}.${fkCol};`;
      case 'COUNT':
        return `    UPDATE ${push.parentTable} SET ${agg.parentColumn} = ${agg.parentColumn} + 1 WHERE ${parentPK} = ${row}.${fkCol};`;
      case 'MAX':
        return `    UPDATE ${push.parentTable} SET ${agg.parentColumn} = GREATEST(${agg.parentColumn}, COALESCE(${row}.${agg.childColumn}, ${agg.parentColumn})) WHERE ${parentPK} = ${row}.${fkCol};`;
      case 'MIN':
        return `    UPDATE ${push.parentTable} SET ${agg.parentColumn} = LEAST(${agg.parentColumn}, COALESCE(${row}.${agg.childColumn}, ${agg.parentColumn})) WHERE ${parentPK} = ${row}.${fkCol};`;
      case 'LATEST':
        return `    UPDATE ${push.parentTable} SET ${agg.parentColumn} = ${row}.${agg.childColumn} WHERE ${parentPK} = ${row}.${fkCol};`;
      default:
        return `    -- Unsupported aggregation type: ${agg.aggregationType}`;
    }
  }

  /**
   * Generate aggregation UPDATE logic (incremental)
   * NOTE: Aggregation columns have DEFAULT 0, so COALESCE not needed on parent columns
   * Child columns still need COALESCE as they may be NULL
   */
  private generateAggregationUpdate(agg: any, push: any, processedSchema: ProcessedSchema): string {
    const fkCol = push.fkColumns[0];
    const parentPK = this.getTablePrimaryKeys(push.parentTable, processedSchema)[0];

    switch (agg.aggregationType) {
      case 'SUM':
        return `    UPDATE ${push.parentTable} SET ${agg.parentColumn} = ${agg.parentColumn} - COALESCE(OLD.${agg.childColumn}, 0) + COALESCE(NEW.${agg.childColumn}, 0) WHERE ${parentPK} = NEW.${fkCol};`;
      case 'COUNT':
        return `    -- COUNT doesn't change on UPDATE unless NULL transition`;
      case 'MAX':
        return `    -- MAX: recalculate if needed (full scan fallback)`;
      case 'MIN':
        return `    -- MIN: recalculate if needed (full scan fallback)`;
      case 'LATEST':
        return `    UPDATE ${push.parentTable} SET ${agg.parentColumn} = NEW.${agg.childColumn} WHERE ${parentPK} = NEW.${fkCol};`;
      default:
        return `    -- Unsupported aggregation type: ${agg.aggregationType}`;
    }
  }

  /**
   * Generate aggregation DELETE logic
   * NOTE: Aggregation columns have DEFAULT 0, so COALESCE not needed on parent columns
   * Child columns still need COALESCE as they may be NULL
   */
  private generateAggregationDelete(agg: any, push: any, row: string, processedSchema: ProcessedSchema): string {
    const fkCol = push.fkColumns[0];
    const parentPK = this.getTablePrimaryKeys(push.parentTable, processedSchema)[0];

    switch (agg.aggregationType) {
      case 'SUM':
        return `  UPDATE ${push.parentTable} SET ${agg.parentColumn} = ${agg.parentColumn} - COALESCE(${row}.${agg.childColumn}, 0) WHERE ${parentPK} = ${row}.${fkCol};`;
      case 'COUNT':
        return `  UPDATE ${push.parentTable} SET ${agg.parentColumn} = GREATEST(${agg.parentColumn} - 1, 0) WHERE ${parentPK} = ${row}.${fkCol};`;
      case 'MAX':
        return `  -- MAX: recalculate (full scan fallback)`;
      case 'MIN':
        return `  -- MIN: recalculate (full scan fallback)`;
      case 'LATEST':
        return `  -- LATEST: get next most recent (full scan fallback)`;
      default:
        return `  -- Unsupported aggregation type: ${agg.aggregationType}`;
    }
  }


  /**
   * Generate SYNC operations for INSERT/UPDATE/DELETE
   */
  private generateSyncOperations(automations: TableAutomations, operation: 'INSERT' | 'UPDATE' | 'DELETE'): string | null {
    const syncs = automations.syncTargets.filter(s => s.operations.includes(operation.toLowerCase() as any));
    if (syncs.length === 0) return null;

    const sections: string[] = [];
    sections.push(`  -- Step 5: SYNC to other tables`);

    for (const sync of syncs) {
      if (operation === 'INSERT') {
        sections.push(this.generateSyncInsert(sync));
      } else if (operation === 'UPDATE') {
        sections.push(this.generateSyncUpdate(sync));
      } else if (operation === 'DELETE') {
        sections.push(this.generateSyncDelete(sync));
      }
    }

    return sections.join('\n');
  }

  /**
   * Generate SYNC INSERT logic
   */
  private generateSyncInsert(sync: any): string {
    const columns: string[] = [];
    const values: string[] = [];

    // Add match_columns (relationship columns - always propagated)
    for (const [sourceCol, targetCol] of Object.entries(sync.matchColumns)) {
      columns.push(targetCol as string);
      values.push(`NEW.${sourceCol}`);
    }

    // Add column_map (data columns)
    if (sync.columnMap) {
      for (const [sourceCol, targetCol] of Object.entries(sync.columnMap)) {
        columns.push(targetCol as string);
        values.push(`NEW.${sourceCol}`);
      }
    }

    // Add literals (constants)
    if (sync.literals) {
      for (const [targetCol, literal] of Object.entries(sync.literals)) {
        columns.push(targetCol);
        values.push(`'${literal}'`);
      }
    }

    return `  INSERT INTO ${sync.targetTable} (${columns.join(', ')})
  VALUES (${values.join(', ')});`;
  }

  /**
   * Generate SYNC UPDATE logic
   * Uses OLD for WHERE (find row before change), NEW for SET (update to new values)
   */
  private generateSyncUpdate(sync: any): string {
    const setClauses: string[] = [];

    // Update match_columns (relationship - use NEW values)
    for (const [sourceCol, targetCol] of Object.entries(sync.matchColumns)) {
      setClauses.push(`${targetCol} = NEW.${sourceCol}`);
    }

    // Update column_map (data - use NEW values)
    if (sync.columnMap) {
      for (const [sourceCol, targetCol] of Object.entries(sync.columnMap)) {
        setClauses.push(`${targetCol} = NEW.${sourceCol}`);
      }
    }

    // Build WHERE clause (use OLD values to find the row)
    const whereConditions: string[] = [];
    for (const [sourceCol, targetCol] of Object.entries(sync.matchColumns)) {
      whereConditions.push(`${targetCol} = OLD.${sourceCol}`);
    }

    // Add match_conditions (extra filters)
    if (sync.matchConditions) {
      whereConditions.push(...sync.matchConditions);
    }

    return `  UPDATE ${sync.targetTable} SET
    ${setClauses.join(',\n    ')}
  WHERE ${whereConditions.join(' AND ')};`;
  }

  /**
   * Generate SYNC DELETE logic
   */
  private generateSyncDelete(sync: any): string {
    // Build WHERE clause from match_columns (use OLD values)
    const whereConditions: string[] = [];
    for (const [sourceCol, targetCol] of Object.entries(sync.matchColumns)) {
      whereConditions.push(`${targetCol} = OLD.${sourceCol}`);
    }

    // Add match_conditions (extra filters)
    if (sync.matchConditions) {
      whereConditions.push(...sync.matchConditions);
    }

    return `  DELETE FROM ${sync.targetTable}
  WHERE ${whereConditions.join(' AND ')};`;
  }

  /**
   * Generate SPREAD operations (generate multiple rows based on date range)
   */
  private generateSpreadOperations(automations: TableAutomations, operation: 'INSERT' | 'UPDATE' | 'DELETE'): string | null {
    const spreads = automations.spreadTargets.filter(s => s.operations.includes(operation.toLowerCase() as any));
    if (spreads.length === 0) return null;

    const sections: string[] = [];
    sections.push(`  -- Step 6: SPREAD to other tables (generate multiple rows)`);

    for (const spread of spreads) {
      if (operation === 'INSERT') {
        sections.push(this.generateSpreadInsert(spread));
      } else if (operation === 'UPDATE') {
        sections.push(this.generateSpreadUpdate(spread));
      } else if (operation === 'DELETE') {
        sections.push(this.generateSpreadDelete(spread));
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Generate SPREAD INSERT: Loop through date range and insert rows
   */
  private generateSpreadInsert(spread: any): string {
    const { targetTable, generate, columnMap, literals, trackingColumn } = spread;

    // Build column list and value list
    const columns: string[] = [trackingColumn, 'date'];  // Always include tracking FK and date
    const values: string[] = ['NEW.' + generate.startDate.replace('_id', '_id'), 'current_date'];  // Will be replaced in loop

    // Add column_map columns
    if (columnMap) {
      for (const [sourceCol, targetCol] of Object.entries(columnMap)) {
        columns.push(targetCol as string);
        values.push(`NEW.${sourceCol}`);
      }
    }

    // Add literals
    if (literals) {
      for (const [targetCol, literal] of Object.entries(literals)) {
        columns.push(targetCol);
        values.push(`'${literal}'`);
      }
    }

    // Note: We need to get the parent PK to use as tracking value
    // For simplicity, assuming source table has a PK that matches the pattern
    const sourcePKRef = this.guessPrimaryKeyReference(trackingColumn);

    return `  -- SPREAD: Generate rows from ${generate.startDate} to ${generate.endDate} with interval ${generate.interval}
  DECLARE
    current_date DATE;
  BEGIN
    current_date := NEW.${generate.startDate};
    WHILE current_date <= NEW.${generate.endDate} LOOP
      INSERT INTO ${targetTable} (${columns.join(', ')})
      VALUES (NEW.${sourcePKRef}, current_date, ${values.slice(2).join(', ')});

      current_date := current_date + NEW.${generate.interval};
    END LOOP;
  END;`;
  }

  /**
   * Generate SPREAD UPDATE: Delete and regenerate if dates changed
   */
  private generateSpreadUpdate(spread: any): string {
    const { targetTable, generate, trackingColumn } = spread;
    const sourcePKRef = this.guessPrimaryKeyReference(trackingColumn);

    // Check if any of the generate fields changed
    const changeDetection = `(OLD.${generate.startDate} IS DISTINCT FROM NEW.${generate.startDate} OR ` +
                           `OLD.${generate.endDate} IS DISTINCT FROM NEW.${generate.endDate} OR ` +
                           `OLD.${generate.interval} IS DISTINCT FROM NEW.${generate.interval})`;

    return `  -- SPREAD UPDATE: Regenerate if dates/interval changed
  IF ${changeDetection} THEN
    DELETE FROM ${targetTable} WHERE ${trackingColumn} = OLD.${sourcePKRef};
    ${this.generateSpreadInsert(spread).replace('  --', '   --').replace(/^/gm, '  ')}
  END IF;`;
  }

  /**
   * Generate SPREAD DELETE: Delete all generated rows
   */
  private generateSpreadDelete(spread: any): string {
    const { targetTable, trackingColumn } = spread;
    const sourcePKRef = this.guessPrimaryKeyReference(trackingColumn);

    return `  -- SPREAD DELETE: Remove all generated rows
  DELETE FROM ${targetTable} WHERE ${trackingColumn} = OLD.${sourcePKRef};`;
  }

  /**
   * Guess the source PK column name from tracking column
   * e.g., template_id -> template_id
   */
  private guessPrimaryKeyReference(trackingColumn: string): string {
    // For now, assume the tracking column IS the PK reference
    // In a more robust implementation, we'd look this up in the processed schema
    return trackingColumn;
  }

}
