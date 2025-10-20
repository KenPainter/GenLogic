import type { GenLogicSchema, AutomationDefinition, ParsedStandardAutomation } from './types.js';
import type { ProcessedSchema } from './schema-processor.js';
import { DataFlowGraphValidator } from './graph.js';
import { resolveAutomation } from './automation-parser.js';

// Types for consolidated trigger generation
// One trigger per table handles all automations in sequence

interface TableAutomations {
  tableName: string;

  // AUTO-CREATE PARENT: this table is child, auto-create parent rows on INSERT
  autoCreateParents: Array<{
    parentTable: string;
    foreignKeyName: string;
    fkColumns: string[];  // The FK columns that point to parent
    parentPKColumns: string[];  // The PK columns in parent table
  }>;

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
    targetTable: string;   // Child table to create rows in
    parentTable: string;   // Parent table (for getting PK value)
    spreadName: string;  // Name from FK: { plan_fk: {...} }
    operations: ('insert' | 'update' | 'delete')[];
    generate: {
      startDate: string;   // Column name in parent table
      endDate: string;     // Column name in parent table
      interval: string;    // Column name in parent table
    };
    generatedColumn: string;  // Column in child table to populate with generated dates
    columnMap?: Record<string, string>;  // Data columns to copy (parent: child)
    literals?: Record<string, string>;  // Constants for child columns
    matchConditions?: string[];  // Optional WHERE filter
    trackingColumn: string;  // FK in child pointing back to parent
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
      aggregationType: string;   // SUM, COUNT, MAX, MIN, LAST_VALUE
      childColumn: string;       // Column in this table to aggregate
    }>;
  }>;
}

/**
 * Trigger Generation Engine
 *
 * GENLOGIC CORE BUSINESS LOGIC: Generate PostgreSQL triggers for all automation types
 * CONSOLIDATED APPROACH: One BEFORE trigger per table handles all automations with change detection
 * SECURITY: All triggers execute as SECURITY DEFINER to protect automated column integrity
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
      const triggers = this.generateConsolidatedTriggers(tableName, automations, schema, processedSchema);
      triggerSQL.push(...triggers);
    }

    return triggerSQL;
  }

  /**
   * Identify automated columns in a table
   * These columns must not be modified directly by users
   * Returns column names that have automation or formula properties
   */
  private getAutomatedColumns(tableName: string, schema: GenLogicSchema, processedSchema: ProcessedSchema): string[] {
    const automatedColumns: string[] = [];
    const table = schema.tables?.[tableName];
    const processedTable = processedSchema.tables?.[tableName];

    if (!table || !processedTable) return automatedColumns;

    // Check all columns in the table
    for (const [columnName, column] of Object.entries(processedTable.columns)) {
      // Column with automation (SUM, COUNT, SNAPSHOT, SYNC, etc)
      if (column.automation) {
        automatedColumns.push(columnName);
        continue;
      }

      // Column with formula expression
      if (column.formula) {
        automatedColumns.push(columnName);
        continue;
      }
    }

    return automatedColumns;
  }

  /**
   * Generate protection code for automated columns on INSERT
   * Set to appropriate initial values based on automation type
   * - Aggregations (SUM, COUNT): Initialize to 0
   * - Other aggregations (MAX, MIN, LAST_VALUE): Initialize to NULL
   * - Formula columns: Initialize to NULL (will be calculated immediately)
   * - SNAPSHOT/SYNC: Initialize to NULL (will be pulled immediately)
   */
  private generateAutomatedColumnProtection(
    tableName: string,
    automatedColumns: string[],
    operation: 'INSERT',
    schema: GenLogicSchema,
    processedSchema: ProcessedSchema
  ): string {
    const lines: string[] = [];

    lines.push('  -- INTEGRITY: Reset automated columns to prevent external corruption');

    for (const col of automatedColumns) {
      const columnDef = processedSchema.tables[tableName]?.columns[col];
      if (!columnDef) {
        // Shouldn't happen, but default to NULL if we can't find the column
        lines.push(`  NEW.${col} := NULL;`);
        continue;
      }

      // Check automation type
      if (columnDef.automation) {
        // Parse the automation to get the type
        const automation = resolveAutomation(columnDef.automation as any, tableName, schema);
        const automationType = (automation as any).type;

        if (automationType === 'SUM' || automationType === 'COUNT') {
          // Initialize aggregations to 0
          lines.push(`  NEW.${col} := 0;`);
        } else {
          // MAX, MIN, LAST_VALUE, SNAPSHOT, SYNC: NULL
          lines.push(`  NEW.${col} := NULL;`);
        }
      } else if (columnDef.formula) {
        // Formula columns: NULL (will be calculated immediately after)
        lines.push(`  NEW.${col} := NULL;`);
      } else {
        // Default: NULL
        lines.push(`  NEW.${col} := NULL;`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate protection code for automated columns on UPDATE
   * - Formula columns: Reset to NULL (will be recalculated immediately)
   * - SYNC/SNAPSHOT: DO NOT reset - allow parent triggers to update them
   *   (Column-level permissions prevent user modification)
   * - Aggregations (SUM/COUNT/etc): DO NOT reset - updated by child triggers
   *   (Column-level permissions prevent user modification)
   */
  private generateAutomatedColumnProtectionUpdate(
    tableName: string,
    automatedColumns: string[],
    schema: GenLogicSchema,
    processedSchema: ProcessedSchema
  ): string {
    const lines: string[] = [];
    const formulaColumns: string[] = [];

    // Only reset FORMULA columns - they need recalculation
    for (const col of automatedColumns) {
      const columnDef = processedSchema.tables[tableName]?.columns[col];
      if (columnDef?.formula) {
        formulaColumns.push(col);
      }
      // IMPORTANT: Do NOT reset SYNC/SNAPSHOT/aggregation columns!
      // They must be updatable by triggers (parent SYNC pushes, child aggregation pushes)
      // Column-level permissions prevent USER modification
    }

    if (formulaColumns.length === 0) {
      return '';  // No protection needed if no formula columns
    }

    lines.push('  -- INTEGRITY: Reset formula columns for recalculation');
    for (const col of formulaColumns) {
      lines.push(`  NEW.${col} := NULL;`);
    }

    return lines.join('\n');
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
        autoCreateParents: [],
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
        if (column && typeof column === 'object' && 'formula' in column) {
          calculatedCols.push({
            name: columnName,
            expression: (column as any).formula
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
    // Check processedSchema.columns (which now includes ALL columns - explicit + FK-generated)
    for (const [targetTable, processedTable] of Object.entries(processedSchema.tables)) {
      if (!processedTable.columns) continue;

      for (const [targetColumn, columnDef] of Object.entries(processedTable.columns)) {
        if (!columnDef.automation) continue;

        const automationDef = columnDef.automation as AutomationDefinition;

        // Parse and resolve the automation
        let resolved;
        try {
          resolved = resolveAutomation(automationDef, targetTable, schema);
        } catch (err: any) {
          throw new Error(`Table '${targetTable}', column '${targetColumn}': ${err.message}`);
        }

        // Skip RULE_MATCH automations (handled separately)
        if ('mode' in resolved) continue;

        const automation = resolved as ParsedStandardAutomation;
        const sourceTable = automation.table;
        const fkName = automation.foreign_key!; // Always populated by resolveAutomation
        const sourceColumn = automation.column;

        if (['SUM', 'COUNT', 'MAX', 'MIN', 'LAST_VALUE'].includes(automation.type)) {
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

        } else if (['SNAPSHOT', 'SYNC'].includes(automation.type)) {
          // Cascade: sourceTable (parent) provides values to targetTable (child)
          // Automation is DEFINED on targetTable (child)
          // FK is FROM targetTable (child) TO sourceTable (parent)
          const fkColumns = this.getFKColumnNames(targetTable, sourceTable, fkName, processedSchema);

          // SYNC only: Trigger on parent to push updates to children
          if (automation.type === 'SYNC') {
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
              isFetchUpdates: true  // SYNC triggers on UPDATE
            });
          }

          // Both SNAPSHOT and SYNC: Trigger on child to pull from parent (when FK changes or on INSERT)
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

    // Collect auto_create (sync/spread) from foreign keys
    // Key insight: auto_create is on child table's FK, but triggers go on PARENT table
    for (const [childTableName, table] of Object.entries(schema.tables)) {
      if (!table.foreign_keys) continue;

      for (const [fkName, fk] of Object.entries(table.foreign_keys)) {
        if (!fk.auto_create) continue;

        const ac = fk.auto_create;
        const parentTableName = fk.table;

        if (ac.spread) {
          // SPREAD: Generate multiple rows in child table from parent table date range
          const spreadTarget: any = {
            targetTable: childTableName,  // Child table gets the generated rows
            parentTable: parentTableName,  // Parent table (for getting PK)
            spreadName: fkName,  // Use FK name instead of target table name
            operations: ac.on,
            generate: {
              startDate: ac.spread.start,
              endDate: ac.spread.end,
              interval: ac.spread.interval
            },
            trackingColumn: this.getFKColumnNames(childTableName, parentTableName, fkName, processedSchema)[0],  // FK column in child
            generatedColumn: ac.spread.generated_column  // NEW: column to populate with generated dates
          };
          if (ac.copy_columns) {
            spreadTarget.columnMap = ac.copy_columns;
          }
          if (ac.literals) {
            spreadTarget.literals = ac.literals;
          }
          if (ac.filter) {
            spreadTarget.matchConditions = [ac.filter];
          }
          // Trigger goes on PARENT table
          tableAutomations[parentTableName].spreadTargets.push(spreadTarget);

        } else {
          // SYNC: Simple 1:1 row copy from parent to child
          const syncTarget: any = {
            targetTable: childTableName,  // Child table gets the copied row
            syncName: fkName,  // Use FK name instead of target table name
            direction: 'push',  // Always push from parent to child
            operations: ac.on,
            matchColumns: {
              // The FK columns in child = parent PK
              [this.getTablePrimaryKeys(parentTableName, processedSchema)[0]]:
                this.getFKColumnNames(childTableName, parentTableName, fkName, processedSchema)[0]
            }
          };
          if (ac.copy_columns) {
            syncTarget.columnMap = ac.copy_columns;
          }
          if (ac.literals) {
            syncTarget.literals = ac.literals;
          }
          if (ac.filter) {
            syncTarget.matchConditions = [ac.filter];
          }
          // Trigger goes on PARENT table
          tableAutomations[parentTableName].syncTargets.push(syncTarget);
        }
      }
    }

    // Collect auto_create_parent from foreign keys
    // Key insight: auto_create_parent is on child table's FK, trigger goes on child table (BEFORE INSERT)
    for (const [childTableName, table] of Object.entries(schema.tables)) {
      if (!table.foreign_keys) continue;

      for (const [fkName, fkDef] of Object.entries(table.foreign_keys)) {
        const fk = typeof fkDef === 'string' ? { table: fkDef } : fkDef;
        if (!fk.auto_create_parent) continue;

        const parentTableName = fk.table;
        const fkColumns = this.getFKColumnNames(childTableName, parentTableName, fkName, processedSchema);
        const parentPKColumns = this.getTablePrimaryKeys(parentTableName, processedSchema);

        // Trigger goes on CHILD table (BEFORE INSERT to create parent before FK validation)
        tableAutomations[childTableName].autoCreateParents.push({
          parentTable: parentTableName,
          foreignKeyName: fkName,
          fkColumns,
          parentPKColumns
        });
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
   * Generate triggers for a table
   * Split into BEFORE (modifies NEW) and AFTER (cascades) triggers
   */
  private generateConsolidatedTriggers(tableName: string, automations: TableAutomations, schema: GenLogicSchema, processedSchema: ProcessedSchema): string[] {
    const triggers: string[] = [];

    // Determine which automations need BEFORE triggers (modify NEW row)
    // INTEGRITY: Any table with automated columns needs BEFORE INSERT to protect them
    const automatedColumns = this.getAutomatedColumns(tableName, schema, processedSchema);
    const hasAutomatedColumns = automatedColumns.length > 0;

    const needsBeforeInsert =
      hasAutomatedColumns ||
      automations.autoCreateParents.length > 0 ||
      automations.pullFromParents.length > 0 ||
      automations.calculatedColumns.length > 0;

    const needsBeforeUpdate =
      hasAutomatedColumns ||
      automations.autoCreateParents.length > 0 ||
      automations.pullFromParents.length > 0 ||
      automations.calculatedColumns.length > 0;

    // Determine which automations need AFTER triggers (cascade to other tables)
    const hasSyncInsert = automations.syncTargets.some(s => s.operations.includes('insert'));
    const hasSyncUpdate = automations.syncTargets.some(s => s.operations.includes('update'));
    const hasSyncDelete = automations.syncTargets.some(s => s.operations.includes('delete'));

    const hasSpreadInsert = automations.spreadTargets.some(s => s.operations.includes('insert'));
    const hasSpreadUpdate = automations.spreadTargets.some(s => s.operations.includes('update'));
    const hasSpreadDelete = automations.spreadTargets.some(s => s.operations.includes('delete'));

    const needsAfterInsert =
      automations.pushToChildren.length > 0 ||
      automations.pushToParents.length > 0 ||
      hasSyncInsert ||
      hasSpreadInsert;

    const needsAfterUpdate =
      automations.pushToChildren.length > 0 ||
      automations.pushToParents.length > 0 ||
      hasSyncUpdate ||
      hasSpreadUpdate;

    const needsDelete = automations.pushToParents.length > 0 || hasSyncDelete || hasSpreadDelete;

    // Generate INSERT triggers
    if (needsBeforeInsert) {
      triggers.push(this.generateBeforeInsertTrigger(tableName, automations, schema, processedSchema));
    }
    if (needsAfterInsert) {
      triggers.push(this.generateAfterInsertTrigger(tableName, automations, processedSchema));
    }

    // Generate UPDATE triggers
    if (needsBeforeUpdate) {
      triggers.push(this.generateBeforeUpdateTrigger(tableName, automations, schema, processedSchema));
    }
    if (needsAfterUpdate) {
      triggers.push(this.generateAfterUpdateTrigger(tableName, automations, processedSchema));
    }

    // Generate DELETE trigger (stays BEFORE - no serial value issue)
    if (needsDelete) {
      triggers.push(this.generateConsolidatedDeleteTrigger(tableName, automations, processedSchema));
    }

    return triggers;
  }

  /**
   * Generate BEFORE INSERT trigger (modifies NEW row)
   * Steps that must execute BEFORE row is written (to modify NEW)
   */
  private generateBeforeInsertTrigger(tableName: string, automations: TableAutomations, schema: GenLogicSchema, processedSchema: ProcessedSchema): string {
    const functionName = `${tableName}_before_insert_genlogic`;
    const triggerName = `${tableName}_before_insert_genlogic`;

    const sections: string[] = [];

    // Step -1: PROTECT AUTOMATED COLUMNS (prevent direct insertion of calculated values)
    const automatedColumns = this.getAutomatedColumns(tableName, schema, processedSchema);
    if (automatedColumns.length > 0) {
      sections.push(this.generateAutomatedColumnProtection(tableName, automatedColumns, 'INSERT', schema, processedSchema));
    }

    // Step 0: AUTO-CREATE PARENT (must be first - runs before FK constraint validation)
    const autoCreate = this.generateAutoCreateParent(automations, processedSchema);
    if (autoCreate) sections.push(autoCreate);

    // Step 1: PULL from parents (fetch values into NEW)
    const pulls = this.generatePullFromParents(automations, 'INSERT', processedSchema);
    if (pulls) sections.push(pulls);

    // Step 2: Calculate columns (compute values into NEW)
    const calcs = this.generateCalculatedColumns(automations);
    if (calcs) sections.push(calcs);

    const functionBody = sections.length > 0 ? sections.join('\n\n') : '  -- No automations for BEFORE INSERT';

    return `
CREATE OR REPLACE FUNCTION ${functionName}()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
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
   * Generate AFTER INSERT trigger (cascades to other tables)
   * Steps that cascade operations AFTER row is written (serial values available)
   */
  private generateAfterInsertTrigger(tableName: string, automations: TableAutomations, processedSchema: ProcessedSchema): string {
    const functionName = `${tableName}_after_insert_genlogic`;
    const triggerName = `${tableName}_after_insert_genlogic`;

    const sections: string[] = [];

    // Step 3: PUSH to children (SYNC cascade)
    const fetchPushes = this.generatePushToChildren(automations, 'INSERT');
    if (fetchPushes) sections.push(fetchPushes);

    // Step 4: PUSH to parents (aggregations)
    const pushes = this.generatePushToParents(automations, 'INSERT', processedSchema);
    if (pushes) sections.push(pushes);

    // Step 5: SYNC to other tables
    const syncs = this.generateSyncOperations(automations, 'INSERT');
    if (syncs) sections.push(syncs);

    // Step 6: SPREAD to other tables (generate multiple rows - NOW HAS SERIAL PK!)
    const spreads = this.generateSpreadOperations(automations, 'INSERT', tableName, processedSchema);
    if (spreads) sections.push(spreads);

    const functionBody = sections.length > 0 ? sections.join('\n\n') : '  -- No automations for AFTER INSERT';

    return `
CREATE OR REPLACE FUNCTION ${functionName}()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
${functionBody}

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ${triggerName}
  AFTER INSERT ON ${tableName}
  FOR EACH ROW EXECUTE FUNCTION ${functionName}();
`;
  }

  /**
   * Generate BEFORE UPDATE trigger (modifies NEW row)
   * Steps that must execute BEFORE row is written (to modify NEW)
   */
  private generateBeforeUpdateTrigger(tableName: string, automations: TableAutomations, schema: GenLogicSchema, processedSchema: ProcessedSchema): string {
    const functionName = `${tableName}_before_update_genlogic`;
    const triggerName = `${tableName}_before_update_genlogic`;

    const sections: string[] = [];

    // Step -1: PROTECT AUTOMATED COLUMNS (prevent direct modification)
    const automatedColumns = this.getAutomatedColumns(tableName, schema, processedSchema);
    if (automatedColumns.length > 0) {
      sections.push(this.generateAutomatedColumnProtectionUpdate(tableName, automatedColumns, schema, processedSchema));
    }

    // Step 0: AUTO-CREATE PARENT (if FK value changed to non-existent parent)
    const autoCreate = this.generateAutoCreateParent(automations, processedSchema);
    if (autoCreate) sections.push(autoCreate);

    // Step 1: PULL from parents (if FK changed, fetch values into NEW)
    const pulls = this.generatePullFromParents(automations, 'UPDATE', processedSchema);
    if (pulls) sections.push(pulls);

    // Step 2: Calculate columns (compute values into NEW)
    const calcs = this.generateCalculatedColumns(automations);
    if (calcs) sections.push(calcs);

    const functionBody = sections.length > 0 ? sections.join('\n\n') : '  -- No automations for BEFORE UPDATE';

    return `
CREATE OR REPLACE FUNCTION ${functionName}()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
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
   * Generate AFTER UPDATE trigger (cascades to other tables)
   * Steps that cascade operations AFTER row is written
   */
  private generateAfterUpdateTrigger(tableName: string, automations: TableAutomations, processedSchema: ProcessedSchema): string {
    const functionName = `${tableName}_after_update_genlogic`;
    const triggerName = `${tableName}_after_update_genlogic`;

    const sections: string[] = [];

    // Step 3: PUSH to children (SYNC cascade with change detection)
    const pushes = this.generatePushToChildren(automations, 'UPDATE');
    if (pushes) sections.push(pushes);

    // Step 4: PUSH to parents (aggregations with change detection)
    const parentPushes = this.generatePushToParents(automations, 'UPDATE', processedSchema);
    if (parentPushes) sections.push(parentPushes);

    // Step 5: SYNC to other tables
    const syncs = this.generateSyncOperations(automations, 'UPDATE');
    if (syncs) sections.push(syncs);

    // Step 6: SPREAD to other tables (regenerate if dates changed)
    const spreads = this.generateSpreadOperations(automations, 'UPDATE', tableName, processedSchema);
    if (spreads) sections.push(spreads);

    const functionBody = sections.length > 0 ? sections.join('\n\n') : '  -- No automations for AFTER UPDATE';

    return `
CREATE OR REPLACE FUNCTION ${functionName}()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
${functionBody}

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ${triggerName}
  AFTER UPDATE ON ${tableName}
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
    const spreads = this.generateSpreadOperations(automations, 'DELETE', tableName, processedSchema);
    if (spreads) sections.push(spreads);

    const functionBody = sections.length > 0 ? sections.join('\n\n') : '  -- No automations for DELETE';

    return `
CREATE OR REPLACE FUNCTION ${functionName}()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
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
   * Generate PUSH to children logic (SYNC only)
   */
  private generatePushToChildren(automations: TableAutomations, operation: 'INSERT' | 'UPDATE'): string | null {
    if (automations.pushToChildren.length === 0) return null;

    const sections: string[] = [];
    sections.push('  -- Step 2: PUSH to children (cascade parent values)');

    for (const push of automations.pushToChildren) {
      const setStatements: string[] = [];
      const changedColumns: string[] = [];

      for (const col of push.columns) {
        // SYNC: triggers on both INSERT and UPDATE (keep synchronized)
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
   * Generate auto_create_parent logic
   * Creates parent row if it doesn't exist (BEFORE INSERT only)
   */
  private generateAutoCreateParent(automations: TableAutomations, processedSchema: ProcessedSchema): string | null {
    if (automations.autoCreateParents.length === 0) return null;

    const sections: string[] = [];
    sections.push('  -- Step 0: AUTO-CREATE PARENT (if parent row does not exist)');

    for (const autoCreate of automations.autoCreateParents) {
      // Build INSERT statement for parent table
      // Only populate PK columns with values from child FK columns
      const pkColumnList = autoCreate.parentPKColumns.join(', ');
      const fkValueList = autoCreate.fkColumns.map(fkCol => `NEW.${fkCol}`).join(', ');

      // Build WHERE clause to check if parent exists
      const whereConditions = autoCreate.fkColumns.map((fkCol, idx) => {
        const pkCol = autoCreate.parentPKColumns[idx];
        return `${pkCol} = NEW.${fkCol}`;
      }).join(' AND ');

      sections.push(`  -- Auto-create parent '${autoCreate.parentTable}' if it doesn't exist`);
      sections.push(`  IF NEW.${autoCreate.fkColumns[0]} IS NOT NULL AND NOT EXISTS (`);
      sections.push(`    SELECT 1 FROM ${autoCreate.parentTable} WHERE ${whereConditions}`);
      sections.push(`  ) THEN`);
      sections.push(`    INSERT INTO ${autoCreate.parentTable} (${pkColumnList})`);
      sections.push(`    VALUES (${fkValueList})`);
      sections.push(`    ON CONFLICT DO NOTHING;  -- Handle race conditions`);
      sections.push(`  END IF;`);
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
   * Convert @column references to NEW.column in generated expressions
   * Converts: "@debits - @credits" to "NEW.debits - NEW.credits"
   * Preserves: everything else (literals, functions, keywords, SQL syntax)
   */
  private qualifyColumnReferences(expression: string, tableName: string): string {
    // Simple transformation: replace @column_name with NEW.column_name
    // The @ sigil is our contract with the user - it marks column references unambiguously
    return expression.replace(/@(\w+)/g, 'NEW.$1');
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
          // UPDATE: Handle both FK changes and value changes
          sections.push(this.generateAggregationUpdate(agg, push, processedSchema));

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
    // All columns (including FK-generated) are now in table.columns
    const allColumns = table.columns;

    for (const [colName, colDef] of Object.entries(allColumns)) {
      if (colDef.primary_key) {
        pkColumns.push(colName);
      }
    }

    return pkColumns.length > 0 ? pkColumns : ['id']; // Fallback to 'id'
  }

  /**
   * Generate aggregation INSERT logic
   * Uses COALESCE to handle NULL parent columns defensively
   * Even with DEFAULT 0, parent columns may be manually set to NULL
   */
  private generateAggregationInsert(agg: any, push: any, row: string, processedSchema: ProcessedSchema): string {
    const fkCol = push.fkColumns[0]; // Assume single FK column
    const parentPK = this.getTablePrimaryKeys(push.parentTable, processedSchema)[0]; // Use first PK

    switch (agg.aggregationType) {
      case 'SUM':
        return `    UPDATE ${push.parentTable} SET ${agg.parentColumn} = COALESCE(${agg.parentColumn}, 0) + COALESCE(${row}.${agg.childColumn}, 0) WHERE ${parentPK} = ${row}.${fkCol};`;
      case 'COUNT':
        return `    UPDATE ${push.parentTable} SET ${agg.parentColumn} = COALESCE(${agg.parentColumn}, 0) + 1 WHERE ${parentPK} = ${row}.${fkCol};`;
      case 'MAX':
        return `    UPDATE ${push.parentTable} SET ${agg.parentColumn} = COALESCE(GREATEST(${agg.parentColumn}, ${row}.${agg.childColumn}), ${row}.${agg.childColumn}, ${agg.parentColumn}) WHERE ${parentPK} = ${row}.${fkCol};`;
      case 'MIN':
        return `    UPDATE ${push.parentTable} SET ${agg.parentColumn} = COALESCE(LEAST(${agg.parentColumn}, ${row}.${agg.childColumn}), ${row}.${agg.childColumn}, ${agg.parentColumn}) WHERE ${parentPK} = ${row}.${fkCol};`;
      case 'LAST_VALUE':
        return `    UPDATE ${push.parentTable} SET ${agg.parentColumn} = ${row}.${agg.childColumn} WHERE ${parentPK} = ${row}.${fkCol};`;
      default:
        return `    -- Unsupported aggregation type: ${agg.aggregationType}`;
    }
  }

  /**
   * Generate aggregation UPDATE logic (incremental)
   * Uses COALESCE to handle NULL parent columns defensively
   * Handles FK changes: NULL=>Value, old_value=>new_value, value=>NULL
   */
  private generateAggregationUpdate(agg: any, push: any, processedSchema: ProcessedSchema): string {
    const fkCol = push.fkColumns[0];
    const parentPK = this.getTablePrimaryKeys(push.parentTable, processedSchema)[0];

    switch (agg.aggregationType) {
      case 'SUM':
        // Handle both FK changes and value changes
        return `  -- Handle FK changes and value changes for SUM
  IF OLD.${fkCol} IS DISTINCT FROM NEW.${fkCol} THEN
    -- FK changed: subtract from old parent, add to new parent
    IF OLD.${fkCol} IS NOT NULL THEN
      UPDATE ${push.parentTable} SET ${agg.parentColumn} = COALESCE(${agg.parentColumn}, 0) - COALESCE(OLD.${agg.childColumn}, 0) WHERE ${parentPK} = OLD.${fkCol};
    END IF;
    IF NEW.${fkCol} IS NOT NULL THEN
      UPDATE ${push.parentTable} SET ${agg.parentColumn} = COALESCE(${agg.parentColumn}, 0) + COALESCE(NEW.${agg.childColumn}, 0) WHERE ${parentPK} = NEW.${fkCol};
    END IF;
  ELSIF OLD.${agg.childColumn} IS DISTINCT FROM NEW.${agg.childColumn} THEN
    -- Value changed but FK stayed the same
    IF NEW.${fkCol} IS NOT NULL THEN
      UPDATE ${push.parentTable} SET ${agg.parentColumn} = COALESCE(${agg.parentColumn}, 0) - COALESCE(OLD.${agg.childColumn}, 0) + COALESCE(NEW.${agg.childColumn}, 0) WHERE ${parentPK} = NEW.${fkCol};
    END IF;
  END IF;`;
      case 'COUNT':
        // Handle FK changes for COUNT
        return `  -- Handle FK changes for COUNT
  IF OLD.${fkCol} IS DISTINCT FROM NEW.${fkCol} THEN
    -- FK changed: decrement old parent, increment new parent
    IF OLD.${fkCol} IS NOT NULL THEN
      UPDATE ${push.parentTable} SET ${agg.parentColumn} = GREATEST(COALESCE(${agg.parentColumn}, 0) - 1, 0) WHERE ${parentPK} = OLD.${fkCol};
    END IF;
    IF NEW.${fkCol} IS NOT NULL THEN
      UPDATE ${push.parentTable} SET ${agg.parentColumn} = COALESCE(${agg.parentColumn}, 0) + 1 WHERE ${parentPK} = NEW.${fkCol};
    END IF;
  END IF;`;
      case 'MAX':
        return `    -- MAX: recalculate if needed (full scan fallback)`;
      case 'MIN':
        return `    -- MIN: recalculate if needed (full scan fallback)`;
      case 'LAST_VALUE':
        // LAST_VALUE also needs to handle FK changes
        return `  -- Handle FK changes for LAST_VALUE
  IF OLD.${fkCol} IS DISTINCT FROM NEW.${fkCol} OR OLD.${agg.childColumn} IS DISTINCT FROM NEW.${agg.childColumn} THEN
    IF NEW.${fkCol} IS NOT NULL THEN
      UPDATE ${push.parentTable} SET ${agg.parentColumn} = NEW.${agg.childColumn} WHERE ${parentPK} = NEW.${fkCol};
    END IF;
  END IF;`;
      default:
        return `    -- Unsupported aggregation type: ${agg.aggregationType}`;
    }
  }

  /**
   * Generate aggregation DELETE logic
   * Uses COALESCE to handle NULL parent columns defensively
   */
  private generateAggregationDelete(agg: any, push: any, row: string, processedSchema: ProcessedSchema): string {
    const fkCol = push.fkColumns[0];
    const parentPK = this.getTablePrimaryKeys(push.parentTable, processedSchema)[0];

    switch (agg.aggregationType) {
      case 'SUM':
        return `  UPDATE ${push.parentTable} SET ${agg.parentColumn} = COALESCE(${agg.parentColumn}, 0) - COALESCE(${row}.${agg.childColumn}, 0) WHERE ${parentPK} = ${row}.${fkCol};`;
      case 'COUNT':
        return `  UPDATE ${push.parentTable} SET ${agg.parentColumn} = GREATEST(COALESCE(${agg.parentColumn}, 0) - 1, 0) WHERE ${parentPK} = ${row}.${fkCol};`;
      case 'MAX':
        return `  -- MAX: recalculate (full scan fallback)`;
      case 'MIN':
        return `  -- MIN: recalculate (full scan fallback)`;
      case 'LAST_VALUE':
        return `  -- LAST_VALUE: get next most recent (full scan fallback)`;
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
        values.push(literal);  // Already a SQL literal value
      }
    }

    const insertSQL = `  INSERT INTO ${sync.targetTable} (${columns.join(', ')})
  VALUES (${values.join(', ')});`;

    // Wrap in IF statement if there's a filter condition
    if (sync.matchConditions && sync.matchConditions.length > 0) {
      return `  IF ${sync.matchConditions.join(' AND ')} THEN
${insertSQL}
  END IF;`;
    }

    return insertSQL;
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
  private generateSpreadOperations(automations: TableAutomations, operation: 'INSERT' | 'UPDATE' | 'DELETE', parentTableName: string, processedSchema: ProcessedSchema): string | null {
    const spreads = automations.spreadTargets.filter(s => s.operations.includes(operation.toLowerCase() as any));
    if (spreads.length === 0) return null;

    const sections: string[] = [];
    sections.push(`  -- Step 6: SPREAD to other tables (generate multiple rows)`);

    for (const spread of spreads) {
      if (operation === 'INSERT') {
        sections.push(this.generateSpreadInsert(spread, parentTableName, processedSchema));
      } else if (operation === 'UPDATE') {
        sections.push(this.generateSpreadUpdate(spread, parentTableName, processedSchema));
      } else if (operation === 'DELETE') {
        sections.push(this.generateSpreadDelete(spread, parentTableName, processedSchema));
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Generate SPREAD INSERT: Loop through date range and insert rows
   * NOTE: This runs in parent table's AFTER INSERT trigger, so NEW refers to parent row
   */
  private generateSpreadInsert(spread: any, parentTableName: string, processedSchema: ProcessedSchema): string {
    const { targetTable, generate, columnMap, literals, trackingColumn, generatedColumn } = spread;

    // Get parent table's primary key column
    const parentPKColumns = this.getTablePrimaryKeys(parentTableName, processedSchema);
    const parentPKCol = parentPKColumns[0];  // Assume single-column PK for now

    // Build column list - trackingColumn (FK) and generated date column
    const columns: string[] = [trackingColumn, generatedColumn];
    const valueRefs: string[] = [];

    // Add column_map columns (parent column -> child column)
    if (columnMap) {
      for (const [parentCol, childCol] of Object.entries(columnMap)) {
        columns.push(childCol as string);
        valueRefs.push(`NEW.${parentCol}`);
      }
    }

    // Add literals
    if (literals) {
      for (const [childCol, literal] of Object.entries(literals)) {
        columns.push(childCol);
        valueRefs.push(literal);  // Already a literal SQL value
      }
    }

    // Build optional WHERE filter
    const filterCheck = spread.matchConditions ? `  IF ${spread.matchConditions.join(' AND ')} THEN\n` : '';
    const filterEnd = spread.matchConditions ? `  END IF;\n` : '';

    return `  -- SPREAD: Generate rows from ${generate.startDate} to ${generate.endDate} with interval ${generate.interval}${spread.matchConditions ? ' (filtered)' : ''}
${filterCheck}  DECLARE
    v_current_date DATE;
  BEGIN
    v_current_date := NEW.${generate.startDate};
    WHILE v_current_date <= NEW.${generate.endDate} LOOP
      INSERT INTO ${targetTable} (${columns.join(', ')})
      VALUES (NEW.${parentPKCol}, v_current_date${valueRefs.length > 0 ? ', ' + valueRefs.join(', ') : ''});

      v_current_date := v_current_date + (NEW.${generate.interval})::INTERVAL;
    END LOOP;
  END;
${filterEnd}`;
  }

  /**
   * Generate SPREAD UPDATE: Delete and regenerate if dates changed
   */
  private generateSpreadUpdate(spread: any, parentTableName: string, processedSchema: ProcessedSchema): string {
    const { targetTable, generate, trackingColumn } = spread;
    const parentPKColumns = this.getTablePrimaryKeys(parentTableName, processedSchema);
    const parentPKCol = parentPKColumns[0];

    // Check if any of the generate fields changed
    const changeDetection = `(OLD.${generate.startDate} IS DISTINCT FROM NEW.${generate.startDate} OR ` +
                           `OLD.${generate.endDate} IS DISTINCT FROM NEW.${generate.endDate} OR ` +
                           `OLD.${generate.interval} IS DISTINCT FROM NEW.${generate.interval})`;

    return `  -- SPREAD UPDATE: Regenerate if dates/interval changed
  IF ${changeDetection} THEN
    DELETE FROM ${targetTable} WHERE ${trackingColumn} = OLD.${parentPKCol};
    ${this.generateSpreadInsert(spread, parentTableName, processedSchema).replace(/^/gm, '  ')}
  END IF;`;
  }

  /**
   * Generate SPREAD DELETE: Delete all generated rows
   */
  private generateSpreadDelete(spread: any, parentTableName: string, processedSchema: ProcessedSchema): string {
    const { targetTable, trackingColumn } = spread;
    const parentPKColumns = this.getTablePrimaryKeys(parentTableName, processedSchema);
    const parentPKCol = parentPKColumns[0];

    return `  -- SPREAD DELETE: Remove all generated rows
  DELETE FROM ${targetTable} WHERE ${trackingColumn} = OLD.${parentPKCol};`;
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
