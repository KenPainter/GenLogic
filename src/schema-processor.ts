import type {
  GenLogicSchema,
  ColumnDefinition,
  TableColumnDefinition,
  TableDefinition,
  ForeignKeyDefinition
} from './types.js';
import { parseSQLType } from './sql-type-parser.js';

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

    // Preprocess global columns section to parse SQL type strings
    const processedReusableColumns = this.processReusableColumns(schema.columns || {});

    // First pass: resolve column inheritance for all tables
    for (const [tableName, table] of Object.entries(schema.tables)) {
      processed.tables[tableName] = this.processTable(tableName, table, schema, processedReusableColumns);
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
   * Preprocess reusable columns section to parse SQL type strings
   */
  private processReusableColumns(reusableColumns: Record<string, ColumnDefinition | string>): Record<string, ColumnDefinition> {
    const processed: Record<string, ColumnDefinition> = {};

    for (const [columnName, column] of Object.entries(reusableColumns)) {
      if (typeof column === 'string') {
        // Parse SQL type string
        try {
          processed[columnName] = parseSQLType(column);
        } catch (error) {
          throw new Error(`Invalid SQL type string for reusable column '${columnName}': ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        // Already a ColumnDefinition object
        processed[columnName] = column;
      }
    }

    return processed;
  }

  /**
   * Process a single table, resolving column inheritance
   */
  private processTable(_tableName: string, table: TableDefinition, _schema: GenLogicSchema, reusableColumns: Record<string, ColumnDefinition>): ProcessedTable {
    const processedColumns: Record<string, ColumnDefinition> = {};

    if (table.columns) {
      for (const [columnName, column] of Object.entries(table.columns)) {
        processedColumns[columnName] = this.resolveColumnInheritance(
          columnName,
          column,
          reusableColumns
        );
      }
    }

    return {
      comment: table.comment,
      columns: processedColumns,
      foreignKeys: table.foreign_keys || {},
      generatedColumns: {}, // Will be populated by FK column generation
      fkColumnMapping: {} // Will be populated by FK column generation
    };
  }

  /**
   * Resolve column inheritance using our mixed syntax:
   * - null: inherit same name
   * - string: SQL type string OR inherit named column
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

    // Case 2: string - SQL type string OR inherit from named reusable column
    if (typeof column === 'string') {
      // Try to detect if it's a SQL type string by checking for common patterns
      // SQL type strings contain: parentheses, spaces, or SQL keywords
      const isSQLType = /[\(\)\s]|^(serial|bigserial|smallserial|varchar|numeric|integer|bigint|smallint|text|date|timestamp|boolean)/i.test(column);

      if (isSQLType) {
        // Parse SQL type string
        try {
          const parsed = parseSQLType(column);
          return { ...parsed };
        } catch (error) {
          throw new Error(`Invalid SQL type string for column '${columnName}': ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        // Treat as reference to reusable column
        const reusableColumn = reusableColumns[column];
        if (!reusableColumn) {
          throw new Error(`Column '${columnName}' references missing reusable column '${column}'`);
        }
        return { ...reusableColumn };
      }
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

      // Apply overrides - complete replacement for each property
      if (refColumn.type !== undefined) {
        // Type override completely replaces the type and all parsed modifiers
        const isSQLType = /[\(\)\s]|^(serial|bigserial|smallserial|varchar|numeric|integer|bigint|smallint|text|date|timestamp|boolean)/i.test(refColumn.type);
        if (isSQLType) {
          // Parse SQL type string and completely replace type definition
          const parsed = parseSQLType(refColumn.type);
          // Clear old type-related fields
          delete merged.size;
          delete merged.decimal;
          delete merged.primary_key;
          delete merged.unique;
          delete merged.not_null;
          delete merged.sequence;
          delete merged.default;
          // Apply new parsed values
          Object.assign(merged, parsed);
        } else {
          merged.type = refColumn.type;
        }
      }
      // Complete replacement for other properties
      if (refColumn.automation !== undefined) merged.automation = refColumn.automation;
      if (refColumn.generated !== undefined) merged.generated = refColumn.generated;
      if (refColumn.comment !== undefined) merged.comment = refColumn.comment;
      if (refColumn['ui-notes'] !== undefined) merged['ui-notes'] = refColumn['ui-notes'];

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
    foreignKeys: Record<string, ForeignKeyDefinition | string>,
    processedSchema: ProcessedSchema
  ): void {

    for (const [fkName, fkDef] of Object.entries(foreignKeys)) {
      // Normalize: if FK is a string, convert to object with table property
      const fk: ForeignKeyDefinition = typeof fkDef === 'string'
        ? { table: fkDef }
        : fkDef;

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
        let fkColumnName: string;

        // Simple FK (no prefix/suffix): use FK name as column name
        // Complex FK (has prefix/suffix): use prefix/suffix pattern
        if (!fk.prefix && !fk.suffix && primaryKeyColumns.length === 1) {
          // Simple single-column FK: FK name IS the column name
          fkColumnName = fkName;
        } else {
          // Complex FK: use traditional prefix/suffix naming
          fkColumnName = this.generateFKColumnName(pkColumn.name, fk);
        }

        // Create FK column with same type as PK column but without PK/sequence flags
        const fkColumnDef: ColumnDefinition = {
          type: pkColumn.definition.type,
          ...(pkColumn.definition.size && { size: pkColumn.definition.size }),
          ...(pkColumn.definition.decimal && { decimal: pkColumn.definition.decimal }),
          primary_key: false, // FK columns are not primary keys
          unique: false,
          sequence: false, // FK columns don't have sequences
          ...(fk.not_null && { not_null: true })
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
  comment?: string;
  columns: Record<string, ColumnDefinition>;
  foreignKeys: Record<string, ForeignKeyDefinition>;
  generatedColumns: Record<string, ColumnDefinition>; // FK columns generated automatically
  fkColumnMapping: Record<string, string[]>; // Maps FK name to generated column names
}