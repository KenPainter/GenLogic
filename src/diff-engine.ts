import type {
  DatabaseTable,
  ColumnDefinition,
  GenLogicSchema
} from './types.js';
import type { PopulatedSchema, PopulatedTableDef, PopulatedColumnDef } from './helpers-processor/schema-populator.js';
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
    desiredSchema: PopulatedSchema,
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
      foreignKeysToModify: [],
      checkConstraintsToAdd: [],
      aggregationsToBackfill: [],
      triggersToRecreate: []
    };

    // Process each desired table
    for (const [tableName, desiredTable] of desiredSchema.tables.entries()) {
      const currentTable = currentSchema[tableName];

      if (!currentTable) {
        // Table doesn't exist - create it with all columns

        // Build foreign keys for this table from schema-level foreignKeys array
        const tableForeignKeys: Record<string, any> = {};
        for (const fk of desiredSchema.foreignKeys) {
          if (fk.childTable === tableName) {
            // This FK belongs to this table
            tableForeignKeys[fk.generatedName] = {
              table: fk.parentTable,
              column: fk.parentColumn,
              deleteAction: fk.deleteAction,
              notNull: fk.notNull
            };
          }
        }

        // Convert ConstraintDef[] to string[]
        const constraintStrings = desiredTable.constraints.map(c => c.expression);

        const tableCreation: TableCreation = {
          tableName,
          comment: desiredTable.comment,
          singleton: desiredTable.singleton,
          columns: this.getAllTableColumns(desiredTable),
          foreignKeys: tableForeignKeys,
          constraints: constraintStrings
        };

        // Add composite primary key if specified (look for _isPrimaryKey marker)
        const pkColumns: string[] = [];
        for (const [colName, colDef] of desiredTable.columns.entries()) {
          if (colDef._isPrimaryKey) {
            pkColumns.push(colName);
          }
        }
        if (pkColumns.length > 0) {
          tableCreation.primaryKey = pkColumns;
        }

        diff.tablesToCreate.push(tableCreation);

        // Create indexes for foreign key columns
        for (const fk of desiredSchema.foreignKeys) {
          if (fk.childTable === tableName) {
            diff.indexesToCreate.push({
              tableName,
              indexName: `idx_${tableName}_${fk.childColumn}`,
              columns: [fk.childColumn],
              isUnique: false
            });
          }
        }

        // Create unique constraints from PopulatedTableDef
        for (const uniqueConstraint of desiredTable.uniqueConstraints) {
          diff.indexesToCreate.push({
            tableName,
            indexName: uniqueConstraint.name,
            columns: uniqueConstraint.columns,
            isUnique: true
          });
        }

        // Create indexes from PopulatedTableDef
        for (const index of desiredTable.indexes) {
          diff.indexesToCreate.push({
            tableName,
            indexName: index.name,
            columns: index.columns,
            isUnique: false
          });
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
          // In PopulatedSchema, we already have parsed automation info
          const colDef = desiredTable.columns.get(column.name);
          if (colDef?.automation) {
            const auto = colDef.automation;

            // Only backfill SUM, COUNT, MAX, MIN (not SYNC - we don't know which row is "last")
            if (['SUM', 'COUNT', 'MAX', 'MIN'].includes(auto.type)) {
              // Find the FK column from the schema-level foreignKeys
              // The FK lives in the CHILD table (auto.targetTable)
              let fkColumnName: string | undefined;

              if (auto.fkColumn) {
                // FK explicitly specified in automation
                fkColumnName = auto.fkColumn;
              } else {
                // FK not specified - find FK from child to parent
                for (const fk of desiredSchema.foreignKeys) {
                  if (fk.childTable === auto.targetTable && fk.parentTable === tableName) {
                    fkColumnName = fk.childColumn;
                    break;
                  }
                }
              }

              if (fkColumnName) {
                diff.aggregationsToBackfill.push({
                  parentTable: tableName,
                  aggregationColumn: column.name,
                  aggregationType: auto.type as 'SUM' | 'COUNT' | 'MAX' | 'MIN',
                  childTable: auto.targetTable,
                  childColumn: auto.targetColumn,
                  foreignKey: fkColumnName,
                  whereClause: auto.whereClause
                });
              }
            }
          }
        }

        // Check for missing composite primary key
        // Compare by STRUCTURE (column list), not just presence
        // In PopulatedTableDef, PK columns are marked with _isPrimaryKey
        const desiredPKColumns: string[] = [];
        for (const [colName, colDef] of desiredTable.columns.entries()) {
          if (colDef._isPrimaryKey) {
            desiredPKColumns.push(colName);
          }
        }
        desiredPKColumns.sort();

        if (desiredPKColumns.length > 0) {
          // Get current primary key columns
          const currentPKColumns = currentTable.columns
            .filter(col => col.isPrimaryKey)
            .map(col => col.name)
            .sort();

          const pkMatches = currentPKColumns.length === desiredPKColumns.length &&
            currentPKColumns.every((col, idx) => col === desiredPKColumns[idx]);

          if (!pkMatches) {
            if (currentPKColumns.length > 0) {
              // Table has a different PK - this is an error
              throw new Error(
                `Cannot change primary key for table '${tableName}': ` +
                `database has PK on [${currentPKColumns.join(', ')}], ` +
                `schema specifies PK on [${desiredPKColumns.join(', ')}]. ` +
                `Primary key changes are not supported. Use manual ALTER TABLE if needed.`
              );
            } else {
              // Table has no PK - add it
              diff.primaryKeysToAdd.push({
                tableName,
                columns: desiredPKColumns
              });
            }
          }
        }

        // Check for modified columns (safe expansions only)
        const modifiedColumns = this.findModifiedColumns(desiredTable, currentTable);
        for (const column of modifiedColumns) {
          diff.columnsToModify.push(column);
        }

        // Check for new and modified foreign keys
        const fkChanges = this.compareForeignKeys(desiredTable, currentTable, tableName, desiredSchema.foreignKeys);

        // Handle new FKs
        for (const fk of fkChanges.toAdd) {
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

        // Handle modified FKs
        for (const fk of fkChanges.toModify) {
          diff.foreignKeysToModify.push({
            tableName,
            oldConstraintName: fk.oldConstraintName,
            newConstraintName: fk.newConstraintName,
            fkName: fk.fkName,
            columnNames: fk.columnNames,
            definition: fk.definition,
            reason: fk.reason
          });
        }

        // Check for new unique constraints from PopulatedTableDef
        // Compare by STRUCTURE (column list + uniqueness), not by generated name
        for (const uniqueConstraint of desiredTable.uniqueConstraints) {
          const indexExists = currentTable.indexes.some(idx =>
            idx.isUnique && this.columnsMatch(idx.columns, uniqueConstraint.columns)
          );

          if (!indexExists) {
            diff.indexesToCreate.push({
              tableName,
              indexName: uniqueConstraint.name,
              columns: uniqueConstraint.columns,
              isUnique: true
            });
          }
        }

        // Check for new indexes from PopulatedTableDef
        // Compare by STRUCTURE (column list, must be non-unique), not by generated name
        for (const index of desiredTable.indexes) {
          const indexExists = currentTable.indexes.some(idx =>
            !idx.isUnique && this.columnsMatch(idx.columns, index.columns)
          );

          if (!indexExists) {
            diff.indexesToCreate.push({
              tableName,
              indexName: index.name,
              columns: index.columns,
              isUnique: false
            });
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

        // Check for table-level CHECK constraints from PopulatedTableDef
        // Compare by STRUCTURE (constraint expression), not by generated name
        for (const constraint of desiredTable.constraints) {
          // Normalize both desired and existing expressions for comparison
          const normalizedDesired = this.normalizeCheckExpression(constraint.expression);

          // Check if a constraint with this expression already exists
          const constraintExists = currentTable.checkConstraints.some(cc => {
            // Extract the expression from "CHECK (expression)" format
            const match = cc.definition.match(/^CHECK\s*\((.*)\)\s*$/i);
            const existingExpr = match ? match[1].trim() : cc.definition.trim();
            const normalizedExisting = this.normalizeCheckExpression(existingExpr);
            return normalizedExisting === normalizedDesired;
          });

          if (!constraintExists) {
            diff.checkConstraintsToAdd.push({
              tableName,
              columnName: '',  // Table-level constraint, no specific column
              constraintName: constraint.name,
              expression: constraint.expression
            });
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
  private getAllTableColumns(table: PopulatedTableDef): Array<{name: string, definition: ColumnDefinition}> {
    const columns: Array<{name: string, definition: ColumnDefinition}> = [];

    // Add all columns from PopulatedTableDef
    for (const [name, populatedCol] of table.columns.entries()) {
      // Convert PopulatedColumnDef to ColumnDefinition format
      const definition: ColumnDefinition = {
        type: populatedCol.parsedDefinition.fullDefinition,
        comment: populatedCol.comment,
        label: populatedCol.label,
        format: populatedCol.format
      };

      // Add automation if present
      if (populatedCol.automation) {
        // Convert AutomationInfo back to string format for ColumnDefinition
        const auto = populatedCol.automation;
        let autoStr = `${auto.type}(${auto.targetTable}.${auto.targetColumn}`;
        if (auto.fkColumn) {
          autoStr += `, ${auto.fkColumn}`;
        }
        if (auto.whereClause) {
          autoStr += ` WHERE ${auto.whereClause}`;
        }
        autoStr += ')';
        definition.automation = autoStr;
      }

      // Add formula if present
      if (populatedCol.formula) {
        definition.formula = populatedCol.formula.expression;
      }

      columns.push({ name, definition });
    }

    return columns;
  }

  /**
   * Find columns that exist in desired schema but not in current database
   */
  private findNewColumns(
    desiredTable: PopulatedTableDef,
    currentTable: DatabaseTable
  ): Array<{name: string, definition: ColumnDefinition}> {
    const newColumns: Array<{name: string, definition: ColumnDefinition}> = [];
    const currentColumnNames = new Set(currentTable.columns.map(col => col.name));

    // Check all columns from PopulatedTableDef
    const allColumns = this.getAllTableColumns(desiredTable);
    for (const column of allColumns) {
      if (!currentColumnNames.has(column.name)) {
        newColumns.push(column);
      }
    }

    return newColumns;
  }

  /**
   * Find columns that need modification (safe expansions only)
   * Supports: VARCHAR/CHAR size expansion, NUMERIC precision/scale expansion
   */
  private findModifiedColumns(
    desiredTable: PopulatedTableDef,
    currentTable: DatabaseTable
  ): ColumnModification[] {
    const modifications: ColumnModification[] = [];
    const currentColumnMap = new Map(currentTable.columns.map(col => [col.name, col]));

    // Convert PopulatedColumnDef to ColumnDefinition for comparison
    const allColumns = this.getAllTableColumns(desiredTable);
    for (const column of allColumns) {
      const currentCol = currentColumnMap.get(column.name);
      if (!currentCol) continue; // New column, not a modification

      const modification = this.detectSafeColumnModification(
        currentTable.name,
        column.name,
        currentCol,
        column.definition
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
   * Also detects NOT NULL changes (adding or removing)
   */
  private detectSafeColumnModification(
    tableName: string,
    columnName: string,
    currentCol: {type: string, nullable: boolean},
    desiredDef: ColumnDefinition
  ): ColumnModification | null {
    // Parse current type
    const currentParsed = this.parseColumnType(currentCol.type);

    // Build desired type from definition
    const desiredType = this.buildTypeString(desiredDef);
    const desiredParsed = this.parseColumnType(desiredType);

    // Must be same base type (with normalization for PostgreSQL aliases)
    const currentNormalized = this.normalizeTypeName(currentParsed.baseType);
    const desiredNormalized = this.normalizeTypeName(desiredParsed.baseType);

    if (currentNormalized !== desiredNormalized) {
      throw new Error(
        `Cannot change column type for ${tableName}.${columnName}: ` +
        `database has ${currentCol.type}, schema specifies ${desiredType}. ` +
        `Type changes are not supported. Use manual ALTER TABLE if needed.`
      );
    }

    // Check for NOT NULL changes
    // currentCol.nullable = true means column IS nullable (can be NULL)
    // desiredDef["not-null"] = true means column should NOT be nullable (NOT NULL)
    const currentIsNullable = currentCol.nullable;
    const desiredIsNullable = !desiredDef["not-null"];

    if (currentIsNullable && !desiredIsNullable) {
      // Adding NOT NULL - this is potentially unsafe but we'll allow it
      // SQL generator should add a check to ensure no NULLs exist
      return {
        tableName,
        columnName,
        currentType: currentCol.type,
        newType: desiredType,
        reason: 'Adding NOT NULL constraint'
      };
    } else if (!currentIsNullable && desiredIsNullable) {
      // Removing NOT NULL - this is always safe
      return {
        tableName,
        columnName,
        currentType: currentCol.type,
        newType: desiredType,
        reason: 'Removing NOT NULL constraint'
      };
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
            currentType: currentCol.type,
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
            currentType: currentCol.type,
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
            currentType: currentCol.type,
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
   * Compare foreign keys between desired and current schema
   * Detects both new FKs and modifications to existing FKs (ON DELETE changes, etc.)
   * Compare by STRUCTURE (columns + referenced table), not by generated name
   */
  private compareForeignKeys(
    desiredTable: PopulatedTableDef,
    currentTable: DatabaseTable,
    tableName: string,
    schemaForeignKeys: PopulatedForeignKeyDef[]
  ): {
    toAdd: Array<{name: string, fkName: string, definition: any, columnNames: string[]}>,
    toModify: Array<{oldConstraintName: string, newConstraintName: string, fkName: string, definition: any, columnNames: string[], reason: string}>
  } {
    const toAdd: Array<{name: string, fkName: string, definition: any, columnNames: string[]}> = [];
    const toModify: Array<{oldConstraintName: string, newConstraintName: string, fkName: string, definition: any, columnNames: string[], reason: string}> = [];

    // Build map of existing FKs: "col->table" => DatabaseForeignKey
    const existingFKMap = new Map<string, {constraint: string, onDelete: string}>();
    for (const fk of currentTable.foreignKeys) {
      const key = `${fk.column}->${fk.referencedTable}`;
      existingFKMap.set(key, {
        constraint: fk.name,
        onDelete: fk.onDelete
      });
    }

    // Get FKs for this table from schema-level foreignKeys array
    const tableFKs = schemaForeignKeys.filter(fk => fk.childTable === tableName);

    for (const fk of tableFKs) {
      const columnNames = [fk.childColumn];
      const referencedTable = fk.parentTable;

      // Build structure signature for this desired FK
      const fkStructure = `${fk.childColumn}->${referencedTable}`;

      const existingFK = existingFKMap.get(fkStructure);

      // Build definition object for compatibility with downstream code
      const definition = {
        table: fk.parentTable,
        column: fk.parentColumn,
        deleteAction: fk.deleteAction,
        notNull: fk.notNull
      };

      if (!existingFK) {
        // FK doesn't exist - add it
        toAdd.push({
          name: fk.generatedName,
          fkName: fk.fkName || fk.generatedName,
          definition,
          columnNames
        });
      } else {
        // FK exists - check if properties changed
        const desiredOnDelete = fk.deleteAction === 'cascade' ? 'CASCADE' : 'RESTRICT';
        const currentOnDelete = this.normalizeOnDeleteFromDB(existingFK.onDelete);

        if (desiredOnDelete !== currentOnDelete) {
          // ON DELETE behavior changed
          toModify.push({
            oldConstraintName: existingFK.constraint,
            newConstraintName: fk.generatedName,
            fkName: fk.fkName || fk.generatedName,
            definition,
            columnNames,
            reason: `Changed ON DELETE from ${currentOnDelete} to ${desiredOnDelete}`
          });
        }
      }
    }

    return { toAdd, toModify };
  }

  /**
   * Normalize ON DELETE value from schema definition
   * Returns: 'CASCADE' or 'RESTRICT'
   */
  private normalizeOnDelete(fkDef: any): string {
    // New format: onDelete field (Phase 6+)
    if (fkDef.onDelete === 'cascade') return 'CASCADE';
    if (fkDef.onDelete === 'restrict') return 'RESTRICT';

    // Legacy format support (for backward compatibility)
    if (fkDef["delete-cascade"] === true) return 'CASCADE';
    if (fkDef.delete === 'cascade') return 'CASCADE';
    if (fkDef.delete === 'restrict') return 'RESTRICT';

    // Default: RESTRICT (GenLogic's safe default)
    return 'RESTRICT';
  }

  /**
   * Normalize ON DELETE value from database
   * PostgreSQL returns: 'CASCADE', 'RESTRICT', 'NO ACTION', 'SET NULL', 'SET DEFAULT'
   */
  private normalizeOnDeleteFromDB(dbValue: string): string {
    return dbValue.toUpperCase();
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
  foreignKeysToModify: ForeignKeyModification[];  // Foreign keys with changed properties (ON DELETE, etc.)
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

export interface ForeignKeyModification {
  tableName: string;
  oldConstraintName: string;  // Existing constraint name in database
  newConstraintName: string;  // New constraint name to create
  fkName: string;
  columnNames: string[];
  definition: any;
  reason: string;  // Description of what changed (e.g., "Changed ON DELETE from NO ACTION to CASCADE")
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