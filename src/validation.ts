import Ajv from 'ajv';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { GenLogicSchema, ValidationResult } from './types';

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

            // Check automation references
            if (column && typeof column === 'object' && 'automation' in column) {
              const automation = (column as any).automation;
              if (automation) {
                // Validate table reference
                if (!tableNames.has(automation.table)) {
                  errors.push(`Table '${tableName}', column '${columnName}': automation table '${automation.table}' does not exist`);
                }

                // Validate foreign_key reference exists in the specified table
                const sourceTable = schema.tables?.[automation.table];
                if (sourceTable?.foreign_keys && !sourceTable.foreign_keys[automation.foreign_key]) {
                  errors.push(`Table '${tableName}', column '${columnName}': automation foreign_key '${automation.foreign_key}' does not exist in table '${automation.table}'`);
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
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}