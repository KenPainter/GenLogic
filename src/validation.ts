import Ajv from 'ajv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { GenLogicSchema, ValidationResult } from './types';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the JSON Schema we created
const schemaPath = join(__dirname, '..', 'genlogic-schema.json');
const jsonSchema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

export class SchemaValidator {
  private ajv: Ajv;
  private validateSchema: any;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false // Allow unknown keywords in our schema
    });
    this.validateSchema = this.ajv.compile(jsonSchema);
  }

  /**
   * PHASE 1: Syntax validation using JSON Schema
   * This validates structure, types, and basic rules
   */
  validateSyntax(schema: any): ValidationResult {
    const isValid = this.validateSchema(schema);
    const errors: string[] = [];

    if (!isValid && this.validateSchema.errors) {
      for (const error of this.validateSchema.errors) {
        const path = error.instancePath || 'root';
        errors.push(`${path}: ${error.message}`);
      }
    }

    return {
      isValid,
      errors,
      warnings: []
    };
  }

  /**
   * Complete validation: both syntax and cross-references
   */
  validate(schema: any): ValidationResult {
    // First do syntax validation
    const syntaxResult = this.validateSyntax(schema);
    if (!syntaxResult.isValid) {
      return syntaxResult;
    }

    // Then do cross-reference validation
    return this.validateCrossReferences(schema);
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

            // Check string references (inherit named column)
            if (typeof column === 'string') {
              if (!reusableColumns.has(column)) {
                errors.push(`Table '${tableName}', column '${columnName}': reference '${column}' does not exist in reusable columns`);
              }
            }

            // Check mutual exclusion: automation and calculated cannot coexist
            if (column && typeof column === 'object' && 'automation' in column && 'calculated' in column) {
              errors.push(`Table '${tableName}', column '${columnName}': cannot have both 'automation' and 'calculated' properties`);
            }

            // Check automation references
            if (column && typeof column === 'object' && 'automation' in column) {
              const automation = (column as any).automation;
              if (automation) {
                // Validate table reference
                if (!tableNames.has(automation.table)) {
                  errors.push(`Table '${tableName}', column '${columnName}': automation table '${automation.table}' does not exist`);
                }

                // Validate foreign_key reference
                // For aggregations (SUM/COUNT/MAX/MIN/LATEST): FK is in source table (child)
                // For cascades (SNAPSHOT/FOLLOW): FK is in current table (child)
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

        // Validate foreign key table references
        if (table.foreign_keys) {
          for (const [fkName, fk] of Object.entries(table.foreign_keys)) {
            if (!tableNames.has(fk.table)) {
              errors.push(`Table '${tableName}', foreign_key '${fkName}': target table '${fk.table}' does not exist`);
            }
          }
        }

        // Validate sync target table references (but NOT column names yet - they may be FK-derived)
        if (table.sync) {
          for (const targetTableName of Object.keys(table.sync)) {
            if (!tableNames.has(targetTableName)) {
              errors.push(`Table '${tableName}', sync target '${targetTableName}': target table does not exist`);
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
   * PHASE 2.5: Validate sync and spread definitions against processed schema
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

    for (const [sourceTableName, table] of Object.entries(schema.tables)) {
      if (!table.sync) continue;

      const sourceColumns = getAllColumns(sourceTableName);

      for (const [targetTableName, syncDef] of Object.entries(table.sync)) {
        const targetColumns = getAllColumns(targetTableName);

        // Validate match_columns - both source and target must exist
        if (syncDef.match_columns) {
          for (const [sourceCol, targetCol] of Object.entries(syncDef.match_columns)) {
            if (!sourceColumns.has(sourceCol)) {
              errors.push(`Table '${sourceTableName}', sync to '${targetTableName}': match_columns source column '${sourceCol}' does not exist (after FK expansion)`);
            }
            if (!targetColumns.has(targetCol)) {
              errors.push(`Table '${sourceTableName}', sync to '${targetTableName}': match_columns target column '${targetCol}' does not exist in target table`);
            }
          }
        }

        // Validate column_map - both source and target must exist
        if (syncDef.column_map) {
          for (const [sourceCol, targetCol] of Object.entries(syncDef.column_map)) {
            if (!sourceColumns.has(sourceCol)) {
              errors.push(`Table '${sourceTableName}', sync to '${targetTableName}': column_map source column '${sourceCol}' does not exist (after FK expansion)`);
            }
            if (!targetColumns.has(targetCol)) {
              errors.push(`Table '${sourceTableName}', sync to '${targetTableName}': column_map target column '${targetCol}' does not exist in target table`);
            }
          }
        }

        // Validate literals - target columns must exist
        if (syncDef.literals) {
          for (const targetCol of Object.keys(syncDef.literals)) {
            if (!targetColumns.has(targetCol)) {
              errors.push(`Table '${sourceTableName}', sync to '${targetTableName}': literals target column '${targetCol}' does not exist in target table`);
            }
          }
        }
      }
    }

    // Validate spread definitions
    for (const [sourceTableName, table] of Object.entries(schema.tables)) {
      if (!table.spread) continue;

      const sourceColumns = getAllColumns(sourceTableName);

      for (const [targetTableName, spreadDef] of Object.entries(table.spread)) {
        const targetColumns = getAllColumns(targetTableName);

        // Validate generate columns exist in source
        if (!sourceColumns.has(spreadDef.generate.start_date)) {
          errors.push(`Table '${sourceTableName}', spread to '${targetTableName}': generate.start_date '${spreadDef.generate.start_date}' does not exist in source table`);
        }
        if (!sourceColumns.has(spreadDef.generate.end_date)) {
          errors.push(`Table '${sourceTableName}', spread to '${targetTableName}': generate.end_date '${spreadDef.generate.end_date}' does not exist in source table`);
        }
        if (!sourceColumns.has(spreadDef.generate.interval)) {
          errors.push(`Table '${sourceTableName}', spread to '${targetTableName}': generate.interval '${spreadDef.generate.interval}' does not exist in source table`);
        }

        // Validate tracking_column exists in target
        if (!targetColumns.has(spreadDef.tracking_column)) {
          errors.push(`Table '${sourceTableName}', spread to '${targetTableName}': tracking_column '${spreadDef.tracking_column}' does not exist in target table`);
        }

        // Validate column_map
        if (spreadDef.column_map) {
          for (const [sourceCol, targetCol] of Object.entries(spreadDef.column_map)) {
            if (!sourceColumns.has(sourceCol)) {
              errors.push(`Table '${sourceTableName}', spread to '${targetTableName}': column_map source column '${sourceCol}' does not exist in source table`);
            }
            if (!targetColumns.has(targetCol)) {
              errors.push(`Table '${sourceTableName}', spread to '${targetTableName}': column_map target column '${targetCol}' does not exist in target table`);
            }
          }
        }

        // Validate literals
        if (spreadDef.literals) {
          for (const targetCol of Object.keys(spreadDef.literals)) {
            if (!targetColumns.has(targetCol)) {
              errors.push(`Table '${sourceTableName}', spread to '${targetTableName}': literals target column '${targetCol}' does not exist in target table`);
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