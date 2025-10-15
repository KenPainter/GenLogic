import type {
  GenLogicSchema,
  ColumnDefinition,
  TableColumnDefinition,
  TableDefinition,
  ForeignKeyDefinition,
  MatchingTableDefinition
} from './types.js';
import { parseSQLType } from './sql-type-parser.js';
import { resolveAutomation } from './automation-parser.js';

/**
 * Schema Processing Engine
 *
 * GENLOGIC PRINCIPLE: Resolve inheritance patterns and generate FK columns
 * This processes the mixed inheritance syntax and creates the final resolved schema
 */
export class SchemaProcessor {

  /**
   * Process the entire schema, resolving all inheritance and generating FK columns
   * Tables are processed in layer order to ensure parent columns exist before child FK generation
   */
  processSchema(schema: GenLogicSchema, tableLayers?: Map<string, number>): ProcessedSchema {
    const processed: ProcessedSchema = {
      tables: {}
    };

    // Add matching tables to processed schema (they have a fixed structure)
    if (schema.matching_tables) {
      for (const [tableName, definition] of Object.entries(schema.matching_tables)) {
        processed.tables[tableName] = {
          comment: definition.comment,
          columns: {
            id: {
              type: 'SERIAL',
              primary_key: true,
              unique: false,
              sequence: true
            },
            string_match: {
              type: 'VARCHAR',
              size: 200
            },
            [definition.result_column_name]: {
              type: 'VARCHAR',
              size: 100
            },
            range_low_bound: {
              type: 'NUMERIC',
              size: 10,
              decimal: 2
            },
            range_high_bound: {
              type: 'NUMERIC',
              size: 10,
              decimal: 2
            }
          },
          foreignKeys: {},
          generatedColumns: {},
          fkColumnMapping: {}
        };
      }
    }

    if (!schema.tables) return processed;

    // Preprocess global columns section to parse SQL type strings
    const processedReusableColumns = this.processReusableColumns(schema.columns || {});

    // If table layers provided, process in layer order
    // Otherwise, process in arbitrary order (for backwards compatibility)
    let processingOrder: string[];

    if (tableLayers) {
      // Group tables by layer
      const tablesByLayer = new Map<number, string[]>();
      for (const [tableName, layer] of tableLayers) {
        if (!tablesByLayer.has(layer)) {
          tablesByLayer.set(layer, []);
        }
        tablesByLayer.get(layer)!.push(tableName);
      }

      // Build processing order: layer 0, then 1, then 2, etc.
      processingOrder = [];
      const maxLayer = Math.max(...tableLayers.values());
      for (let layer = 0; layer <= maxLayer; layer++) {
        const tablesInLayer = tablesByLayer.get(layer) || [];
        processingOrder.push(...tablesInLayer);
      }
    } else {
      // No layers provided - use original arbitrary order
      processingOrder = Object.keys(schema.tables);
    }

    // Process each table in order
    for (const tableName of processingOrder) {
      const table = schema.tables[tableName];
      if (!table) continue;

      // Process table columns
      processed.tables[tableName] = this.processTable(tableName, table, schema, processedReusableColumns);

      // Generate FK columns immediately after processing this table
      // This ensures parent PK columns exist when we process child FKs
      if (Object.keys(processed.tables[tableName].foreignKeys).length > 0) {
        this.generateForeignKeyColumns(
          processed.tables[tableName],
          processed.tables[tableName].foreignKeys,
          processed
        );
      }
    }

    // Post-process: Copy label/format/type from source columns for SYNC/SNAPSHOT automations
    this.propagateTypeAndMetadata(processed, schema);

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
        // ColumnDefinition object - check if type field needs parsing
        const colDef = column as ColumnDefinition;

        if (colDef.type) {
          const isSQLType = /[\(\)\s]|^(serial|bigserial|smallserial|varchar|char|numeric|decimal|integer|bigint|smallint|text|date|timestamp|timestamptz|boolean|real|uuid|bit|json|jsonb|double\s+precision)/i.test(colDef.type);
          if (isSQLType) {
            // Parse the SQL type string and merge with other properties
            try {
              const parsed = parseSQLType(colDef.type);
              processed[columnName] = {
                ...parsed,
                ...(colDef.automation && { automation: colDef.automation }),
                ...(colDef.generated && { generated: colDef.generated }),
                ...(colDef.comment && { comment: colDef.comment }),
                ...(colDef.label && { label: colDef.label }),
                ...(colDef.format && { format: colDef.format })
              };
            } catch (error) {
              throw new Error(`Invalid SQL type string for reusable column '${columnName}': ${error instanceof Error ? error.message : String(error)}`);
            }
          } else {
            // Type doesn't look like SQL string, use as-is
            processed[columnName] = column;
          }
        } else {
          // No type field, use as-is
          processed[columnName] = column;
        }
      }
    }

    return processed;
  }

  /**
   * Process a single table, resolving column inheritance
   */
  private processTable(_tableName: string, table: TableDefinition, _schema: GenLogicSchema, reusableColumns: Record<string, ColumnDefinition>): ProcessedTable {
    const processedColumns: Record<string, ColumnDefinition> = {};
    const fkExtensions: Record<string, { automation?: any, generated?: string }> = {};

    if (table.columns) {
      for (const [columnName, column] of Object.entries(table.columns)) {
        // Check if this is an FK extension (automation/generated only on FK column)
        if (typeof column === 'object' && column !== null && !('$ref' in column) && !('type' in column)) {
          // No type field - might be an FK extension OR a SYNC/SNAPSHOT column
          const hasOnlyExtensions = Object.keys(column).every(k =>
            k === 'automation' || k === 'generated' || k === 'comment'
          );

          if (hasOnlyExtensions && (column.automation || column.generated)) {
            // Check if this is a SYNC/SNAPSHOT automation (regular column, needs type inference)
            const isSyncSnapshot = typeof column.automation === 'string' &&
              (column.automation.startsWith('SYNC ') || column.automation.startsWith('SNAPSHOT '));

            if (isSyncSnapshot) {
              // This is a regular column with SYNC/SNAPSHOT automation
              // Add it WITHOUT a type - will be filled in during post-processing
              processedColumns[columnName] = {
                type: '', // Empty placeholder - will be replaced during propagateTypeAndMetadata
                automation: column.automation,
                ...(column.generated && { generated: column.generated }),
                ...(column.comment && { comment: column.comment })
              } as ColumnDefinition;
              continue;
            }

            // Otherwise, it's an FK extension - save it for later
            fkExtensions[columnName] = {
              automation: column.automation,
              generated: column.generated
            };
            continue; // Don't add to processedColumns - it's an FK extension
          }
        }

        // Normal column processing
        processedColumns[columnName] = this.resolveColumnInheritance(
          columnName,
          column,
          reusableColumns
        );
      }
    }

    // Normalize foreign keys (convert string form to object form)
    const normalizedForeignKeys: Record<string, ForeignKeyDefinition> = {};
    if (table.foreign_keys) {
      for (const [fkName, fkDef] of Object.entries(table.foreign_keys)) {
        normalizedForeignKeys[fkName] = typeof fkDef === 'string'
          ? { table: fkDef }
          : fkDef;
      }
    }

    return {
      comment: table.comment,
      columns: processedColumns,
      foreignKeys: normalizedForeignKeys,
      generatedColumns: {}, // Will be populated by FK column generation
      fkColumnMapping: {}, // Will be populated by FK column generation
      fkExtensions // Extensions to be applied to FK columns
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
      const isSQLType = /[\(\)\s]|^(serial|bigserial|smallserial|varchar|char|numeric|decimal|integer|bigint|smallint|text|date|timestamp|timestamptz|boolean|real|uuid|bit|json|jsonb|double\s+precision)/i.test(column);

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
        const isSQLType = /[\(\)\s]|^(serial|bigserial|smallserial|varchar|char|numeric|decimal|integer|bigint|smallint|text|date|timestamp|timestamptz|boolean|real|uuid|bit|json|jsonb|double\s+precision)/i.test(refColumn.type);
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
      if (refColumn.label !== undefined) merged.label = refColumn.label;
      if (refColumn.format !== undefined) merged.format = refColumn.format;

      return merged;
    }

    // Case 4: full column definition - no inheritance
    if (typeof column === 'object' && column !== null) {
      const colDef = column as ColumnDefinition;

      // If type field exists and looks like a SQL type string, parse it
      if (colDef.type) {
        const isSQLType = /[\(\)\s]|^(serial|bigserial|smallserial|varchar|char|numeric|decimal|integer|bigint|smallint|text|date|timestamp|timestamptz|boolean|real|uuid|bit|json|jsonb|double\s+precision)/i.test(colDef.type);
        if (isSQLType) {
          // Parse the SQL type string and merge with other properties
          const parsed = parseSQLType(colDef.type);
          return {
            ...parsed,
            ...(colDef.automation && { automation: colDef.automation }),
            ...(colDef.generated && { generated: colDef.generated }),
            ...(colDef.comment && { comment: colDef.comment }),
            ...(colDef.label && { label: colDef.label }),
            ...(colDef.format && { format: colDef.format })
          };
        }
      }

      // Otherwise, just copy as-is
      return { ...colDef };
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
        // Also copy label and format if they exist on the PK column
        // IMPORTANT: Convert SERIAL types to their underlying integer types for FK columns
        let fkType = pkColumn.definition.type;
        if (fkType.toUpperCase() === 'SERIAL') {
          fkType = 'INTEGER';
        } else if (fkType.toUpperCase() === 'BIGSERIAL') {
          fkType = 'BIGINT';
        } else if (fkType.toUpperCase() === 'SMALLSERIAL') {
          fkType = 'SMALLINT';
        }

        const fkColumnDef: ColumnDefinition = {
          type: fkType,
          ...(pkColumn.definition.size && { size: pkColumn.definition.size }),
          ...(pkColumn.definition.decimal && { decimal: pkColumn.definition.decimal }),
          primary_key: false, // FK columns are not primary keys
          unique: false,
          sequence: false, // FK columns don't have sequences
          ...(fk.not_null && { not_null: true }),
          ...(pkColumn.definition.label && { label: pkColumn.definition.label }),
          ...(pkColumn.definition.format && { format: pkColumn.definition.format })
        };

        // Apply any FK extensions (automation/generated) if they exist
        if (processedTable.fkExtensions && processedTable.fkExtensions[fkColumnName]) {
          const extension = processedTable.fkExtensions[fkColumnName];
          if (extension.automation) {
            fkColumnDef.automation = extension.automation;
          }
          if (extension.generated) {
            fkColumnDef.generated = extension.generated;
          }
        }

        processedTable.generatedColumns[fkColumnName] = fkColumnDef;
        generatedFkColumns.push(fkColumnName);
      }

      // Store the mapping from FK name to generated column names
      processedTable.fkColumnMapping[fkName] = generatedFkColumns;
    }

    // IMPORTANT: Merge all generated FK columns into the main columns object
    // This creates a single authoritative source of ALL columns (explicit + FK-generated)
    for (const [colName, colDef] of Object.entries(processedTable.generatedColumns)) {
      processedTable.columns[colName] = colDef;
    }
    // Clear generatedColumns - everything is now in columns
    processedTable.generatedColumns = {};
  }

  /**
   * Find all primary key columns in a table
   */
  private findPrimaryKeyColumns(table: ProcessedTable): Array<{name: string, definition: ColumnDefinition}> {
    const primaryKeys: Array<{name: string, definition: ColumnDefinition}> = [];

    // Check all columns (FK columns are now merged into columns)
    for (const [columnName, column] of Object.entries(table.columns)) {
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

  /**
   * Propagate type, label, and format from source columns to SYNC/SNAPSHOT automation columns
   * This runs after all tables are processed so we can look up source columns
   */
  private propagateTypeAndMetadata(processedSchema: ProcessedSchema, schema: GenLogicSchema): void {
    for (const [tableName, processedTable] of Object.entries(processedSchema.tables)) {
      for (const [columnName, columnDef] of Object.entries(processedTable.columns)) {
        if (!columnDef.automation) continue;

        // Try to resolve the automation
        let resolved;
        try {
          resolved = resolveAutomation(columnDef.automation, tableName, schema);
        } catch {
          // If we can't resolve it, skip (validation will catch it later)
          continue;
        }

        // Skip non-standard automations
        if ('mode' in resolved) continue;

        // Only handle SYNC/SNAPSHOT
        if (!['SYNC', 'SNAPSHOT'].includes(resolved.type)) continue;

        const sourceTable = resolved.table;
        const sourceColumn = resolved.column;

        // Look up the source column
        const sourceTableProcessed = processedSchema.tables[sourceTable];
        if (!sourceTableProcessed) continue;

        const sourceColumnDef = sourceTableProcessed.columns[sourceColumn];
        if (!sourceColumnDef) continue;

        // Copy type from source column (replace placeholder or missing type)
        if (sourceColumnDef.type) {
          columnDef.type = sourceColumnDef.type;
          // Also copy type-related properties
          if (sourceColumnDef.size !== undefined) columnDef.size = sourceColumnDef.size;
          if (sourceColumnDef.decimal !== undefined) columnDef.decimal = sourceColumnDef.decimal;
        }

        // Copy label and format if they exist on source and not already set on target
        if (sourceColumnDef.label && !columnDef.label) {
          columnDef.label = sourceColumnDef.label;
        }
        if (sourceColumnDef.format && !columnDef.format) {
          columnDef.format = sourceColumnDef.format;
        }
      }
    }
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
  fkExtensions?: Record<string, { automation?: any, generated?: string }>; // Extensions for FK columns
}