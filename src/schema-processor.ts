import type {
  GenLogicSchema,
  ColumnDefinition,
  TableColumnDefinition,
  TableDefinition,
  ForeignKeyDefinition
} from './types.js';

/**
 * Schema Processing Engine
 *
 * GENLOGIC PRINCIPLE: Resolve inheritance patterns and generate FK columns
 * This processes the mixed inheritance syntax and creates the final resolved schema
 */
export class SchemaProcessor {

  /**
   * Process the entire schema, resolving all inheritance and generating FK columns
   */
  processSchema(schema: GenLogicSchema): ProcessedSchema {
    const processed: ProcessedSchema = {
      tables: {}
    };

    if (!schema.tables) return processed;

    // First pass: resolve column inheritance for all tables
    for (const [tableName, table] of Object.entries(schema.tables)) {
      processed.tables[tableName] = this.processTable(tableName, table, schema);
    }

    // Second pass: generate foreign key columns
    for (const [tableName, processedTable] of Object.entries(processed.tables)) {
      const originalTable = schema.tables![tableName];
      if (originalTable.foreign_keys) {
        this.generateForeignKeyColumns(
          processedTable,
          originalTable.foreign_keys,
          processed
        );
      }
    }

    return processed;
  }

  /**
   * Process a single table, resolving column inheritance
   */
  private processTable(_tableName: string, table: TableDefinition, schema: GenLogicSchema): ProcessedTable {
    const processedColumns: Record<string, ColumnDefinition> = {};

    if (table.columns) {
      for (const [columnName, column] of Object.entries(table.columns)) {
        processedColumns[columnName] = this.resolveColumnInheritance(
          columnName,
          column,
          schema.columns || {}
        );
      }
    }

    return {
      columns: processedColumns,
      foreignKeys: table.foreign_keys || {},
      generatedColumns: {}, // Will be populated by FK column generation
      fkColumnMapping: {} // Will be populated by FK column generation
    };
  }

  /**
   * Resolve column inheritance using our mixed syntax:
   * - null: inherit same name
   * - string: inherit named column
   * - object with $ref: inherit + override
   * - full object: no inheritance
   */
  private resolveColumnInheritance(
    columnName: string,
    column: TableColumnDefinition,
    reusableColumns: Record<string, ColumnDefinition>
  ): ColumnDefinition {

    // Case 1: null/empty - inherit from reusable column of same name
    if (column === null) {
      const reusableColumn = reusableColumns[columnName];
      if (!reusableColumn) {
        throw new Error(`Column '${columnName}' references missing reusable column '${columnName}'`);
      }
      return { ...reusableColumn };
    }

    // Case 2: string - inherit from named reusable column
    if (typeof column === 'string') {
      const reusableColumn = reusableColumns[column];
      if (!reusableColumn) {
        throw new Error(`Column '${columnName}' references missing reusable column '${column}'`);
      }
      return { ...reusableColumn };
    }

    // Case 3: object with $ref - inherit + override
    if (typeof column === 'object' && column !== null && '$ref' in column) {
      const refColumn = column as any;
      const reusableColumn = reusableColumns[refColumn.$ref];
      if (!reusableColumn) {
        throw new Error(`Column '${columnName}' references missing reusable column '${refColumn.$ref}'`);
      }

      // Merge reusable column with overrides
      const merged = { ...reusableColumn };

      // Apply overrides
      if (refColumn.type !== undefined) merged.type = refColumn.type;
      if (refColumn.size !== undefined) merged.size = refColumn.size;
      if (refColumn.decimal !== undefined) merged.decimal = refColumn.decimal;
      if (refColumn.primary_key !== undefined) merged.primary_key = refColumn.primary_key;
      if (refColumn.unique !== undefined) merged.unique = refColumn.unique;
      if (refColumn.sequence !== undefined) merged.sequence = refColumn.sequence;
      if (refColumn.automation !== undefined) merged.automation = refColumn.automation;

      return merged;
    }

    // Case 4: full column definition - no inheritance
    if (typeof column === 'object' && column !== null) {
      return { ...column as ColumnDefinition };
    }

    throw new Error(`Invalid column definition for '${columnName}'`);
  }

  /**
   * Generate foreign key columns based on referenced table's primary keys
   * GENLOGIC PRINCIPLE: Foreign keys create columns automatically
   */
  private generateForeignKeyColumns(
    processedTable: ProcessedTable,
    foreignKeys: Record<string, ForeignKeyDefinition>,
    processedSchema: ProcessedSchema
  ): void {

    for (const [fkName, fk] of Object.entries(foreignKeys)) {
      const referencedTable = processedSchema.tables[fk.table];
      if (!referencedTable) {
        throw new Error(`Foreign key '${fkName}' references missing table '${fk.table}'`);
      }

      // Find primary key columns in referenced table
      const primaryKeyColumns = this.findPrimaryKeyColumns(referencedTable);
      if (primaryKeyColumns.length === 0) {
        throw new Error(`Referenced table '${fk.table}' has no primary key columns`);
      }

      // Track generated column names for this FK
      const generatedFkColumns: string[] = [];

      // Generate FK columns for each primary key column
      for (const pkColumn of primaryKeyColumns) {
        const fkColumnName = this.generateFKColumnName(pkColumn.name, fk);

        // Create FK column with same type as PK column but without PK/sequence flags
        const fkColumnDef: ColumnDefinition = {
          type: pkColumn.definition.type,
          ...(pkColumn.definition.size && { size: pkColumn.definition.size }),
          ...(pkColumn.definition.decimal && { decimal: pkColumn.definition.decimal }),
          primary_key: false, // FK columns are not primary keys
          unique: false,
          sequence: false // FK columns don't have sequences
        };

        processedTable.generatedColumns[fkColumnName] = fkColumnDef;
        generatedFkColumns.push(fkColumnName);
      }

      // Store the mapping from FK name to generated column names
      processedTable.fkColumnMapping[fkName] = generatedFkColumns;
    }
  }

  /**
   * Find all primary key columns in a table
   */
  private findPrimaryKeyColumns(table: ProcessedTable): Array<{name: string, definition: ColumnDefinition}> {
    const primaryKeys: Array<{name: string, definition: ColumnDefinition}> = [];

    // Check explicit columns
    for (const [columnName, column] of Object.entries(table.columns)) {
      if (column.primary_key) {
        primaryKeys.push({ name: columnName, definition: column });
      }
    }

    // Check generated FK columns (in case of compound keys)
    for (const [columnName, column] of Object.entries(table.generatedColumns)) {
      if (column.primary_key) {
        primaryKeys.push({ name: columnName, definition: column });
      }
    }

    return primaryKeys;
  }

  /**
   * Generate foreign key column name using prefix/suffix
   */
  private generateFKColumnName(pkColumnName: string, fk: ForeignKeyDefinition): string {
    let fkColumnName = pkColumnName;

    if (fk.prefix) {
      fkColumnName = fk.prefix + fkColumnName;
    }

    if (fk.suffix) {
      fkColumnName = fkColumnName + fk.suffix;
    }

    return fkColumnName;
  }
}

// Processed schema types
export interface ProcessedSchema {
  tables: Record<string, ProcessedTable>;
}

export interface ProcessedTable {
  columns: Record<string, ColumnDefinition>;
  foreignKeys: Record<string, ForeignKeyDefinition>;
  generatedColumns: Record<string, ColumnDefinition>; // FK columns generated automatically
  fkColumnMapping: Record<string, string[]>; // Maps FK name to generated column names
}