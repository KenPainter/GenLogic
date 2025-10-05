import Ajv from 'ajv';
import type { GenLogicSchema, ValidationResult } from './types';
import { DataFlowGraphValidator } from './graph.js';
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
   * Complete validation: syntax, cross-references, and data flow
   */
  validate(schema: any): ValidationResult {
    // First do basic syntax validation (without graph validation)
    const isValid = this.validateSchema(schema);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!isValid && this.validateSchema.errors) {
      for (const error of this.validateSchema.errors) {
        const path = error.instancePath || 'root';
        errors.push(`${path}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      return { isValid: false, errors, warnings };
    }

    // Then do cross-reference validation (check that referenced tables/columns exist)
    const crossRefResult = this.validateCrossReferences(schema);
    if (!crossRefResult.isValid) {
      return crossRefResult;
    }

    // Finally do graph/cycle validation (requires valid cross-references)
    const graphResult = this.graphValidator.validateDataFlowSafety(schema);
    errors.push(...graphResult.errors);
    warnings.push(...graphResult.warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * PHASE 2: Cross-reference validation
   * VALIDATION REQUIRED: These checks are embedded in our schema descriptions
   */
  validateCrossReferences(schema: GenLogicSchema): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Get available column and table names
    const reusableColumns = new Set(Object.keys(schema.columns || {}));
    const tableNames = new Set(Object.keys(schema.tables || {}));

    // Validate reusable column references (columns that inherit from other columns)
    if (schema.columns) {
      for (const [columnName, column] of Object.entries(schema.columns)) {
        // Check if reusable column uses $ref to inherit from another reusable column
        if (column && typeof column === 'object' && '$ref' in column) {
          const refName = (column as any).$ref;
          if (!reusableColumns.has(refName)) {
            errors.push(`Reusable column '${columnName}': $ref '${refName}' does not exist in reusable columns`);
          }
        }
      }
    }

    // Validate column references
    if (schema.tables) {
      for (const [tableName, table] of Object.entries(schema.tables)) {
        if (table.columns) {
          for (const [columnName, column] of Object.entries(table.columns)) {
            // Check null inheritance (must match column name)
            if (column === null) {
              if (!reusableColumns.has(columnName)) {
                errors.push(`Table '${tableName}', column '${columnName}': references missing reusable column '${columnName}'`);
              }
            }

            // Check ColumnReference type (object with $ref)
            if (column && typeof column === 'object' && '$ref' in column) {
              const refName = (column as any).$ref;
              if (!reusableColumns.has(refName)) {
                errors.push(`Table '${tableName}', column '${columnName}': $ref '${refName}' does not exist in reusable columns`);
              }
            }

            // Check string references (inherit named column) vs SQL type strings
            if (typeof column === 'string') {
              // Detect if it's a SQL type string by checking for common patterns
              // SQL type strings contain: parentheses, spaces, or SQL keywords
              const isSQLType = /[\(\)\s]|^(serial|bigserial|smallserial|varchar|numeric|integer|bigint|smallint|text|date|timestamp|boolean)/i.test(column);

              if (!isSQLType && !reusableColumns.has(column)) {
                errors.push(`Table '${tableName}', column '${columnName}': reference '${column}' does not exist in reusable columns`);
              }
            }

            // Check mutual exclusion: automation and generated cannot coexist
            if (column && typeof column === 'object' && 'automation' in column && 'generated' in column) {
              errors.push(`Table '${tableName}', column '${columnName}': cannot have both 'automation' and 'generated' properties`);
            }

            // Check automation references
            if (column && typeof column === 'object' && 'automation' in column) {
              const automation = (column as any).automation;
              if (automation) {
                // Handle RULE_MATCH automation differently
                if (automation.type === 'RULE_MATCH') {
                  // Validate source_table reference
                  if (!tableNames.has(automation.source_table)) {
                    errors.push(`Table '${tableName}', column '${columnName}': RULE_MATCH source_table '${automation.source_table}' does not exist`);
                  }

                  // Validate destination_columns exist in current table
                  if (automation.destination_columns && Array.isArray(automation.destination_columns)) {
                    const tableColumns = new Set(Object.keys(table.columns || {}));
                    for (const destCol of automation.destination_columns) {
                      if (!tableColumns.has(destCol)) {
                        errors.push(`Table '${tableName}', column '${columnName}': RULE_MATCH destination_column '${destCol}' does not exist in table`);
                      }
                    }
                  }

                  // Validate source_columns exist in source table
                  const sourceTable = schema.tables?.[automation.source_table];
                  if (sourceTable && automation.source_columns) {
                    const sourceTableColumns = new Set(Object.keys(sourceTable.columns || {}));
                    for (const [key, sourceCol] of Object.entries(automation.source_columns)) {
                      if (!sourceTableColumns.has(sourceCol as string)) {
                        errors.push(`Table '${tableName}', column '${columnName}': RULE_MATCH source_columns.${key} '${sourceCol}' does not exist in source table '${automation.source_table}'`);
                      }
                    }
                  }
                } else {
                  // Standard automation validation
                  // Validate table reference
                  if (!tableNames.has(automation.table)) {
                    errors.push(`Table '${tableName}', column '${columnName}': automation table '${automation.table}' does not exist`);
                  }

                  // Validate foreign_key reference
                  // For aggregations (SUM/COUNT/MAX/MIN/LATEST): FK is in source table (child)
                  // For cascades/follows (SNAPSHOT/FOLLOW): FK is in current table (child)
                  const isAggregation = ['SUM', 'COUNT', 'MAX', 'MIN', 'LATEST'].includes(automation.type);
                  const isCascade = ['SNAPSHOT', 'FOLLOW'].includes(automation.type);

                  if (isAggregation) {
                    // FK must exist in source table (child)
                    const sourceTable = schema.tables?.[automation.table];
                    if (sourceTable?.foreign_keys && !sourceTable.foreign_keys[automation.foreign_key]) {
                      errors.push(`Table '${tableName}', column '${columnName}': automation foreign_key '${automation.foreign_key}' does not exist in table '${automation.table}'`);
                    }
                  } else if (isCascade) {
                    // FK must exist in current table (child)
                    if (table.foreign_keys && !table.foreign_keys[automation.foreign_key]) {
                      errors.push(`Table '${tableName}', column '${columnName}': automation foreign_key '${automation.foreign_key}' does not exist in current table`);
                    }
                  }
                }
              }
            }
          }
        }

        // Validate foreign key table references and auto_create basic structure
        if (table.foreign_keys) {
          for (const [fkName, fkDef] of Object.entries(table.foreign_keys)) {
            // Normalize: FK can be string (table name) or object
            const fk = typeof fkDef === 'string' ? { table: fkDef } : fkDef;

            if (!tableNames.has(fk.table)) {
              errors.push(`Table '${tableName}', foreign_key '${fkName}': target table '${fk.table}' does not exist`);
            }

            // Basic auto_create validation (detailed column validation happens after processing)
            if (fk.auto_create) {
              const ac = fk.auto_create;

              // Validate 'on' array is not empty
              if (!ac.on || ac.on.length === 0) {
                errors.push(`Table '${tableName}', foreign_key '${fkName}': auto_create.on must not be empty`);
              }
            }
          }
        }

      }
    }

    // Validate matching_tables
    if (schema.matching_tables) {
      for (const [tableName, definition] of Object.entries(schema.matching_tables)) {
        // Validate result_column_name is a valid identifier
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(definition.result_column_name)) {
          errors.push(`Matching table '${tableName}': result_column_name '${definition.result_column_name}' is not a valid identifier`);
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
   * PHASE 2.5: Validate auto_create definitions against processed schema
   * This must run AFTER schema processing, when FK columns are expanded
   */
  validateSyncDefinitions(schema: GenLogicSchema, processedSchema: any): ValidationResult {
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
      for (const col of Object.keys(table.generatedColumns || {})) {
        allColumns.add(col);
      }
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
}