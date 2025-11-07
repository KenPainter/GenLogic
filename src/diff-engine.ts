import type {
  DatabaseTable,
  ColumnDefinition,
  GenLogicSchema
} from './types.js';
import type { ProcessedSchema, ProcessedTable } from './schema-processor.js';
import { parseAutomationString } from './automation-parser.js';

/**
 * Schema Diff Engine
 *
 * GENLOGIC PRINCIPLE: Only add, never delete
 * Compare desired schema against current database and generate safe incremental changes
 */
export class DiffEngine {

  /**
   * Generate complete diff between desired and current schema
   */
  generateDiff(
    desiredSchema: ProcessedSchema,
    currentSchema: Record<string, DatabaseTable>,
    originalSchema?: GenLogicSchema
  ): SchemaDiff {
    const diff: SchemaDiff = {
      tablesToCreate: [],
      columnsToAdd: [],
      columnsToModify: [],
      primaryKeysToAdd: [],
      indexesToCreate: [],
      foreignKeysToAdd: [],
      checkConstraintsToAdd: [],
      aggregationsToBackfill: [],
      triggersToRecreate: []
    };

    // Process each desired table
    for (const [tableName, desiredTable] of Object.entries(desiredSchema.tables)) {
      const currentTable = currentSchema[tableName];

      if (!currentTable) {
        // Table doesn't exist - create it with all columns
        const tableCreation: TableCreation = {
          tableName,
          comment: desiredTable.comment,
          singleton: desiredTable.singleton,
          columns: this.getAllTableColumns(desiredTable),
          foreignKeys: desiredTable.foreignKeys,
          constraints: desiredTable.constraints
        };

        // Add composite primary key if specified
        if (desiredTable.primaryKey && desiredTable.primaryKey.length > 0) {
          tableCreation.primaryKey = desiredTable.primaryKey;
        }

        diff.tablesToCreate.push(tableCreation);

        // Create indexes for foreign key columns
        for (const [fkName] of Object.entries(desiredTable.foreignKeys)) {
          // Get the FK column names from the mapping
          const columnNames = desiredTable.fkColumnMapping[fkName] || [fkName];

          diff.indexesToCreate.push({
            tableName,
            indexName: `idx_${tableName}_${columnNames.join('_')}`,
            columns: columnNames,
            isUnique: false
          });
        }

        // Create unique constraints from processedSchema
        if (desiredTable.uniqueConstraints) {
          for (const columns of desiredTable.uniqueConstraints) {
            diff.indexesToCreate.push({
              tableName,
              indexName: `unique_${tableName}_${columns.join('_')}`,
              columns,
              isUnique: true
            });
          }
        }

        // Create indexes from processedSchema
        if (desiredTable.indexes) {
          for (const columns of desiredTable.indexes) {
            diff.indexesToCreate.push({
              tableName,
              indexName: `idx_${tableName}_${columns.join('_')}`,
              columns,
              isUnique: false
            });
          }
        }
      } else {
        // Table exists - check for new columns
        const newColumns = this.findNewColumns(desiredTable, currentTable);
        for (const column of newColumns) {
          diff.columnsToAdd.push({
            tableName,
            columnName: column.name,
            definition: column.definition
          });

          // Check if this new column is an aggregation that needs backfilling
          if (column.definition.automation && typeof column.definition.automation === 'string') {
            try {
              const parsed = parseAutomationString(column.definition.automation);

              // Only backfill SUM, COUNT, MAX, MIN (not LAST_VALUE - we don't know which row is "last")
              if (['SUM', 'COUNT', 'MAX', 'MIN'].includes(parsed.type)) {
                // Get the FK column name - need to look it up from fkColumnMapping
                // The FK column lives in the CHILD table, not the parent
                let fkColumnName: string | undefined;

                if (parsed.foreign_key) {
                  // FK explicitly specified in automation (e.g., COUNT(account_id_debit))
                  // Look up the FK column name in the CHILD table's fkColumnMapping
                  const childTable = desiredSchema.tables[parsed.table];
                  if (childTable) {
                    fkColumnName = childTable.fkColumnMapping[parsed.foreign_key]?.[0];
                  }
                } else {
                  // FK not specified - need to find it by searching for FK that points to child table
                  // Look through all FKs in the child table to find one that points to parent
                  const childTable = desiredSchema.tables[parsed.table];
                  if (childTable) {
                    for (const [fkName, fkDef] of Object.entries(childTable.foreignKeys)) {
                      if (fkDef.table === tableName) {
                        // Found FK from child to parent
                        fkColumnName = childTable.fkColumnMapping[fkName]?.[0];
                        break;
                      }
                    }
                  }
                }

                if (fkColumnName) {
                  diff.aggregationsToBackfill.push({
                    parentTable: tableName,
                    aggregationColumn: column.name,
                    aggregationType: parsed.type as 'SUM' | 'COUNT' | 'MAX' | 'MIN',
                    childTable: parsed.table,
                    childColumn: parsed.column,
                    foreignKey: fkColumnName,
                    whereClause: parsed.whereClause
                  });
                }
              }
            } catch (error) {
              // If automation parsing fails, skip backfill detection
              // The error will be caught during trigger generation
            }
          }
        }

        // Check for missing composite primary key
        // Compare by STRUCTURE (column list), not just presence
        if (desiredTable.primaryKey && desiredTable.primaryKey.length > 0) {
          // Get current primary key columns
          const currentPKColumns = currentTable.columns
            .filter(col => col.isPrimaryKey)
            .map(col => col.name)
            .sort();

          // Compare desired vs current PK columns
          const desiredPKColumns = [...desiredTable.primaryKey].sort();

          const pkMatches = currentPKColumns.length === desiredPKColumns.length &&
            currentPKColumns.every((col, idx) => col === desiredPKColumns[idx]);

          if (!pkMatches) {
            if (currentPKColumns.length > 0) {
              // Table has a different PK - this is an error
              throw new Error(
                `Cannot change primary key for table '${tableName}': ` +
                `database has PK on [${currentPKColumns.join(', ')}], ` +
                `schema specifies PK on [${desiredTable.primaryKey.join(', ')}]. ` +
                `Primary key changes are not supported. Use manual ALTER TABLE if needed.`
              );
            } else {
              // Table has no PK - add it
              diff.primaryKeysToAdd.push({
                tableName,
                columns: desiredTable.primaryKey
              });
            }
          }
        }

        // Check for modified columns (safe expansions only)
        const modifiedColumns = this.findModifiedColumns(desiredTable, currentTable);
        for (const column of modifiedColumns) {
          diff.columnsToModify.push(column);
        }

        // Check for new foreign keys
        const newForeignKeys = this.findNewForeignKeys(desiredTable, currentTable);
        for (const fk of newForeignKeys) {
          diff.foreignKeysToAdd.push({
            tableName,
            foreignKeyName: fk.name,
            fkName: fk.fkName,
            definition: fk.definition,
            columnNames: fk.columnNames
          });

          // Create index for the new FK column(s) if it doesn't already exist
          // Compare by STRUCTURE (column list), not by generated name
          const indexExists = currentTable.indexes.some(idx =>
            this.columnsMatch(idx.columns, fk.columnNames)
          );

          if (!indexExists) {
            const indexName = `idx_${tableName}_${fk.columnNames.join('_')}`;
            diff.indexesToCreate.push({
              tableName,
              indexName,
              columns: fk.columnNames,
              isUnique: false
            });
          }
        }

        // Check for new unique constraints from processedSchema
        // Compare by STRUCTURE (column list + uniqueness), not by generated name
        if (desiredTable.uniqueConstraints) {
          for (const columns of desiredTable.uniqueConstraints) {
            const indexExists = currentTable.indexes.some(idx =>
              idx.isUnique && this.columnsMatch(idx.columns, columns)
            );

            if (!indexExists) {
              const indexName = `unique_${tableName}_${columns.join('_')}`;
              diff.indexesToCreate.push({
                tableName,
                indexName,
                columns,
                isUnique: true
              });
            }
          }
        }

        // Check for new indexes from processedSchema
        // Compare by STRUCTURE (column list, must be non-unique), not by generated name
        if (desiredTable.indexes) {
          for (const columns of desiredTable.indexes) {
            const indexExists = currentTable.indexes.some(idx =>
              !idx.isUnique && this.columnsMatch(idx.columns, columns)
            );

            if (!indexExists) {
              const indexName = `idx_${tableName}_${columns.join('_')}`;
              diff.indexesToCreate.push({
                tableName,
                indexName,
                columns,
                isUnique: false
              });
            }
          }
        }

        // INTEGRITY: Check for missing numeric NaN/Infinity protection CHECK constraints
        // For any existing numeric column that lacks the GenLogic protection constraint
        for (const dbColumn of currentTable.columns) {
          if (this.isFloatingPointNumeric(dbColumn.type)) {
            // Generate expected constraint name following GenLogic convention
            const constraintName = `${tableName}_${dbColumn.name}_check`;

            // Check if this constraint already exists
            const constraintExists = currentTable.checkConstraints.some(
              cc => cc.name === constraintName && cc.columnName === dbColumn.name
            );

            if (!constraintExists) {
              diff.checkConstraintsToAdd.push({
                tableName,
                columnName: dbColumn.name,
                constraintName,
                columnType: dbColumn.type
              });
            }
          }
        }

        // Check for table-level CHECK constraints from processedSchema
        // Compare by STRUCTURE (constraint expression), not by generated name
        if (desiredTable.constraints) {
          for (const expression of desiredTable.constraints) {
            // Normalize both desired and existing expressions for comparison
            const normalizedDesired = this.normalizeCheckExpression(expression);

            // Check if a constraint with this expression already exists
            const constraintExists = currentTable.checkConstraints.some(cc => {
              // Extract the expression from "CHECK (expression)" format
              const match = cc.definition.match(/^CHECK\s*\((.*)\)\s*$/i);
              const existingExpr = match ? match[1].trim() : cc.definition.trim();
              const normalizedExisting = this.normalizeCheckExpression(existingExpr);
              return normalizedExisting === normalizedDesired;
            });

            if (!constraintExists) {
              // Generate a constraint name based on table name and hash of expression
              const hash = this.hashExpression(normalizedDesired);
              const constraintName = `${tableName}_check_${hash}`;

              diff.checkConstraintsToAdd.push({
                tableName,
                columnName: '',  // Table-level constraint, no specific column
                constraintName,
                expression
              });
            }
          }
        }
      }

      // Always recreate GenLogic triggers (they get dropped first)
      diff.triggersToRecreate.push(tableName);
    }

    return diff;
  }

  /**
   * Get all columns for a table (explicit + generated FK columns)
   */
  private getAllTableColumns(table: ProcessedTable): Array<{name: string, definition: ColumnDefinition}> {
    const columns: Array<{name: string, definition: ColumnDefinition}> = [];

    // Add all columns (explicit columns + FK-generated columns are merged)
    for (const [name, definition] of Object.entries(table.columns)) {
      columns.push({ name, definition });
    }

    return columns;
  }

  /**
   * Find columns that exist in desired schema but not in current database
   */
  private findNewColumns(
    desiredTable: ProcessedTable,
    currentTable: DatabaseTable
  ): Array<{name: string, definition: ColumnDefinition}> {
    const newColumns: Array<{name: string, definition: ColumnDefinition}> = [];
    const currentColumnNames = new Set(currentTable.columns.map(col => col.name));

    // Check all columns (FK columns are now merged into columns)
    for (const [name, definition] of Object.entries(desiredTable.columns)) {
      if (!currentColumnNames.has(name)) {
        newColumns.push({ name, definition });
      }
    }

    return newColumns;
  }

  /**
   * Find columns that need modification (safe expansions only)
   * Supports: VARCHAR/CHAR size expansion, NUMERIC precision/scale expansion
   */
  private findModifiedColumns(
    desiredTable: ProcessedTable,
    currentTable: DatabaseTable
  ): ColumnModification[] {
    const modifications: ColumnModification[] = [];
    const currentColumnMap = new Map(currentTable.columns.map(col => [col.name, col]));

    for (const [name, desiredDef] of Object.entries(desiredTable.columns)) {
      const currentCol = currentColumnMap.get(name);
      if (!currentCol) continue; // New column, not a modification

      const modification = this.detectSafeColumnModification(
        currentTable.name,
        name,
        currentCol.type,
        desiredDef
      );

      if (modification) {
        modifications.push(modification);
      }
    }

    return modifications;
  }

  /**
   * Detect if column modification is safe (expansion only)
   * Returns ColumnModification if safe expansion detected, null otherwise
   */
  private detectSafeColumnModification(
    tableName: string,
    columnName: string,
    currentType: string,
    desiredDef: ColumnDefinition
  ): ColumnModification | null {
    // Parse current type
    const currentParsed = this.parseColumnType(currentType);

    // Build desired type from definition
    const desiredType = this.buildTypeString(desiredDef);
    const desiredParsed = this.parseColumnType(desiredType);

    // Must be same base type (with normalization for PostgreSQL aliases)
    const currentNormalized = this.normalizeTypeName(currentParsed.baseType);
    const desiredNormalized = this.normalizeTypeName(desiredParsed.baseType);

    if (currentNormalized !== desiredNormalized) {
      throw new Error(
        `Cannot change column type for ${tableName}.${columnName}: ` +
        `database has ${currentType}, schema specifies ${desiredType}. ` +
        `Type changes are not supported. Use manual ALTER TABLE if needed.`
      );
    }

    // Check for safe expansions (using normalized type names)
    if (currentNormalized === 'varchar') {
      // VARCHAR expansion
      if (desiredParsed.size && currentParsed.size) {
        if (desiredParsed.size < currentParsed.size) {
          throw new Error(
            `Cannot narrow column ${tableName}.${columnName}: ` +
            `database has VARCHAR(${currentParsed.size}), schema specifies VARCHAR(${desiredParsed.size}). ` +
            `Narrowing columns would truncate data. Use manual ALTER TABLE if needed.`
          );
        }
        if (desiredParsed.size > currentParsed.size) {
          return {
            tableName,
            columnName,
            currentType,
            newType: desiredType,
            reason: `VARCHAR size expanded from ${currentParsed.size} to ${desiredParsed.size}`
          };
        }
      }
    } else if (currentNormalized === 'char') {
      // CHAR expansion
      if (desiredParsed.size && currentParsed.size) {
        if (desiredParsed.size < currentParsed.size) {
          throw new Error(
            `Cannot narrow column ${tableName}.${columnName}: ` +
            `database has CHAR(${currentParsed.size}), schema specifies CHAR(${desiredParsed.size}). ` +
            `Narrowing columns would truncate data. Use manual ALTER TABLE if needed.`
          );
        }
        if (desiredParsed.size > currentParsed.size) {
          return {
            tableName,
            columnName,
            currentType,
            newType: desiredType,
            reason: `CHAR size expanded from ${currentParsed.size} to ${desiredParsed.size}`
          };
        }
      }
    } else if (currentNormalized === 'numeric') {
      // NUMERIC expansion - both precision and scale can increase
      if (currentParsed.precision && desiredParsed.precision && currentParsed.scale !== undefined && desiredParsed.scale !== undefined) {
        // Check for narrowing (precision decrease OR scale decrease)
        const precisionNarrowed = desiredParsed.precision < currentParsed.precision;
        const scaleNarrowed = desiredParsed.scale < currentParsed.scale;

        if (precisionNarrowed || scaleNarrowed) {
          const problems: string[] = [];
          if (precisionNarrowed) {
            problems.push(`precision ${currentParsed.precision} → ${desiredParsed.precision}`);
          }
          if (scaleNarrowed) {
            problems.push(`scale ${currentParsed.scale} → ${desiredParsed.scale}`);
          }
          throw new Error(
            `Cannot narrow column ${tableName}.${columnName}: ` +
            `database has NUMERIC(${currentParsed.precision},${currentParsed.scale}), ` +
            `schema specifies NUMERIC(${desiredParsed.precision},${desiredParsed.scale}). ` +
            `Narrowing ${problems.join(' and ')} would lose data. Use manual ALTER TABLE if needed.`
          );
        }

        // Check for expansion
        const precisionExpanded = desiredParsed.precision > currentParsed.precision;
        const scaleExpanded = desiredParsed.scale > currentParsed.scale;

        if (precisionExpanded || scaleExpanded) {
          const changes: string[] = [];
          if (precisionExpanded) {
            changes.push(`precision ${currentParsed.precision} → ${desiredParsed.precision}`);
          }
          if (scaleExpanded) {
            changes.push(`scale ${currentParsed.scale} → ${desiredParsed.scale}`);
          }

          return {
            tableName,
            columnName,
            currentType,
            newType: desiredType,
            reason: `NUMERIC expanded (${changes.join(', ')})`
          };
        }
      }
    }

    return null; // No safe modification detected
  }

  /**
   * Normalize PostgreSQL type names to their canonical forms
   * Handles aliases like "character varying" -> "varchar", "character" -> "char"
   */
  private normalizeTypeName(typeName: string): string {
    const normalized = typeName.toLowerCase();

    // PostgreSQL type aliases
    const typeMap: Record<string, string> = {
      'character varying': 'varchar',
      'character': 'char',
      'int': 'integer',
      'int4': 'integer',
      'int8': 'bigint',
      'int2': 'smallint',
      'float8': 'double precision',
      'float4': 'real',
      'bool': 'boolean',
      'serial': 'integer',
      'bigserial': 'bigint',
      'smallserial': 'smallint',
      'timestamp without time zone': 'timestamp',
      'timestamp with time zone': 'timestamptz',
      'time without time zone': 'time',
      'time with time zone': 'timetz'
    };

    return typeMap[normalized] || normalized;
  }

  /**
   * Parse PostgreSQL column type into components
   */
  private parseColumnType(type: string): {
    baseType: string;
    size?: number;
    precision?: number;
    scale?: number;
  } {
    // Extract base type and parameters
    const match = type.match(/^(\w+(?:\s+\w+)?)\s*(?:\((\d+)(?:,(\d+))?\))?$/);

    if (!match) {
      return { baseType: type.toLowerCase() };
    }

    const baseType = match[1].toLowerCase();
    const param1 = match[2] ? parseInt(match[2]) : undefined;
    const param2 = match[3] ? parseInt(match[3]) : undefined;

    if (baseType === 'numeric' && param1 !== undefined) {
      return {
        baseType,
        precision: param1,
        scale: param2 !== undefined ? param2 : 0
      };
    } else if (param1 !== undefined) {
      return {
        baseType,
        size: param1
      };
    }

    return { baseType };
  }

  /**
   * Build type string from ColumnDefinition
   */
  private buildTypeString(def: ColumnDefinition): string {
    const typeMatch = def.type.match(/^(\w+(?:\s+\w+)?)/);
    const baseType = typeMatch ? typeMatch[1] : def.type;

    if (def.size !== undefined && def.decimal !== undefined) {
      // NUMERIC(precision, scale)
      return `${baseType}(${def.size},${def.decimal})`;
    } else if (def.size !== undefined) {
      // VARCHAR(size) or CHAR(size)
      return `${baseType}(${def.size})`;
    }

    return baseType;
  }

  /**
   * Find foreign keys that exist in desired schema but not in current database
   * Compare by STRUCTURE (columns + referenced table), not by generated name
   */
  private findNewForeignKeys(
    desiredTable: ProcessedTable,
    currentTable: DatabaseTable
  ): Array<{name: string, fkName: string, definition: any, columnNames: string[]}> {
    const newForeignKeys: Array<{name: string, fkName: string, definition: any, columnNames: string[]}> = [];

    // Build structure signature for existing FKs: "col1,col2->parent_table"
    const existingFKStructures = new Set(
      currentTable.foreignKeys.map(fk => {
        // DatabaseForeignKey.column is singular (current DB state)
        return `${fk.column}->${fk.referencedTable}`;
      })
    );

    for (const [fkName, definition] of Object.entries(desiredTable.foreignKeys)) {
      // Get the column names for this FK from the mapping
      const columnNames = desiredTable.fkColumnMapping[fkName] || [fkName];
      const referencedTable = definition.table;

      // Build structure signature for this desired FK
      // For single-column FKs, just use the column name (not "col,")
      const fkStructure = columnNames.length === 1
        ? `${columnNames[0]}->${referencedTable}`
        : `${columnNames.join(',')}->${referencedTable}`;

      if (!existingFKStructures.has(fkStructure)) {
        // Generate a consistent FK constraint name
        const constraintName = `fk_${currentTable.name}_${fkName}`;
        newForeignKeys.push({
          name: constraintName,
          fkName,
          definition,
          columnNames
        });
      }
    }

    return newForeignKeys;
  }

  /**
   * Check if a database type is a floating-point numeric type that can have NaN/Infinity
   * Integer types (integer, bigint, smallint) cannot have NaN/Infinity
   *
   * NOTE: This parses PostgreSQL types from database introspection, which may include
   * precision/scale like "numeric(10,2)" - we extract just the base type name
   */
  private isFloatingPointNumeric(dbType: string): boolean {
    // Extract base type from "numeric(10,2)" or "character varying(50)" etc
    const baseType = dbType.toLowerCase().split('(')[0].trim();
    const floatingPointTypes = ['numeric', 'decimal', 'real', 'double precision', 'float'];
    return floatingPointTypes.includes(baseType);
  }

  /**
   * Compare two column lists for structural equality
   * Handles both array and string column specifications
   */
  private columnsMatch(existingColumns: string[] | string, desiredColumns: string[]): boolean {
    // Normalize to arrays
    const existing = Array.isArray(existingColumns) ? existingColumns : [existingColumns];
    const desired = desiredColumns;

    // Must have same length
    if (existing.length !== desired.length) {
      return false;
    }

    // Must have same columns in same order
    return existing.every((col, idx) => col === desired[idx]);
  }

  /**
   * Normalize CHECK constraint expression for comparison
   * Removes extra whitespace, parentheses, and normalizes formatting
   * NOTE: @ sigils are already stripped when stored in processedSchema
   */
  private normalizeCheckExpression(expr: string): string {
    return expr
      .trim()
      .replace(/\s+/g, ' ')  // Collapse multiple spaces to single space
      .replace(/[()]/g, '')  // Remove all parentheses for structural comparison
      .toLowerCase();
  }

  /**
   * Generate a short hash of an expression for constraint naming
   * Uses simple hash to create readable constraint names
   */
  private hashExpression(expr: string): string {
    let hash = 0;
    for (let i = 0; i < expr.length; i++) {
      const char = expr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Return absolute value as hex, truncated to 8 chars
    return Math.abs(hash).toString(16).substring(0, 8);
  }
}

// Diff result types
export interface SchemaDiff {
  tablesToCreate: TableCreation[];
  columnsToAdd: ColumnAddition[];
  columnsToModify: ColumnModification[];
  primaryKeysToAdd: PrimaryKeyAddition[];  // Composite primary keys to add to existing tables
  indexesToCreate: IndexCreation[];
  foreignKeysToAdd: ForeignKeyAddition[];
  checkConstraintsToAdd: CheckConstraintAddition[];
  aggregationsToBackfill: AggregationBackfill[]; // New aggregation columns needing backfill
  triggersToRecreate: string[]; // Table names that need trigger recreation
}

export interface TableCreation {
  tableName: string;
  comment?: string;
  singleton?: boolean;  // If true, table can only contain one row
  columns: Array<{name: string, definition: ColumnDefinition}>;
  foreignKeys: Record<string, any>;
  primaryKey?: string[];  // Composite primary key column names
  constraints?: string[];  // Table-level CHECK constraint expressions
}

export interface ColumnAddition {
  tableName: string;
  columnName: string;
  definition: ColumnDefinition;
}

export interface PrimaryKeyAddition {
  tableName: string;
  columns: string[];  // Column names that form the composite primary key
}

export interface ColumnModification {
  tableName: string;
  columnName: string;
  currentType: string;
  newType: string;
  reason: string;  // Description of what changed (e.g., "VARCHAR size expanded from 30 to 60")
}

export interface IndexCreation {
  tableName: string;
  indexName: string;
  columns: string[];
  isUnique: boolean;
}

export interface ForeignKeyAddition {
  tableName: string;
  foreignKeyName: string;
  fkName: string;
  definition: any;
  columnNames: string[];
}

export interface CheckConstraintAddition {
  tableName: string;
  columnName: string;  // Empty string for table-level constraints
  constraintName: string;
  columnType?: string;  // Only for column-level numeric constraints
  expression?: string;  // Only for table-level constraints
}

export interface AggregationBackfill {
  parentTable: string;        // Table with the aggregation column
  aggregationColumn: string;  // Column to backfill
  aggregationType: 'SUM' | 'COUNT' | 'MAX' | 'MIN';  // Type of aggregation (not LAST_VALUE)
  childTable: string;         // Table being aggregated
  childColumn: string;        // Column in child table
  foreignKey: string;         // FK column name(s) in child table
  whereClause?: string;       // Optional filter condition for filtered aggregations
}