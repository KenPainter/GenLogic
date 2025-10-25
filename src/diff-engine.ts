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
        diff.tablesToCreate.push({
          tableName,
          comment: desiredTable.comment,
          columns: this.getAllTableColumns(desiredTable),
          foreignKeys: desiredTable.foreignKeys
        });

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

        // Create unique constraints from originalSchema
        if (originalSchema?.tables?.[tableName]?.unique_constraints) {
          for (const columns of originalSchema.tables[tableName].unique_constraints!) {
            diff.indexesToCreate.push({
              tableName,
              indexName: `unique_${tableName}_${columns.join('_')}`,
              columns,
              isUnique: true
            });
          }
        }

        // Create indexes from originalSchema
        if (originalSchema?.tables?.[tableName]?.indexes) {
          for (const columns of originalSchema.tables[tableName].indexes!) {
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
                // Get the FK column name(s) from the mapping
                const fkColumnName = parsed.foreign_key || desiredTable.fkColumnMapping[parsed.table]?.[0];

                if (fkColumnName) {
                  diff.aggregationsToBackfill.push({
                    parentTable: tableName,
                    aggregationColumn: column.name,
                    aggregationType: parsed.type as 'SUM' | 'COUNT' | 'MAX' | 'MIN',
                    childTable: parsed.table,
                    childColumn: parsed.column,
                    foreignKey: fkColumnName
                  });
                }
              }
            } catch (error) {
              // If automation parsing fails, skip backfill detection
              // The error will be caught during trigger generation
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
          const indexName = `idx_${tableName}_${fk.columnNames.join('_')}`;
          const indexExists = currentTable.indexes.some(idx => idx.name === indexName);

          if (!indexExists) {
            diff.indexesToCreate.push({
              tableName,
              indexName,
              columns: fk.columnNames,
              isUnique: false
            });
          }
        }

        // Check for new unique constraints from originalSchema
        if (originalSchema?.tables?.[tableName]?.unique_constraints) {
          for (const columns of originalSchema.tables[tableName].unique_constraints!) {
            const indexName = `unique_${tableName}_${columns.join('_')}`;
            const indexExists = currentTable.indexes.some(idx => idx.name === indexName);

            if (!indexExists) {
              diff.indexesToCreate.push({
                tableName,
                indexName,
                columns,
                isUnique: true
              });
            }
          }
        }

        // Check for new indexes from originalSchema
        if (originalSchema?.tables?.[tableName]?.indexes) {
          for (const columns of originalSchema.tables[tableName].indexes!) {
            const indexName = `idx_${tableName}_${columns.join('_')}`;
            const indexExists = currentTable.indexes.some(idx => idx.name === indexName);

            if (!indexExists) {
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
   */
  private findNewForeignKeys(
    desiredTable: ProcessedTable,
    currentTable: DatabaseTable
  ): Array<{name: string, fkName: string, definition: any, columnNames: string[]}> {
    const newForeignKeys: Array<{name: string, fkName: string, definition: any, columnNames: string[]}> = [];
    const currentFKNames = new Set(currentTable.foreignKeys.map(fk => fk.name));

    for (const [fkName, definition] of Object.entries(desiredTable.foreignKeys)) {
      // Generate a consistent FK constraint name
      const constraintName = `fk_${currentTable.name}_${fkName}`;
      if (!currentFKNames.has(constraintName)) {
        // Get the column names for this FK from the mapping
        const columnNames = desiredTable.fkColumnMapping[fkName] || [fkName];
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
}

// Diff result types
export interface SchemaDiff {
  tablesToCreate: TableCreation[];
  columnsToAdd: ColumnAddition[];
  columnsToModify: ColumnModification[];
  indexesToCreate: IndexCreation[];
  foreignKeysToAdd: ForeignKeyAddition[];
  checkConstraintsToAdd: CheckConstraintAddition[];
  aggregationsToBackfill: AggregationBackfill[]; // New aggregation columns needing backfill
  triggersToRecreate: string[]; // Table names that need trigger recreation
}

export interface TableCreation {
  tableName: string;
  comment?: string;
  columns: Array<{name: string, definition: ColumnDefinition}>;
  foreignKeys: Record<string, any>;
}

export interface ColumnAddition {
  tableName: string;
  columnName: string;
  definition: ColumnDefinition;
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
  columnName: string;
  constraintName: string;
  columnType: string;
}

export interface AggregationBackfill {
  parentTable: string;        // Table with the aggregation column
  aggregationColumn: string;  // Column to backfill
  aggregationType: 'SUM' | 'COUNT' | 'MAX' | 'MIN';  // Type of aggregation (not LAST_VALUE)
  childTable: string;         // Table being aggregated
  childColumn: string;        // Column in child table
  foreignKey: string;         // FK column name(s) in child table
}