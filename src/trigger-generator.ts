import type { GenLogicSchema, AutomationDefinition } from './types.js';
import type { ProcessedSchema } from './schema-processor.js';

// Types for efficient trigger generation
interface AutomationPath {
  sourceTable: string;
  targetTable: string;
  foreignKeyName: string;
  aggregations: Array<{ targetColumn: string; automation: AutomationDefinition }>;
  cascades: Array<{ targetColumn: string; automation: AutomationDefinition }>;
  multiRow: Array<{ targetColumn: string; automation: AutomationDefinition }>;
}

/**
 * Trigger Generation Engine
 *
 * GENLOGIC CORE BUSINESS LOGIC: Generate PostgreSQL triggers for all automation types
 * This is where the "business logic in the database" actually happens
 */
export class TriggerGenerator {

  /**
   * Generate all automation triggers for the schema
   * OPTIMIZED APPROACH: Group automations by FK path for efficiency
   */
  generateTriggers(schema: GenLogicSchema, processedSchema: ProcessedSchema): string[] {
    const triggerSQL: string[] = [];

    if (!schema.tables) return triggerSQL;

    // Group automations by data flow path (source_table → target_table via FK)
    const automationPaths = this.groupAutomationsByPath(schema);

    // Generate consolidated triggers for each path
    for (const [_pathKey, pathData] of automationPaths) {
      const triggers = this.generatePathTriggers(pathData, processedSchema);
      triggerSQL.push(...triggers);
    }

    return triggerSQL;
  }

  /**
   * Group automations by their data flow path for efficient trigger generation
   * Path key format: "source_table→target_table→fk_name"
   */
  private groupAutomationsByPath(schema: GenLogicSchema): Map<string, AutomationPath> {
    const paths = new Map<string, AutomationPath>();

    if (!schema.tables) return paths;

    // Collect all automations and group by their data flow path
    for (const [targetTable, table] of Object.entries(schema.tables)) {
      if (table.columns) {
        for (const [targetColumn, column] of Object.entries(table.columns)) {
          let automation: AutomationDefinition | null = null;

          // Extract automation from various column definition types
          if (column && typeof column === 'object' && 'automation' in column) {
            automation = (column as any).automation;
          }

          if (automation) {
            const sourceTable = automation.table;
            const fkName = automation.foreign_key;
            const pathKey = `${sourceTable}→${targetTable}→${fkName}`;

            if (!paths.has(pathKey)) {
              paths.set(pathKey, {
                sourceTable,
                targetTable,
                foreignKeyName: fkName,
                aggregations: [],
                cascades: [],
                multiRow: []
              });
            }

            const path = paths.get(pathKey)!;

            // Categorize automation by type for different trigger generation
            if (['SUM', 'COUNT', 'MAX', 'MIN', 'LATEST'].includes(automation.type)) {
              path.aggregations.push({
                targetColumn,
                automation
              });
            } else if (['FETCH', 'FETCH_UPDATES'].includes(automation.type)) {
              path.cascades.push({
                targetColumn,
                automation
              });
            } else if (['DOMINANT', 'QUEUEPOS'].includes(automation.type)) {
              path.multiRow.push({
                targetColumn,
                automation
              });
            }
          }
        }
      }
    }

    return paths;
  }

  /**
   * Generate consolidated triggers for a data flow path
   * EFFICIENCY: One trigger handles all automations for the same FK relationship
   */
  private generatePathTriggers(path: AutomationPath, processedSchema: ProcessedSchema): string[] {
    const triggers: string[] = [];

    // Generate aggregation trigger (child → parent updates)
    if (path.aggregations.length > 0) {
      triggers.push(this.generateAggregationTrigger(path, processedSchema));
    }

    // Generate cascade trigger (parent → child updates)
    if (path.cascades.length > 0) {
      triggers.push(this.generateCascadeTrigger(path, processedSchema));
    }

    // Generate multi-row triggers (same-table constraints)
    if (path.multiRow.length > 0) {
      triggers.push(...this.generateMultiRowTriggers(path, processedSchema));
    }

    return triggers;
  }

  /**
   * Generate single aggregation trigger using INCREMENTAL updates with OLD/NEW values
   * EFFICIENCY: O(1) operations using arithmetic instead of O(n) table scans
   */
  private generateAggregationTrigger(path: AutomationPath, _processedSchema: ProcessedSchema): string {
    const sourceTable = path.sourceTable;
    const targetTable = path.targetTable;
    const functionName = `update_${targetTable}_from_${sourceTable}_${path.foreignKeyName}`;
    const triggerName = `${sourceTable}_update_${targetTable}_aggregations_genlogic`;

    // Generate incremental logic for each operation type
    const insertStatements = this.generateIncrementalInsertLogic(path);
    const updateStatements = this.generateIncrementalUpdateLogic(path);
    const deleteStatements = this.generateIncrementalDeleteLogic(path);

    const triggerFunction = `
CREATE OR REPLACE FUNCTION ${functionName}()
RETURNS TRIGGER AS $$
DECLARE
  current_parent_record RECORD;
BEGIN
  -- INCREMENTAL APPROACH: Use OLD/NEW values for O(1) performance

  IF TG_OP = 'INSERT' THEN
    -- Incremental updates using NEW values
    UPDATE ${targetTable} SET
      ${insertStatements.join(',\n      ')}
    WHERE id = NEW.account_id;

  ELSIF TG_OP = 'DELETE' THEN
    -- Incremental updates using OLD values (with fallback for MIN/MAX)
    SELECT * INTO current_parent_record FROM ${targetTable} WHERE id = OLD.account_id;
    IF FOUND THEN
      UPDATE ${targetTable} SET
        ${deleteStatements.join(',\n        ')}
      WHERE id = OLD.account_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle change in FK relationship or value changes
    IF OLD.account_id != NEW.account_id THEN
      -- FK changed - remove from old parent, add to new parent
      SELECT * INTO current_parent_record FROM ${targetTable} WHERE id = OLD.account_id;
      IF FOUND THEN
        UPDATE ${targetTable} SET
          ${deleteStatements.join(',\n          ')}
        WHERE id = OLD.account_id;
      END IF;

      UPDATE ${targetTable} SET
        ${insertStatements.join(',\n        ')}
      WHERE id = NEW.account_id;
    ELSE
      -- Same parent, value changed - incremental update
      SELECT * INTO current_parent_record FROM ${targetTable} WHERE id = NEW.account_id;
      IF FOUND THEN
        UPDATE ${targetTable} SET
          ${updateStatements.join(',\n          ')}
        WHERE id = NEW.account_id;
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ${triggerName}
  AFTER INSERT OR UPDATE OR DELETE ON ${sourceTable}
  FOR EACH ROW EXECUTE FUNCTION ${functionName}();
`;

    return triggerFunction;
  }

  /**
   * Generate incremental INSERT logic - always additive
   */
  private generateIncrementalInsertLogic(path: AutomationPath): string[] {
    const statements: string[] = [];

    for (const agg of path.aggregations) {
      const { targetColumn, automation } = agg;
      const sourceColumn = automation.column;

      switch (automation.type) {
        case 'SUM':
          statements.push(`${targetColumn} = COALESCE(${targetColumn}, 0) + COALESCE(NEW.${sourceColumn}, 0)`);
          break;
        case 'COUNT':
          statements.push(`${targetColumn} = COALESCE(${targetColumn}, 0) + 1`);
          break;
        case 'MAX':
          statements.push(`${targetColumn} = GREATEST(COALESCE(${targetColumn}, NEW.${sourceColumn}), NEW.${sourceColumn})`);
          break;
        case 'MIN':
          statements.push(`${targetColumn} = LEAST(COALESCE(${targetColumn}, NEW.${sourceColumn}), NEW.${sourceColumn})`);
          break;
        case 'LATEST':
          // Always push new value - by definition it's the latest
          statements.push(`${targetColumn} = NEW.${sourceColumn}`);
          break;
      }
    }

    return statements;
  }

  /**
   * Generate incremental UPDATE logic - handle value changes
   */
  private generateIncrementalUpdateLogic(path: AutomationPath): string[] {
    const statements: string[] = [];

    for (const agg of path.aggregations) {
      const { targetColumn, automation } = agg;
      const sourceColumn = automation.column;

      switch (automation.type) {
        case 'SUM':
          statements.push(`${targetColumn} = COALESCE(${targetColumn}, 0) - COALESCE(OLD.${sourceColumn}, 0) + COALESCE(NEW.${sourceColumn}, 0)`);
          break;
        case 'COUNT':
          // Count doesn't change on UPDATE unless the value goes from/to NULL
          statements.push(`${targetColumn} = ${targetColumn} +
            CASE WHEN OLD.${sourceColumn} IS NULL AND NEW.${sourceColumn} IS NOT NULL THEN 1
                 WHEN OLD.${sourceColumn} IS NOT NULL AND NEW.${sourceColumn} IS NULL THEN -1
                 ELSE 0 END`);
          break;
        case 'MAX':
          statements.push(`${targetColumn} =
            CASE
              WHEN NEW.${sourceColumn} > COALESCE(${targetColumn}, NEW.${sourceColumn}) THEN NEW.${sourceColumn}
              WHEN OLD.${sourceColumn} = ${targetColumn} AND NEW.${sourceColumn} < OLD.${sourceColumn} THEN
                (SELECT MAX(${sourceColumn}) FROM ${path.sourceTable} WHERE account_id = current_parent_record.id)
              ELSE ${targetColumn}
            END`);
          break;
        case 'MIN':
          statements.push(`${targetColumn} =
            CASE
              WHEN NEW.${sourceColumn} < COALESCE(${targetColumn}, NEW.${sourceColumn}) THEN NEW.${sourceColumn}
              WHEN OLD.${sourceColumn} = ${targetColumn} AND NEW.${sourceColumn} > OLD.${sourceColumn} THEN
                (SELECT MIN(${sourceColumn}) FROM ${path.sourceTable} WHERE account_id = current_parent_record.id)
              ELSE ${targetColumn}
            END`);
          break;
        case 'LATEST':
          // Always push new value - by definition it's the latest
          statements.push(`${targetColumn} = NEW.${sourceColumn}`);
          break;
      }
    }

    return statements;
  }

  /**
   * Generate incremental DELETE logic - subtractive with fallback for MIN/MAX
   */
  private generateIncrementalDeleteLogic(path: AutomationPath): string[] {
    const statements: string[] = [];

    for (const agg of path.aggregations) {
      const { targetColumn, automation } = agg;
      const sourceColumn = automation.column;

      switch (automation.type) {
        case 'SUM':
          statements.push(`${targetColumn} = COALESCE(${targetColumn}, 0) - COALESCE(OLD.${sourceColumn}, 0)`);
          break;
        case 'COUNT':
          statements.push(`${targetColumn} = GREATEST(COALESCE(${targetColumn}, 1) - 1, 0)`);
          break;
        case 'MAX':
          // Only recalculate if we're deleting the current maximum
          statements.push(`${targetColumn} =
            CASE
              WHEN OLD.${sourceColumn} = current_parent_record.${targetColumn} THEN
                (SELECT MAX(${sourceColumn}) FROM ${path.sourceTable} WHERE account_id = current_parent_record.id AND id != OLD.id)
              ELSE current_parent_record.${targetColumn}
            END`);
          break;
        case 'MIN':
          // Only recalculate if we're deleting the current minimum
          statements.push(`${targetColumn} =
            CASE
              WHEN OLD.${sourceColumn} = current_parent_record.${targetColumn} THEN
                (SELECT MIN(${sourceColumn}) FROM ${path.sourceTable} WHERE account_id = current_parent_record.id AND id != OLD.id)
              ELSE current_parent_record.${targetColumn}
            END`);
          break;
        case 'LATEST':
          // LATEST on delete: get the most recent remaining record
          statements.push(`${targetColumn} =
            (SELECT ${sourceColumn} FROM ${path.sourceTable}
             WHERE account_id = current_parent_record.id AND id != OLD.id
             ORDER BY updated_at DESC LIMIT 1)`);
          break;
      }
    }

    return statements;
  }

  /**
   * Generate cascade trigger for FETCH/FETCH_UPDATES automations
   */
  private generateCascadeTrigger(path: AutomationPath, _processedSchema: ProcessedSchema): string {
    const sourceTable = path.sourceTable; // This is actually the parent in cascade operations
    const targetTable = path.targetTable; // This is actually the child in cascade operations

    // Note: For cascades, the direction is reversed - parent updates cascade to children
    return `-- CASCADE trigger for ${path.foreignKeyName}: ${sourceTable} → ${targetTable} (implementation needed)`;
  }

  /**
   * Generate multi-row constraint triggers for DOMINANT/QUEUEPOS
   */
  private generateMultiRowTriggers(path: AutomationPath, _processedSchema: ProcessedSchema): string[] {
    const triggers: string[] = [];

    for (const multiRow of path.multiRow) {
      triggers.push(`-- MULTI-ROW trigger for ${multiRow.targetColumn} type ${multiRow.automation.type} (implementation needed)`);
    }

    return triggers;
  }

}