import Ajv from 'ajv';
import type { GenLogicSchema, ValidationResult } from './types';
import { DataFlowGraphValidator } from './graph.js';
import { parseAutomationString, inferForeignKey } from './automation-parser.js';
import jsonSchema from './genlogic-schema.json' assert { type: 'json' };

export class SchemaValidator {
  private ajv: Ajv;
  private validateSchema: any;
  private graphValidator: DataFlowGraphValidator;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false // Allow unknown keywords in our schema
    });
    this.validateSchema = this.ajv.compile(jsonSchema);
    this.graphValidator = new DataFlowGraphValidator();
  }

  /**
   * PHASE 1: Syntax validation using JSON Schema
   * This validates structure, types, and basic rules
   * Also includes cycle detection for foreign keys and calculated columns
   */
  validateSyntax(schema: any): ValidationResult {
    const isValid = this.validateSchema(schema);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!isValid && this.validateSchema.errors) {
      for (const error of this.validateSchema.errors) {
        const path = error.instancePath || 'root';
        errors.push(`${path}: ${error.message}`);
      }
    }

    // If basic syntax is valid, also check for cycles
    if (isValid) {
      const graphResult = this.graphValidator.validateDataFlowSafety(schema);
      if (!graphResult.isValid) {
        errors.push(...graphResult.errors);
        warnings.push(...graphResult.warnings);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * PHASE 2.4: Validate automation foreign key inference
   * This must run BEFORE trigger generation to catch ambiguous FK references early
   */
  validateAutomationInference(schema: GenLogicSchema): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!schema.tables) {
      return { isValid: true, errors: [], warnings: [] };
    }

    for (const [tableName, table] of Object.entries(schema.tables)) {
      if (!table.columns) continue;

      for (const [columnName, column] of Object.entries(table.columns)) {
        // Check for automation in all column definition types
        if (!column || typeof column !== 'object' || !('automation' in column)) {
          continue;
        }

        const automationDef = (column as any).automation;
        if (!automationDef) continue;

        // Parse automation string
        let automation;
        if (typeof automationDef === 'string') {
          try {
            automation = parseAutomationString(automationDef);
          } catch (err: any) {
            // Already caught in cross-reference validation
            continue;
          }
        } else {
          automation = automationDef;
        }

        // Skip RULE_MATCH automations - they don't use FK inference
        if ('mode' in automation) {
          continue;
        }

        // If FK is already specified, skip inference check
        if (automation.foreign_key) {
          continue;
        }

        // Determine which table has the FK
        const isAggregation = ['SUM', 'COUNT', 'MAX', 'MIN', 'LAST_VALUE'].includes(automation.type);
        let childTableName: string;
        let parentTableName: string;

        if (isAggregation) {
          // Aggregation: tableWithAutomation is parent, referencedTable is child
          childTableName = automation.table;
          parentTableName = tableName;
        } else {
          // SYNC/SNAPSHOT: tableWithAutomation is child, referencedTable is parent
          childTableName = tableName;
          parentTableName = automation.table;
        }

        // Try to infer FK - this will throw if ambiguous or missing
        try {
          inferForeignKey(childTableName, parentTableName, schema);
        } catch (err: any) {
          errors.push(
            `Table '${tableName}', column '${columnName}': ${err.message}`
          );
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * DEPRECATED - Auto_create validation is now integrated into processTableWithValidation
   * Validation happens during schema processing, not as a separate phase
   */
  private validateSyncDefinitionsDeprecated(schema: GenLogicSchema, processedSchema: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!schema.tables) {
      return { isValid: true, errors: [], warnings: [] };
    }

    // Helper to get all columns (both explicit and generated)
    const getAllColumns = (tableName: string): Set<string> => {
      const table = processedSchema.tables?.[tableName];
      if (!table) return new Set();

      const allColumns = new Set<string>();
      // Add explicitly defined columns
      for (const col of Object.keys(table.columns || {})) {
        allColumns.add(col);
      }
      // Add FK-generated columns
      // generatedColumns are now merged into columns, no need to check separately
      return allColumns;
    };

    // Validate auto_create on foreign keys
    for (const [childTableName, table] of Object.entries(schema.tables)) {
      if (!table.foreign_keys) continue;

      for (const [fkName, fk] of Object.entries(table.foreign_keys)) {
        if (!fk.auto_create) continue;

        const ac = fk.auto_create;
        const parentTableName = fk.table;
        const parentColumns = getAllColumns(parentTableName);
        const childColumns = getAllColumns(childTableName);

        // Validate spread columns (if present)
        if (ac.spread) {
          if (!parentColumns.has(ac.spread.start)) {
            errors.push(`Table '${childTableName}', foreign_key '${fkName}': auto_create.spread.start '${ac.spread.start}' does not exist in parent table '${parentTableName}'`);
          }
          if (!parentColumns.has(ac.spread.end)) {
            errors.push(`Table '${childTableName}', foreign_key '${fkName}': auto_create.spread.end '${ac.spread.end}' does not exist in parent table '${parentTableName}'`);
          }
          if (!parentColumns.has(ac.spread.interval)) {
            errors.push(`Table '${childTableName}', foreign_key '${fkName}': auto_create.spread.interval '${ac.spread.interval}' does not exist in parent table '${parentTableName}'`);
          }
          if (!childColumns.has(ac.spread.generated_column)) {
            errors.push(`Table '${childTableName}', foreign_key '${fkName}': auto_create.spread.generated_column '${ac.spread.generated_column}' does not exist in child table`);
          }
        }

        // Validate copy_columns - both parent and child must exist
        if (ac.copy_columns) {
          for (const [parentCol, childCol] of Object.entries(ac.copy_columns)) {
            if (!parentColumns.has(parentCol)) {
              errors.push(`Table '${childTableName}', foreign_key '${fkName}': auto_create.copy_columns parent column '${parentCol}' does not exist in parent table '${parentTableName}'`);
            }
            if (!childColumns.has(childCol)) {
              errors.push(`Table '${childTableName}', foreign_key '${fkName}': auto_create.copy_columns child column '${childCol}' does not exist in child table`);
            }
          }
        }

        // Validate literals - child columns must exist
        if (ac.literals) {
          for (const childCol of Object.keys(ac.literals)) {
            if (!childColumns.has(childCol)) {
              errors.push(`Table '${childTableName}', foreign_key '${fkName}': auto_create.literals child column '${childCol}' does not exist in child table`);
            }
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * DEPRECATED - Index and constraint validation is now integrated into processTableWithValidation
   * Validation happens during schema processing, not as a separate phase
   */
  private validateIndexesAndConstraintsDeprecated(schema: GenLogicSchema, processedSchema: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!schema.tables) {
      return { isValid: true, errors: [], warnings: [] };
    }

    for (const [tableName, table] of Object.entries(schema.tables)) {
      const processedTable = processedSchema.tables?.[tableName];
      if (!processedTable) continue;

      // Get all available columns (including FK-generated)
      const availableColumns = new Set(Object.keys(processedTable.columns || {}));

      // Validate unique_constraints
      if (table.unique_constraints) {
        for (let i = 0; i < table.unique_constraints.length; i++) {
          const columns = table.unique_constraints[i];

          if (columns.length === 0) {
            errors.push(`Table '${tableName}', unique_constraints[${i}]: constraint must have at least one column`);
            continue;
          }

          for (const colName of columns) {
            if (!availableColumns.has(colName)) {
              errors.push(`Table '${tableName}', unique_constraints[${i}]: column '${colName}' does not exist`);
            }
          }
        }
      }

      // Validate indexes
      if (table.indexes) {
        for (let i = 0; i < table.indexes.length; i++) {
          const columns = table.indexes[i];

          if (columns.length === 0) {
            errors.push(`Table '${tableName}', indexes[${i}]: index must have at least one column`);
            continue;
          }

          for (const colName of columns) {
            if (!availableColumns.has(colName)) {
              errors.push(`Table '${tableName}', indexes[${i}]: column '${colName}' does not exist`);
            }
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}