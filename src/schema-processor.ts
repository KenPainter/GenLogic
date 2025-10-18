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
 * ARCHITECTURAL PRINCIPLE: Validation Through Construction
 *
 * GenLogic validates by BUILDING the schema in topological order, not by
 * running separate validation passes. This is INTENTIONAL and CRITICAL.
 *
 * HOW IT WORKS:
 * 1. Build FK graph and compute layers (fail fast on cycles)
 * 2. Process tables in layer order (0, 1, 2, ...)
 * 3. When building table at layer N, all layers 0..N-1 are complete
 * 4. Parent columns ALWAYS exist before child references them
 * 5. Validation is: "does this reference exist in already-built schema?"
 *
 * WHY NOT SEPARATE VALIDATION:
 * - Separate validation duplicates the "what exists?" logic
 * - Separate validation can't use topology (needs to check everything)
 * - Adding features requires validation in TWO places (error-prone)
 * - Natural compiler approach: build dependency graph → process in order
 *
 * DO NOT ADD:
 * ❌ validateCrossReferences() before processing
 * ❌ validateGeneratedColumns() after processing
 * ❌ validateAutomations() as separate phase
 * ❌ Any "does X exist?" validation as separate method
 *
 * INSTEAD:
 * ✅ Validate during processSchemaByLayers()
 * ✅ Check references as columns are built
 * ✅ Use processedTables map to know what's available
 * ✅ Throw immediately when reference not found
 *
 * This matches 20 years of manual SQL generation experience:
 * build parents first, then children can safely reference them.
 *
 * ============================================================================
 *
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
          // No type field - might be an FK extension OR a SYNC/SNAPSHOT column OR a generated column
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

            // If it has 'generated' but no 'automation', check if it's an FK extension
            if (column.generated && !column.automation) {
              // Check if this column matches a foreign key name
              const isFKExtension = table.foreign_keys && columnName in table.foreign_keys;

              if (!isFKExtension) {
                // ERROR: Not an FK extension, generated column must have type or $ref
                throw new Error(
                  `Table '${_tableName}', column '${columnName}': ` +
                  `generated columns must specify a type or use $ref to inherit from a reusable column`
                );
              }

              // It's an FK extension with generated expression
              fkExtensions[columnName] = {
                generated: column.generated
              };
              continue; // Don't add to processedColumns - it's an FK extension
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

  // ============================================================================
  // NEW REFACTORED METHODS - Validation Through Construction
  // ============================================================================

  /**
   * Build reusable columns store
   * Creates a Map of resolved reusable columns for use during layer-by-layer processing
   */
  buildReusableColumnsStore(schema: GenLogicSchema): Map<string, ColumnDefinition> {
    const store = new Map<string, ColumnDefinition>();

    if (!schema.columns) return store;

    // Process reusable columns using existing method
    const processed = this.processReusableColumns(schema.columns);

    // Convert to Map
    for (const [name, def] of Object.entries(processed)) {
      store.set(name, def);
    }

    return store;
  }

  /**
   * Process schema layer-by-layer with integrated validation
   *
   * LAYER-BY-LAYER PROCESSING:
   * - Layer 0: Tables with no FKs (no dependencies)
   * - Layer 1: Tables with FKs only to Layer 0
   * - Layer 2: Tables with FKs to Layers 0 or 1
   * - etc.
   *
   * VALIDATION HAPPENS DURING PROCESSING:
   * Each table is built and validated as we process it.
   * By processing in layer order, parent tables are always
   * complete before child tables reference them.
   *
   * NO SEPARATE VALIDATION PASSES NEEDED:
   * - Column references validated as columns built
   * - FK references validated as FK columns generated
   * - Generated column deps validated after all columns defined
   * - Automations validated when table complete
   *
   * This is faster, simpler, and more maintainable than
   * separate validate-then-process approach.
   */
  processSchemaByLayers(
    schema: GenLogicSchema,
    layers: Map<string, number>,
    reusableColumns: Map<string, ColumnDefinition>
  ): ProcessedSchema {
    const processedTables = new Map<string, ProcessedTable>();
    const processed: ProcessedSchema = { tables: {} };

    // Add matching tables to processed schema (they have a fixed structure)
    if (schema.matching_tables) {
      for (const [tableName, definition] of Object.entries(schema.matching_tables)) {
        const matchingTable: ProcessedTable = {
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
        processedTables.set(tableName, matchingTable);
        processed.tables[tableName] = matchingTable;
      }
    }

    if (!schema.tables) return processed;

    const maxLayer = Math.max(...layers.values());

    // Process tables layer by layer
    for (let layer = 0; layer <= maxLayer; layer++) {
      const tablesInLayer = [...layers.entries()]
        .filter(([_, l]) => l === layer)
        .map(([name, _]) => name);

      for (const tableName of tablesInLayer) {
        const table = schema.tables[tableName];
        if (!table) continue;

        // Build columns for this table WITH INTEGRATED VALIDATION
        const processedTable = this.processTableWithValidation(
          tableName,
          table,
          schema,
          reusableColumns,
          processedTables
        );

        processedTables.set(tableName, processedTable);
        processed.tables[tableName] = processedTable;
      }
    }

    // Post-process: Copy label/format/type from source columns for SYNC/SNAPSHOT automations
    this.propagateTypeAndMetadata(processed, schema);

    return processed;
  }

  /**
   * Process a single table with integrated validation
   * This is the NEW method that validates as it builds
   */
  private processTableWithValidation(
    tableName: string,
    table: TableDefinition,
    schema: GenLogicSchema,
    reusableColumns: Map<string, ColumnDefinition>,
    processedTables: Map<string, ProcessedTable>
  ): ProcessedTable {
    // Validate table name is not a reserved word
    this.validateNotReservedWord(tableName, 'table');

    const columns = new Map<string, ColumnDefinition>();
    const fkExtensions: Record<string, { automation?: any, generated?: string }> = {};

    // Step 1: Resolve column inheritance
    if (table.columns) {
      for (const [columnName, column] of Object.entries(table.columns)) {
        // Validate column name is not a reserved word
        this.validateNotReservedWord(columnName, 'column');

        // Check if this is an FK extension (automation/generated only on FK column)
        if (typeof column === 'object' && column !== null && !('$ref' in column) && !('type' in column)) {
          const hasOnlyExtensions = Object.keys(column).every(k =>
            k === 'automation' || k === 'generated' || k === 'comment'
          );

          if (hasOnlyExtensions && (column.automation || column.generated)) {
            // Check if this is a SYNC/SNAPSHOT automation (regular column, needs type inference)
            const isSyncSnapshot = typeof column.automation === 'string' &&
              (column.automation.startsWith('SYNC ') || column.automation.startsWith('SNAPSHOT '));

            if (isSyncSnapshot) {
              // This is a regular column with SYNC/SNAPSHOT automation
              columns.set(columnName, {
                type: '', // Empty placeholder
                automation: column.automation,
                ...(column.generated && { generated: column.generated }),
                ...(column.comment && { comment: column.comment })
              } as ColumnDefinition);
              continue;
            }

            // If it has 'generated' but no 'automation', check if it's an FK extension
            if (column.generated && !column.automation) {
              // Check if this column matches a foreign key name
              const isFKExtension = table.foreign_keys && columnName in table.foreign_keys;

              if (!isFKExtension) {
                // ERROR: Not an FK extension, generated column must have type or $ref
                throw new Error(
                  `Table '${tableName}', column '${columnName}': ` +
                  `generated columns must specify a type or use $ref to inherit from a reusable column`
                );
              }

              // It's an FK extension with generated expression
              fkExtensions[columnName] = {
                generated: column.generated
              };
              continue;
            }

            // Otherwise, it's an FK extension
            fkExtensions[columnName] = {
              automation: column.automation,
              generated: column.generated
            };
            continue;
          }
        }

        // Normal column processing - resolve inheritance
        const reusableColsRecord: Record<string, ColumnDefinition> = {};
        for (const [name, def] of reusableColumns) {
          reusableColsRecord[name] = def;
        }

        const resolved = this.resolveColumnInheritance(columnName, column, reusableColsRecord);
        columns.set(columnName, resolved);
      }
    }

    // Normalize foreign keys
    const normalizedForeignKeys: Record<string, ForeignKeyDefinition> = {};
    if (table.foreign_keys) {
      for (const [fkName, fkDef] of Object.entries(table.foreign_keys)) {
        normalizedForeignKeys[fkName] = typeof fkDef === 'string'
          ? { table: fkDef }
          : fkDef;
      }

    }

    // Step 2: Generate FK columns (parent tables already processed)
    const generatedColumns = new Map<string, ColumnDefinition>();
    const fkColumnMapping: Record<string, string[]> = {};

    for (const [fkName, fk] of Object.entries(normalizedForeignKeys)) {
      // Special case: self-referential FK (e.g., employees.manager_id → employees.id)
      // The parent table is the current table being processed
      let parentTable: ProcessedTable;
      if (fk.table === tableName) {
        // Self-referential FK - use current table's columns
        parentTable = {
          comment: table.comment,
          columns: Object.fromEntries(columns),
          foreignKeys: normalizedForeignKeys,
          generatedColumns: {},
          fkColumnMapping: {}
        };
      } else {
        // Normal FK - parent must already be processed
        const pt = processedTables.get(fk.table);
        if (!pt) {
          // Check if the table exists in the schema at all
          if (!schema.tables || !schema.tables[fk.table]) {
            throw new Error(
              `Table '${tableName}', FK '${fkName}': ` +
              `parent table '${fk.table}' does not exist in schema`
            );
          }
          // Table exists but not yet processed - layer calculation error
          throw new Error(
            `Table '${tableName}', FK '${fkName}': ` +
            `parent table '${fk.table}' not yet processed ` +
            `(this indicates layer calculation error)`
          );
        }
        parentTable = pt;
      }

      const primaryKeyColumns = this.findPrimaryKeyColumnsFromMap(parentTable);
      if (primaryKeyColumns.length === 0) {
        throw new Error(`Table '${tableName}', FK '${fkName}': parent table '${fk.table}' has no primary key columns`);
      }

      const generatedFkColumns: string[] = [];

      for (const pkColumn of primaryKeyColumns) {
        let fkColumnName: string;

        if (!fk.prefix && !fk.suffix && primaryKeyColumns.length === 1) {
          fkColumnName = fkName;
        } else {
          fkColumnName = this.generateFKColumnName(pkColumn.name, fk);
        }

        // Convert SERIAL types to underlying integer types
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
          primary_key: false,
          unique: false,
          sequence: false,
          ...(fk.not_null && { not_null: true }),
          ...(pkColumn.definition.label && { label: pkColumn.definition.label }),
          ...(pkColumn.definition.format && { format: pkColumn.definition.format })
        };

        // Apply FK extensions
        if (fkExtensions[fkColumnName]) {
          const extension = fkExtensions[fkColumnName];
          if (extension.automation) {
            fkColumnDef.automation = extension.automation;
          }
          if (extension.generated) {
            fkColumnDef.generated = extension.generated;
          }
        }

        generatedColumns.set(fkColumnName, fkColumnDef);
        generatedFkColumns.push(fkColumnName);
      }

      fkColumnMapping[fkName] = generatedFkColumns;
    }

    // Merge FK columns into main columns map
    for (const [colName, colDef] of generatedColumns) {
      columns.set(colName, colDef);
    }

    // Step 3: Validate generated columns (dependencies must exist in THIS table)
    for (const [colName, col] of columns) {
      if (col.generated) {
        this.validateGeneratedColumn(tableName, colName, col, columns);
      }
    }

    // Step 4: Validate automations (FK and columns must exist)
    for (const [colName, col] of columns) {
      if (col.automation) {
        this.validateAutomationColumn(
          tableName,
          colName,
          col,
          table,
          schema,
          processedTables
        );
      }
    }

    // Step 5: Validate auto_create (all referenced columns must exist)
    if (table.foreign_keys) {
      for (const [fkName, fkDef] of Object.entries(table.foreign_keys)) {
        const fk = typeof fkDef === 'string' ? { table: fkDef } : fkDef;
        if (fk.auto_create) {
          this.validateAutoCreateDefinition(
            tableName,
            fkName,
            fk,
            columns,
            processedTables
          );
        }

        // Validate auto_create_parent (parent must have PK)
        if (fk.auto_create_parent) {
          const parentTable = processedTables.get(fk.table);
          if (!parentTable) {
            throw new Error(
              `Table '${tableName}', FK '${fkName}': ` +
              `auto_create_parent references parent table '${fk.table}' which is not yet processed`
            );
          }
          const parentPK = this.findPrimaryKeyColumnsFromMap(parentTable);
          if (parentPK.length === 0) {
            throw new Error(
              `Table '${tableName}', FK '${fkName}': ` +
              `auto_create_parent requires parent table '${fk.table}' to have a primary key`
            );
          }
        }
      }
    }

    // Step 6: Validate indexes and constraints (columns must exist)
    this.validateTableIndexesAndConstraints(tableName, table, columns);

    // Convert Map to Record for return type
    const columnsRecord: Record<string, ColumnDefinition> = {};
    for (const [name, def] of columns) {
      columnsRecord[name] = def;
    }

    return {
      comment: table.comment,
      columns: columnsRecord,
      foreignKeys: normalizedForeignKeys,
      generatedColumns: {},
      fkColumnMapping,
      fkExtensions
    };
  }

  /**
   * Helper: Find primary key columns from a table (Map version)
   */
  private findPrimaryKeyColumnsFromMap(table: ProcessedTable): Array<{name: string, definition: ColumnDefinition}> {
    const primaryKeys: Array<{name: string, definition: ColumnDefinition}> = [];

    for (const [columnName, column] of Object.entries(table.columns)) {
      if (column.primary_key) {
        primaryKeys.push({ name: columnName, definition: column });
      }
    }

    return primaryKeys;
  }

  /**
   * Validate a generated column's references
   */
  private validateGeneratedColumn(
    tableName: string,
    columnName: string,
    columnDef: ColumnDefinition,
    allColumns: Map<string, ColumnDefinition>
  ): void {
    const generatedExpr = columnDef.generated!;

    // Extract @column_name references
    const atMatches = generatedExpr.match(/@(\w+)/g) || [];
    const referencedCols = atMatches.map(m => m.substring(1));

    // Require at least one @ reference
    if (atMatches.length === 0) {
      throw new Error(
        `Table '${tableName}', column '${columnName}': ` +
        `generated expression must reference at least one column using '@column_name' syntax`
      );
    }

    // Validate each referenced column exists
    for (const refCol of referencedCols) {
      if (!allColumns.has(refCol)) {
        throw new Error(
          `Table '${tableName}', column '${columnName}': ` +
          `generated expression references non-existent column '@${refCol}'`
        );
      }
    }

    // Check for bare identifiers that match column names
    const allIdentifiers = generatedExpr.match(/(?<!@)\b([a-z_][a-z0-9_]*)\b/gi) || [];

    const sqlKeywords = new Set([
      'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AND', 'OR', 'NOT', 'NULL',
      'TRUE', 'FALSE', 'IS', 'IN', 'LIKE', 'BETWEEN', 'EXISTS',
      'COALESCE', 'NULLIF', 'CAST', 'EXTRACT', 'SUBSTRING', 'TRIM',
      'UPPER', 'LOWER', 'LENGTH', 'CONCAT', 'REPLACE',
      'SUM', 'COUNT', 'AVG', 'MAX', 'MIN', 'ABS', 'ROUND', 'CEIL', 'FLOOR',
      'GREATEST', 'LEAST', 'DATE', 'TIME', 'TIMESTAMP', 'INTERVAL'
    ]);

    const bareColumnRefs: string[] = [];
    for (const id of allIdentifiers) {
      if (sqlKeywords.has(id.toUpperCase())) {
        continue;
      }
      if (allColumns.has(id)) {
        bareColumnRefs.push(id);
      }
    }

    if (bareColumnRefs.length > 0) {
      throw new Error(
        `Table '${tableName}', column '${columnName}': ` +
        `generated expression contains bare column reference(s) without '@' sigil: ${bareColumnRefs.join(', ')}. ` +
        `Use '@column_name' syntax for all column references.`
      );
    }
  }

  /**
   * Validate an automation column
   */
  private validateAutomationColumn(
    tableName: string,
    columnName: string,
    columnDef: ColumnDefinition,
    table: TableDefinition,
    schema: GenLogicSchema,
    processedTables: Map<string, ProcessedTable>
  ): void {
    // Automation validation is handled by the existing validation phase
    // This is a placeholder for now - we can add inline validation here if needed
    // The main validation happens in validateAutomationInference which checks FK inference
  }

  /**
   * Validate auto_create definition
   */
  private validateAutoCreateDefinition(
    tableName: string,
    fkName: string,
    fk: ForeignKeyDefinition,
    childColumns: Map<string, ColumnDefinition>,
    processedTables: Map<string, ProcessedTable>
  ): void {
    const ac = fk.auto_create!;
    const parentTable = processedTables.get(fk.table);

    if (!parentTable) {
      throw new Error(`Table '${tableName}', FK '${fkName}': auto_create references parent table '${fk.table}' which is not yet processed`);
    }

    const parentColumns = new Set(Object.keys(parentTable.columns));

    // Validate spread columns
    if (ac.spread) {
      if (!parentColumns.has(ac.spread.start)) {
        throw new Error(`Table '${tableName}', FK '${fkName}': auto_create.spread.start '${ac.spread.start}' does not exist in parent table '${fk.table}'`);
      }
      if (!parentColumns.has(ac.spread.end)) {
        throw new Error(`Table '${tableName}', FK '${fkName}': auto_create.spread.end '${ac.spread.end}' does not exist in parent table '${fk.table}'`);
      }
      if (!parentColumns.has(ac.spread.interval)) {
        throw new Error(`Table '${tableName}', FK '${fkName}': auto_create.spread.interval '${ac.spread.interval}' does not exist in parent table '${fk.table}'`);
      }
      if (!childColumns.has(ac.spread.generated_column)) {
        throw new Error(`Table '${tableName}', FK '${fkName}': auto_create.spread.generated_column '${ac.spread.generated_column}' does not exist in child table`);
      }
    }

    // Validate copy_columns
    if (ac.copy_columns) {
      for (const [parentCol, childCol] of Object.entries(ac.copy_columns)) {
        if (!parentColumns.has(parentCol)) {
          throw new Error(`Table '${tableName}', FK '${fkName}': auto_create.copy_columns parent column '${parentCol}' does not exist in parent table '${fk.table}'`);
        }
        if (!childColumns.has(childCol)) {
          throw new Error(`Table '${tableName}', FK '${fkName}': auto_create.copy_columns child column '${childCol}' does not exist in child table`);
        }
      }
    }

    // Validate literals
    if (ac.literals) {
      for (const childCol of Object.keys(ac.literals)) {
        if (!childColumns.has(childCol)) {
          throw new Error(`Table '${tableName}', FK '${fkName}': auto_create.literals child column '${childCol}' does not exist in child table`);
        }
      }
    }
  }

  /**
   * Validate indexes and unique constraints
   */
  private validateTableIndexesAndConstraints(
    tableName: string,
    table: TableDefinition,
    columns: Map<string, ColumnDefinition>
  ): void {
    // Validate unique_constraints
    if (table.unique_constraints) {
      for (let i = 0; i < table.unique_constraints.length; i++) {
        const constraintCols = table.unique_constraints[i];

        if (constraintCols.length === 0) {
          throw new Error(`Table '${tableName}', unique_constraints[${i}]: constraint must have at least one column`);
        }

        for (const colName of constraintCols) {
          if (!columns.has(colName)) {
            throw new Error(`Table '${tableName}', unique_constraints[${i}]: column '${colName}' does not exist`);
          }
        }
      }
    }

    // Validate indexes
    if (table.indexes) {
      for (let i = 0; i < table.indexes.length; i++) {
        const indexCols = table.indexes[i];

        if (indexCols.length === 0) {
          throw new Error(`Table '${tableName}', indexes[${i}]: index must have at least one column`);
        }

        for (const colName of indexCols) {
          if (!columns.has(colName)) {
            throw new Error(`Table '${tableName}', indexes[${i}]: column '${colName}' does not exist`);
          }
        }
      }
    }
  }

  /**
   * Validate that a name is not a PostgreSQL reserved word
   */
  private validateNotReservedWord(name: string, type: 'table' | 'column'): void {
    // PostgreSQL reserved words that cannot be used as identifiers
    const reservedWords = new Set([
      'ALL', 'ANALYSE', 'ANALYZE', 'AND', 'ANY', 'ARRAY', 'AS', 'ASC',
      'ASYMMETRIC', 'BOTH', 'CASE', 'CAST', 'CHECK', 'COLLATE', 'COLUMN',
      'CONSTRAINT', 'CREATE', 'CURRENT_CATALOG', 'CURRENT_DATE',
      'CURRENT_ROLE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP', 'CURRENT_USER',
      'DEFAULT', 'DEFERRABLE', 'DESC', 'DISTINCT', 'DO', 'ELSE', 'END',
      'EXCEPT', 'FALSE', 'FETCH', 'FOR', 'FOREIGN', 'FROM', 'GRANT',
      'GROUP', 'HAVING', 'IN', 'INITIALLY', 'INTERSECT', 'INTO', 'LATERAL',
      'LEADING', 'LIMIT', 'LOCALTIME', 'LOCALTIMESTAMP', 'NOT', 'NULL',
      'OFFSET', 'ON', 'ONLY', 'OR', 'ORDER', 'PLACING', 'PRIMARY',
      'REFERENCES', 'RETURNING', 'SELECT', 'SESSION_USER', 'SOME',
      'SYMMETRIC', 'TABLE', 'THEN', 'TO', 'TRAILING', 'TRUE', 'UNION',
      'UNIQUE', 'USER', 'USING', 'VARIADIC', 'WHEN', 'WHERE', 'WINDOW', 'WITH'
    ]);

    if (reservedWords.has(name.toUpperCase())) {
      throw new Error(
        `${type === 'table' ? 'Table' : 'Column'} name '${name}' is a PostgreSQL reserved word and cannot be used`
      );
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