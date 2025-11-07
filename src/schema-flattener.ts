// Schema Flattener - Transforms hierarchical YAML into flat lists
//
// Converts GenLogicSchema (nested tables/columns/FKs) into YamlFlattenedLists (flat arrays)
// Parses SQL definition strings and validates FK syntax during flattening

import type { GenLogicSchema, TableDefinition } from './types.js';
import type {
  YamlFlattenedLists,
  FlattenedTable,
  FlattenedForeignKey,
  FlattenedAutomation,
  FlattenedIndex,
  FlattenedUniqueConstraint,
  FlattenedCheckConstraint,
  FlattenedSeedRow
} from './yaml-flattened-lists.js';
import { parseSQLType } from './sql-type-parser.js';

export class SchemaFlattener {

  /**
   * Flatten a GenLogicSchema into YamlFlattenedLists
   */
  flatten(schema: GenLogicSchema): YamlFlattenedLists {
    const yamlFlattenedLists: YamlFlattenedLists = {
      reusableColumns: [],
      tables: [],
      columns: [],
      foreignKeys: [],
      automations: [],
      indexes: [],
      uniqueConstraints: [],
      checkConstraints: [],
      seedRows: []
    };

    // Build set of reusable column names for $ref detection
    const reusableColumnNames = new Set<string>();
    if (schema.columns) {
      for (const name of Object.keys(schema.columns)) {
        reusableColumnNames.add(name);
      }
    }

    // Extract reusable columns - flatten and parse SQL definitions
    if (schema.columns) {
      for (const [name, colDef] of Object.entries(schema.columns)) {
        if (typeof colDef === 'string') {
          // Simple string definition - parse it
          try {
            const parsed = parseSQLType(colDef);
            yamlFlattenedLists.reusableColumns.push({ name, ...parsed });
          } catch (error) {
            throw new Error(
              `Invalid SQL definition for reusable column '${name}': "${colDef}"\n` +
              `Error: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        } else if (colDef && typeof colDef === 'object') {
          // Object with properties
          const result: any = { name };

          // If it has a 'definition' property, parse it
          if ('definition' in colDef && typeof colDef.definition === 'string') {
            try {
              const parsed = parseSQLType(colDef.definition);
              Object.assign(result, parsed);
            } catch (error) {
              throw new Error(
                `Invalid SQL definition for reusable column '${name}': "${colDef.definition}"\n` +
                `Error: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }

          // Spread other properties (automation, formula, format, label, comment, etc.)
          for (const [key, value] of Object.entries(colDef)) {
            if (key !== 'definition') {
              result[key] = value;
            }
          }

          yamlFlattenedLists.reusableColumns.push(result);
        }
      }
    }

    if (!schema.tables) {
      return yamlFlattenedLists;
    }

    // Iterate through all tables once, extracting everything
    for (const [tableName, table] of Object.entries(schema.tables)) {
      // Extract table metadata
      yamlFlattenedLists.tables.push(this.extractTable(tableName, table));

      // Extract columns and automations - parse SQL definitions
      if (table.columns) {
        for (const [columnName, colDef] of Object.entries(table.columns)) {
          if (colDef === null || colDef === undefined) {
            // Shorthand: "columnName:" means "$ref: columnName" (inherit from reusable column)
            yamlFlattenedLists.columns.push({
              tableName,
              columnName,
              $ref: columnName
            });
          } else if (typeof colDef === 'string') {
            // Check if this is a foreign key definition (starts with "FK ")
            if (/^FK\s+/i.test(colDef)) {
              // Foreign key: extract parent table name and store unparsed definition
              const fkMatch = colDef.match(/^FK\s+(\w+)/i);
              if (fkMatch) {
                const parentTable = fkMatch[1];

                // Add column with FK definition
                yamlFlattenedLists.columns.push({
                  tableName,
                  columnName,
                  definition: colDef
                });

                // Add FK entry for downstream cycle detection
                yamlFlattenedLists.foreignKeys.push({
                  childTable: tableName,
                  fkName: columnName,
                  parentTable,
                  childColumn: columnName,
                  definition: colDef
                });
              } else {
                throw new Error(
                  `Invalid FK definition for column '${tableName}.${columnName}': "${colDef}"\n` +
                  `Expected format: "FK parent_table [modifiers]"`
                );
              }
            }
            // Check if this string is a reusable column name (shorthand for $ref)
            else if (reusableColumnNames.has(colDef)) {
              // "amount: amount" means "$ref: amount"
              yamlFlattenedLists.columns.push({
                tableName,
                columnName,
                $ref: colDef
              });
            } else {
              // Otherwise, it's a SQL type definition - parse it
              try {
                const parsed = parseSQLType(colDef);
                yamlFlattenedLists.columns.push({
                  tableName,
                  columnName,
                  ...parsed
                });
              } catch (error) {
                throw new Error(
                  `Invalid SQL definition for column '${tableName}.${columnName}': "${colDef}"\n` +
                  `Error: ${error instanceof Error ? error.message : String(error)}`
                );
              }
            }
          } else if (colDef && typeof colDef === 'object' && !Array.isArray(colDef)) {
            // Object with properties
            const result: any = { tableName, columnName };

            // If it has a 'definition' property, check if it's FK or SQL type
            if ('definition' in colDef && typeof colDef.definition === 'string') {
              // Check if this is a foreign key definition
              if (/^FK\s+/i.test(colDef.definition)) {
                const fkMatch = colDef.definition.match(/^FK\s+(\w+)/i);
                if (fkMatch) {
                  const parentTable = fkMatch[1];

                  // Store FK definition as-is
                  result.definition = colDef.definition;

                  // Add FK entry for downstream cycle detection
                  yamlFlattenedLists.foreignKeys.push({
                    childTable: tableName,
                    fkName: columnName,
                    parentTable,
                    childColumn: columnName,
                    definition: colDef.definition
                  });
                } else {
                  throw new Error(
                    `Invalid FK definition for column '${tableName}.${columnName}': "${colDef.definition}"\n` +
                    `Expected format: "FK parent_table [modifiers]"`
                  );
                }
              } else {
                // Regular SQL type definition - parse it
                try {
                  const parsed = parseSQLType(colDef.definition);
                  Object.assign(result, parsed);
                } catch (error) {
                  throw new Error(
                    `Invalid SQL definition for column '${tableName}.${columnName}': "${colDef.definition}"\n` +
                    `Error: ${error instanceof Error ? error.message : String(error)}`
                  );
                }
              }
            }

            // Spread other properties (automation, formula, format, label, comment, $ref, etc.)
            for (const [key, value] of Object.entries(colDef)) {
              if (key !== 'definition') {
                result[key] = value;
              }
            }

            yamlFlattenedLists.columns.push(result);

            // Extract automation if present
            if ('automation' in colDef && colDef.automation) {
              yamlFlattenedLists.automations.push({
                tableName,
                columnName,
                automation: colDef.automation
              });
            }
          }
        }
      }

      // Extract indexes
      if (table.indexes) {
        for (const indexColumns of table.indexes) {
          yamlFlattenedLists.indexes.push({
            tableName,
            columns: indexColumns
          });
        }
      }

      // Extract unique constraints
      if (table["unique-constraints"]) {
        for (const constraintColumns of table["unique-constraints"]) {
          yamlFlattenedLists.uniqueConstraints.push({
            tableName,
            columns: constraintColumns
          });
        }
      }

      // Extract CHECK constraints
      if (table.constraints) {
        for (const expression of table.constraints) {
          yamlFlattenedLists.checkConstraints.push({
            tableName,
            expression
          });
        }
      }

      // Extract seed rows
      if (table['seed-rows']) {
        for (const row of table['seed-rows']) {
          yamlFlattenedLists.seedRows.push({
            tableName,
            data: row
          });
        }
      }
    }

    return yamlFlattenedLists;
  }

  /**
   * Extract table metadata
   */
  private extractTable(tableName: string, table: TableDefinition): FlattenedTable {
    return {
      name: tableName,
      comment: table.comment,
      singleton: table.singleton,
      primaryKey: table.primary_key
    };
  }

  /**
   * Extract foreign keys using new syntax
   *
   * Handles three patterns:
   * 1. null/undefined → inferred column name
   * 2. string → "column_name [modifiers]"
   * 3. array → ["column1 [modifiers]", "column2", ...]
   */
  private extractForeignKeys(
    childTable: string,
    fkName: string,
    fkDef: any
  ): FlattenedForeignKey[] {
    // Pattern 1: null or undefined → inferred
    if (fkDef === null || fkDef === undefined) {
      return [{
        childTable,
        fkName,
        parentTable: fkName,  // FK name IS the parent table name in simple case
        childColumn: null,  // Will be inferred later
        notNull: false,
        delete: 'restrict',
        autoCreateParent: false
      }];
    }

    // Pattern 3: Array of FK definitions
    if (Array.isArray(fkDef)) {
      return fkDef.map(defString => this.parseFKDefinition(childTable, fkName, defString));
    }

    // Pattern 2: Single string definition
    if (typeof fkDef === 'string') {
      return [this.parseFKDefinition(childTable, fkName, fkDef)];
    }

    throw new Error(`Invalid FK definition for ${childTable}.${fkName}: ${JSON.stringify(fkDef)}`);
  }

  /**
   * Parse a single FK definition string: "[column_name] [not null] [delete cascade] [auto create parent]"
   *
   * Valid forms:
   * - "" (empty after removing modifiers) → inferred column name
   * - "column_name" (single word) → explicit column name
   * - Multiple unrecognized words → ERROR
   */
  private parseFKDefinition(
    childTable: string,
    fkName: string,
    defString: string
  ): FlattenedForeignKey {
    let remaining = defString.trim();

    // Parse modifiers by removing them from the string
    let notNull = false;
    let deleteAction: 'restrict' | 'cascade' = 'restrict';
    let autoCreateParent = false;

    // Remove "not null" (case insensitive)
    if (/\bnot\s+null\b/i.test(remaining)) {
      notNull = true;
      remaining = remaining.replace(/\bnot\s+null\b/gi, '').trim();
    }

    // Remove "delete cascade"
    if (/\bdelete\s+cascade\b/i.test(remaining)) {
      deleteAction = 'cascade';
      remaining = remaining.replace(/\bdelete\s+cascade\b/gi, '').trim();
    }

    // Remove "auto create parent"
    if (/\bauto\s+create\s+parent\b/i.test(remaining)) {
      autoCreateParent = true;
      remaining = remaining.replace(/\bauto\s+create\s+parent\b/gi, '').trim();
    }

    // After removing all modifiers, what's left should be:
    // A) empty → inferred column name
    // B) single word → explicit column name
    // C) multiple words → ERROR

    let childColumn: string | null;

    if (remaining === '') {
      // Case A: No column name, will be inferred
      childColumn = null;
    } else if (!/\s/.test(remaining)) {
      // Case B: Single word with no spaces
      childColumn = remaining;
    } else {
      // Case C: Multiple words remain - invalid
      throw new Error(
        `Invalid FK definition in ${childTable} → ${fkName}: "${defString}"\n` +
        `After removing modifiers, unrecognized content remains: "${remaining}"\n` +
        `Expected: [column_name] [not null] [delete cascade] [auto create parent]`
      );
    }

    return {
      childTable,
      fkName,
      parentTable: fkName,  // FK name IS the parent table name by convention
      childColumn,
      notNull,
      delete: deleteAction,
      autoCreateParent
    };
  }
}
