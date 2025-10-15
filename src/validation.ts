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
   * DEPRECATED - Cross-reference validation is now integrated into processSchemaByLayers
   * Keeping this private method for reference during transition period
   */
  private validateCrossReferencesDeprecated(schema: GenLogicSchema): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Get available column and table names
    const reusableColumns = new Set(Object.keys(schema.columns || {}));
    const tableNames = new Set([
      ...Object.keys(schema.tables || {}),
      ...Object.keys(schema.matching_tables || {})
    ]);

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
              const isSQLType = /[\(\)\s]|^(serial|bigserial|smallserial|varchar|char|numeric|decimal|integer|bigint|smallint|text|date|timestamp|timestamptz|boolean|real|uuid|bit|json|jsonb|double\s+precision)/i.test(column);

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
              const automationDef = (column as any).automation;
              if (automationDef) {
                // Parse string automation to get the table/column/type
                let automation;
                if (typeof automationDef === 'string') {
                  try {
                    automation = parseAutomationString(automationDef);
                  } catch (err: any) {
                    errors.push(`Table '${tableName}', column '${columnName}': ${err.message}`);
                    continue;
                  }
                } else {
                  automation = automationDef;
                }

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

                  // Validate foreign_key reference if explicitly provided
                  // For aggregations (SUM/COUNT/MAX/MIN/LAST_VALUE): FK is in source table (child)
                  // For cascades/follows (SNAPSHOT/SYNC): FK is in current table (child)
                  const isAggregation = ['SUM', 'COUNT', 'MAX', 'MIN', 'LAST_VALUE'].includes(automation.type);
                  const isCascade = ['SNAPSHOT', 'SYNC'].includes(automation.type);

                  if (automation.foreign_key) {
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
                  // Note: If FK not provided, it will be inferred later by resolveAutomation in trigger-generator
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
   * DEPRECATED - Generated column validation is now integrated into processTableWithValidation
   * Validation happens during schema processing, not as a separate phase
   */
  private validateGeneratedColumnReferencesDeprecated(processedSchema: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!processedSchema.tables) {
      return { isValid: true, errors: [], warnings: [] };
    }

    for (const [tableName, table] of Object.entries(processedSchema.tables)) {
      const tableObj = table as any;

      // All columns are now in a single location (FK columns have been merged)
      const allColumns = new Set<string>(Object.keys(tableObj.columns || {}));

      // Check all columns for generated expressions
      for (const [columnName, columnDef] of Object.entries(tableObj.columns || {})) {
        const colDef = columnDef as any;

        if (colDef.generated) {
          const generatedExpr = colDef.generated;

          // Extract @column_name references
          const atMatches = generatedExpr.match(/@(\w+)/g) || [];
          const referencedCols = atMatches.map((m: string) => m.substring(1)); // Remove "@"

          // Require at least one @ reference
          if (atMatches.length === 0) {
            errors.push(
              `Table '${tableName}', column '${columnName}': ` +
              `generated expression must reference at least one column using '@column_name' syntax`
            );
            continue; // Skip further validation for this expression
          }

          // Validate each referenced column exists
          for (const refCol of referencedCols) {
            if (!allColumns.has(refCol)) {
              errors.push(
                `Table '${tableName}', column '${columnName}': ` +
                `generated expression references non-existent column '@${refCol}'`
              );
            }
          }

          // Check for bare identifiers that match column names (user forgot @ sigil)
          // Use negative lookbehind to exclude identifiers preceded by @
          const allIdentifiers = generatedExpr.match(/(?<!@)\b([a-z_][a-z0-9_]*)\b/gi) || [];

          // SQL keywords that are OK to appear bare
          const sqlKeywords = new Set([
            'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AND', 'OR', 'NOT', 'NULL',
            'TRUE', 'FALSE', 'IS', 'IN', 'LIKE', 'BETWEEN', 'EXISTS',
            'COALESCE', 'NULLIF', 'CAST', 'EXTRACT', 'SUBSTRING', 'TRIM',
            'UPPER', 'LOWER', 'LENGTH', 'CONCAT', 'REPLACE',
            'SUM', 'COUNT', 'AVG', 'MAX', 'MIN', 'ABS', 'ROUND', 'CEIL', 'FLOOR',
            'GREATEST', 'LEAST', 'DATE', 'TIME', 'TIMESTAMP', 'INTERVAL'
          ]);

          // Find bare identifiers that are actually column names
          const bareColumnRefs: string[] = [];
          for (const id of allIdentifiers) {
            if (sqlKeywords.has(id.toUpperCase())) {
              continue; // Skip SQL keywords
            }
            if (allColumns.has(id)) {
              bareColumnRefs.push(id);
            }
          }

          if (bareColumnRefs.length > 0) {
            errors.push(
              `Table '${tableName}', column '${columnName}': ` +
              `generated expression contains bare column reference(s) without '@' sigil: ${bareColumnRefs.join(', ')}. ` +
              `Use '@column_name' syntax for all column references.`
            );
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