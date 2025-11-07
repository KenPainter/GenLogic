import type {
  GenLogicSchema,
  ColumnDefinition,
  TableColumnDefinition,
  TableDefinition,
  ForeignKeyDefinition,
  MatchingTableDefinition
} from './types.js';
import type {
  YamlFlattenedLists,
  FlattenedTable,
  FlattenedColumn,
  FlattenedForeignKey,
  FlattenedReusableColumn
} from './yaml-flattened-lists.js';
import { parseSQLType } from './sql-type-parser.js';
import { resolveAutomation } from './automation-parser.js';

/**
 * ARCHITECTURAL PRINCIPLE: Validation Through Construction
 *
 * GenLogic validates by BUILDING and VALIDATING together
 * The main logic and comments are in processor.ts
 *
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
   * Preprocess reusable columns section to parse SQL definition strings
   */
  private processReusableColumns(reusableColumns: Record<string, ColumnDefinition | string>): Record<string, ColumnDefinition> {
    const processed: Record<string, ColumnDefinition> = {};

    for (const [columnName, column] of Object.entries(reusableColumns)) {
      if (typeof column === 'string') {
        // Parse SQL definition string
        try {
          processed[columnName] = parseSQLType(column);
        } catch (error) {
          throw new Error(`Invalid SQL definition string for reusable column '${columnName}': ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        // ColumnDefinition object - check if type field needs parsing
        const colDef = column as ColumnDefinition;

        if (colDef.definition) {
          const isSQLType = /[\(\)\s]|^(serial|bigserial|smallserial|varchar|char|numeric|decimal|integer|bigint|smallint|text|date|timestamp|timestamptz|boolean|real|uuid|bit|json|jsonb|double\s+precision)/i.test(colDef.definition);
          if (isSQLType) {
            // Parse the SQL definition string and merge with other properties
            try {
              const parsed = parseSQLType(colDef.definition);
              processed[columnName] = {
                ...parsed,
                ...(colDef.automation && { automation: colDef.automation }),
                ...(colDef.formula && { formula: colDef.formula }),
                ...(colDef.comment && { comment: colDef.comment }),
                ...(colDef.label && { label: colDef.label }),
                ...(colDef.format && { format: colDef.format })
              };
            } catch (error) {
              throw new Error(`Invalid SQL definition string for reusable column '${columnName}': ${error instanceof Error ? error.message : String(error)}`);
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
   * Resolve column inheritance using our mixed syntax:
   * - null: inherit same name
   * - string: SQL definition string OR inherit named column
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

    // Case 2: string - SQL definition string OR inherit from named reusable column
    if (typeof column === 'string') {
      // Try to detect if it's a SQL definition string by checking for common patterns
      // SQL definition strings contain: parentheses, spaces, or SQL keywords
      const isSQLType = /[\(\)\s]|^(serial|bigserial|smallserial|varchar|char|numeric|decimal|integer|bigint|smallint|text|date|timestamp|timestamptz|boolean|real|uuid|bit|json|jsonb|double\s+precision)/i.test(column);

      if (isSQLType) {
        // Parse SQL definition string
        try {
          const parsed = parseSQLType(column);
          return { ...parsed };
        } catch (error) {
          throw new Error(`Invalid SQL definition string for column '${columnName}': ${error instanceof Error ? error.message : String(error)}`);
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
      if (refColumn.definition !== undefined) {
        // Definition override completely replaces the definition and all parsed modifiers
        const isSQLType = /[\(\)\s]|^(serial|bigserial|smallserial|varchar|char|numeric|decimal|integer|bigint|smallint|text|date|timestamp|timestamptz|boolean|real|uuid|bit|json|jsonb|double\s+precision)/i.test(refColumn.definition);
        if (isSQLType) {
          // Parse SQL definition string and completely replace definition
          const parsed = parseSQLType(refColumn.definition);
          // Clear old definition-related fields
          delete merged.size;
          delete merged.decimal;
          delete merged.primary_key;
          delete merged.unique;
          delete merged["not-null"];
          delete merged.sequence;
          delete merged.default;
          // Apply new parsed values
          Object.assign(merged, parsed);
        } else {
          merged.definition = refColumn.definition;
        }
      }
      // Complete replacement for other properties
      if (refColumn.automation !== undefined) merged.automation = refColumn.automation;
      if (refColumn.formula !== undefined) merged.formula = refColumn.formula;
      if (refColumn.comment !== undefined) merged.comment = refColumn.comment;
      if (refColumn.label !== undefined) merged.label = refColumn.label;
      if (refColumn.format !== undefined) merged.format = refColumn.format;

      // VALIDATION: Mutual exclusion - cannot have both automation and formula
      if (merged.automation && merged.formula) {
        throw new Error(
          `Column '${columnName}': cannot have both 'automation' and 'formula' properties`
        );
      }

      return merged;
    }

    // Case 4: full column definition - no inheritance
    if (typeof column === 'object' && column !== null) {
      const colDef = column as ColumnDefinition;

      // If definition field exists and looks like a SQL definition string, parse it
      if (colDef.definition) {
        const isSQLType = /[\(\)\s]|^(serial|bigserial|smallserial|varchar|char|numeric|decimal|integer|bigint|smallint|text|date|timestamp|timestamptz|boolean|real|uuid|bit|json|jsonb|double\s+precision)/i.test(colDef.definition);
        if (isSQLType) {
          // Parse the SQL definition string and merge with other properties
          const parsed = parseSQLType(colDef.definition);

          // VALIDATION: Mutual exclusion - cannot have both automation and formula
          if (colDef.automation && colDef.formula) {
            throw new Error(
              `Column '${columnName}': cannot have both 'automation' and 'formula' properties`
            );
          }

          return {
            ...parsed,
            ...(colDef.automation && { automation: colDef.automation }),
            ...(colDef.formula && { formula: colDef.formula }),
            ...(colDef.comment && { comment: colDef.comment }),
            ...(colDef.label && { label: colDef.label }),
            ...(colDef.format && { format: colDef.format })
          };
        }
      }

      // VALIDATION: Mutual exclusion for non-parsed definitions
      const colDefAny = column as any;
      if (colDefAny.automation && colDefAny.formula) {
        throw new Error(
          `Column '${columnName}': cannot have both 'automation' and 'formula' properties`
        );
      }

      // Otherwise, just copy as-is
      return { ...colDef };
    }

    throw new Error(`Invalid column definition for '${columnName}'`);
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
   * Now works from flat FK list instead of GenLogicSchema
   */
  private propagateTypeAndMetadata(
    processedSchema: ProcessedSchema,
    fksByTable: Map<string, FlattenedForeignKey[]>
  ): void {
    // Build minimal schema for resolveAutomation's inferForeignKey
    // inferForeignKey only needs schema.tables[]["foreign-keys"]
    const minimalSchema: GenLogicSchema = {
      tables: {}
    };

    for (const [tableName, fks] of fksByTable) {
      minimalSchema.tables![tableName] = {
        "foreign-keys": {}
      };

      for (const fk of fks) {
        // Use parent table name as FK name (for inference)
        minimalSchema.tables![tableName]["foreign-keys"]![fk.parentTable] = { table: fk.parentTable };
      }
    }

    for (const [tableName, processedTable] of Object.entries(processedSchema.tables)) {
      for (const [columnName, columnDef] of Object.entries(processedTable.columns)) {
        if (!columnDef.automation) continue;

        // Try to resolve the automation
        let resolved;
        try {
          resolved = resolveAutomation(columnDef.automation, tableName, minimalSchema);
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
    yamlFlattenedLists: YamlFlattenedLists,
    layers: Map<string, number>
  ): ProcessedSchema {
    const processedTables = new Map<string, ProcessedTable>();
    const processed: ProcessedSchema = { tables: {} };

    // Build lookup structures from flat lists
    const tableMap = new Map<string, FlattenedTable>();
    for (const table of yamlFlattenedLists.tables) {
      tableMap.set(table.name, table);
    }

    const columnsByTable = new Map<string, FlattenedColumn[]>();
    for (const col of yamlFlattenedLists.columns) {
      if (!columnsByTable.has(col.tableName)) {
        columnsByTable.set(col.tableName, []);
      }
      columnsByTable.get(col.tableName)!.push(col);
    }

    const fksByTable = new Map<string, FlattenedForeignKey[]>();
    for (const fk of yamlFlattenedLists.foreignKeys) {
      if (!fksByTable.has(fk.childTable)) {
        fksByTable.set(fk.childTable, []);
      }
      fksByTable.get(fk.childTable)!.push(fk);
    }

    const reusableColumnsMap = new Map<string, FlattenedReusableColumn>();
    for (const col of yamlFlattenedLists.reusableColumns) {
      reusableColumnsMap.set(col.name, col);
    }

    if (yamlFlattenedLists.tables.length === 0) return processed;

    const maxLayer = Math.max(...layers.values());

    // Process tables layer by layer
    for (let layer = 0; layer <= maxLayer; layer++) {
      const tablesInLayer = [...layers.entries()]
        .filter(([_, l]) => l === layer)
        .map(([name, _]) => name);

      for (const tableName of tablesInLayer) {
        const tableMetadata = tableMap.get(tableName);
        if (!tableMetadata) continue;

        const tableCols = columnsByTable.get(tableName) || [];
        const tableFKs = fksByTable.get(tableName) || [];

        // Build columns for this table WITH INTEGRATED VALIDATION
        const processedTable = this.processTableWithValidation(
          tableName,
          tableMetadata,
          tableCols,
          tableFKs,
          reusableColumnsMap,
          fksByTable,
          processedTables,
          layer  // Pass current layer number
        );

        processedTables.set(tableName, processedTable);
        processed.tables[tableName] = processedTable;
      }
    }

    // Post-process: Copy label/format/type from source columns for SYNC/SNAPSHOT automations
    this.propagateTypeAndMetadata(processed, fksByTable);

    return processed;
  }

  /**
   * Build reverse FK index: add inboundForeignKeys to each parent table
   * This allows parent tables to know which child tables have FKs pointing to them
   * Essential for automation validation where parent tables aggregate from children
   */
  addInboundForeignKeysToProcessedSchema(processedSchema: ProcessedSchema): void {
    // First pass: collect all FK relationships
    const inboundFKs = new Map<string, Array<{
      childTable: string;
      fkName: string;
      childColumn: string;
    }>>();

    // Iterate through all tables as children
    for (const [childTableName, childTable] of Object.entries(processedSchema.tables)) {
      // Look at this table's outbound FKs
      for (const [fkName, fk] of Object.entries(childTable.foreignKeys)) {
        const parentTableName = fk.table;

        // Add to parent's inbound FK list
        if (!inboundFKs.has(parentTableName)) {
          inboundFKs.set(parentTableName, []);
        }

        inboundFKs.get(parentTableName)!.push({
          childTable: childTableName,
          fkName: fkName,
          childColumn: fk.column
        });
      }

      // Also check FK extensions (formula columns that act as FKs)
      if (childTable.fkExtensions) {
        for (const [extensionName, extension] of Object.entries(childTable.fkExtensions)) {
          // FK extensions reference the same parent table as their base FK
          // We need to determine which parent table this extension points to
          // Extensions are named after the FK column, so we look for a matching FK

          // Find the FK that this extension belongs to by checking foreignKeys
          for (const [fkName, fk] of Object.entries(childTable.foreignKeys)) {
            // Check if this extension column name matches or relates to this FK
            // Extensions like "account_id_debit" relate to FK "accounts"
            const parentTableName = fk.table;

            if (!inboundFKs.has(parentTableName)) {
              inboundFKs.set(parentTableName, []);
            }

            inboundFKs.get(parentTableName)!.push({
              childTable: childTableName,
              fkName: extensionName,
              childColumn: extensionName
            });
          }
        }
      }
    }

    // Second pass: add inboundForeignKeys to each parent table
    for (const [parentTableName, inboundList] of inboundFKs) {
      const parentTable = processedSchema.tables[parentTableName];
      if (parentTable) {
        parentTable.inboundForeignKeys = inboundList;
      }
    }
  }

  /**
   * Copy seed rows from flattened lists to processedSchema WITH VALIDATION
   * Validates that all columns in seed data exist in the table
   */
  addSeedRowsToProcessedSchema(
    yamlFlattenedLists: YamlFlattenedLists,
    processedSchema: ProcessedSchema
  ): void {
    for (const seedRow of yamlFlattenedLists.seedRows) {
      const tableName = seedRow.tableName;
      const table = processedSchema.tables[tableName];

      if (!table) {
        throw new Error(`Seed row references non-existent table '${tableName}'`);
      }

      // Validate: all columns in seed data must exist in table
      for (const columnName of Object.keys(seedRow.data)) {
        if (!table.columns[columnName]) {
          throw new Error(
            `Seed row for table '${tableName}' references non-existent column '${columnName}'`
          );
        }
      }

      // Initialize seedRows array if needed
      if (!table.seedRows) {
        table.seedRows = [];
      }

      // Add the seed row data
      table.seedRows.push(seedRow.data);
    }
  }

  /**
   * Add indexes from flattened lists to processedSchema with validation
   */
  addIndexesToProcessedSchema(
    yamlFlattenedLists: YamlFlattenedLists,
    processedSchema: ProcessedSchema
  ): void {
    for (const index of yamlFlattenedLists.indexes) {
      const table = processedSchema.tables[index.tableName];
      if (!table) {
        throw new Error(`Index references non-existent table '${index.tableName}'`);
      }

      // Validate all columns exist
      for (const colName of index.columns) {
        if (!table.columns[colName]) {
          throw new Error(`Index on table '${index.tableName}' references non-existent column '${colName}'`);
        }
      }

      // Add index to table
      if (!table.indexes) {
        table.indexes = [];
      }
      table.indexes.push(index.columns);
    }
  }

  /**
   * Add unique constraints from flattened lists to processedSchema with validation
   */
  addUniqueConstraintsToProcessedSchema(
    yamlFlattenedLists: YamlFlattenedLists,
    processedSchema: ProcessedSchema
  ): void {
    for (const constraint of yamlFlattenedLists.uniqueConstraints) {
      const table = processedSchema.tables[constraint.tableName];
      if (!table) {
        throw new Error(`Unique constraint references non-existent table '${constraint.tableName}'`);
      }

      // Validate all columns exist
      for (const colName of constraint.columns) {
        if (!table.columns[colName]) {
          throw new Error(`Unique constraint on table '${constraint.tableName}' references non-existent column '${colName}'`);
        }
      }

      // Add unique constraint to table
      if (!table.uniqueConstraints) {
        table.uniqueConstraints = [];
      }
      table.uniqueConstraints.push(constraint.columns);
    }
  }

  /**
   * Add CHECK constraints from flattened lists to processedSchema with validation
   */
  addCheckConstraintsToProcessedSchema(
    yamlFlattenedLists: YamlFlattenedLists,
    processedSchema: ProcessedSchema
  ): void {
    for (const checkConstraint of yamlFlattenedLists.checkConstraints) {
      const table = processedSchema.tables[checkConstraint.tableName];
      if (!table) {
        throw new Error(`CHECK constraint references non-existent table '${checkConstraint.tableName}'`);
      }

      // Validate all @column_name references exist
      const columnRefs = checkConstraint.expression.match(/@[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
      for (const ref of columnRefs) {
        const colName = ref.substring(1); // Remove @ prefix
        if (!table.columns[colName]) {
          throw new Error(
            `CHECK constraint on table '${checkConstraint.tableName}' references non-existent column '${colName}' in expression: ${checkConstraint.expression}`
          );
        }
      }

      // Strip @ sigils before storing in processedSchema
      const expressionWithoutSigils = checkConstraint.expression.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, '$1');

      // Add CHECK constraint to table
      if (!table.constraints) {
        table.constraints = [];
      }
      table.constraints.push(expressionWithoutSigils);
    }
  }

  /**
   * Validate automation definitions using processedSchema
   * Uses inboundForeignKeys for FK validation and direct lookups for column validation
   */
  validateAutomations(processedSchema: ProcessedSchema): void {
    for (const [tableName, table] of Object.entries(processedSchema.tables)) {
      for (const [columnName, column] of Object.entries(table.columns)) {
        if (!column.automation) continue;

        // Parse automation string
        let automation;
        if (typeof column.automation === 'string') {
          try {
            automation = resolveAutomation(column.automation, tableName, this.buildMinimalSchemaForAutomation(processedSchema));
          } catch (err: any) {
            throw new Error(
              `Table '${tableName}', column '${columnName}': failed to parse automation: ${err.message}`
            );
          }
        } else {
          automation = column.automation;
        }

        // Skip RULE_MATCH automations - they don't use FK references
        if ('mode' in automation) {
          continue;
        }

        // Determine if this is aggregation or SYNC/SNAPSHOT
        const isAggregation = ['SUM', 'COUNT', 'MAX', 'MIN', 'LAST_VALUE'].includes(automation.type);

        if (isAggregation) {
          // Aggregation: this table (parent) aggregates from child table
          this.validateAggregationAutomation(tableName, columnName, automation, table, processedSchema);
        } else {
          // SYNC/SNAPSHOT: this table (child) syncs from parent table
          this.validateSyncAutomation(tableName, columnName, automation, table, processedSchema);
        }

        // After validation, store the parsed automation object (with stripped @ sigils) back into column
        column.automation = automation;
      }
    }
  }

  /**
   * Validate aggregation automation (SUM, COUNT, MAX, MIN, LAST_VALUE)
   * Parent table aggregates from child table
   */
  private validateAggregationAutomation(
    parentTableName: string,
    columnName: string,
    automation: any,
    parentTable: ProcessedTable,
    processedSchema: ProcessedSchema
  ): void {
    const childTableName = automation.table;
    const sourceColumn = automation.column;
    const explicitFKName = automation.foreign_key;

    // Validate child table exists
    const childTable = processedSchema.tables[childTableName];
    if (!childTable) {
      throw new Error(
        `Table '${parentTableName}', column '${columnName}': automation references non-existent table '${childTableName}'`
      );
    }

    // Validate FK exists using inboundForeignKeys
    if (!parentTable.inboundForeignKeys || parentTable.inboundForeignKeys.length === 0) {
      throw new Error(
        `Table '${parentTableName}', column '${columnName}': no child tables have foreign keys to this table. Cannot aggregate from '${childTableName}'.`
      );
    }

    // Find matching inbound FKs from the child table
    const matchingFKs = parentTable.inboundForeignKeys.filter(fk => fk.childTable === childTableName);

    if (matchingFKs.length === 0) {
      throw new Error(
        `Table '${parentTableName}', column '${columnName}': child table '${childTableName}' has no foreign key to this table`
      );
    }

    // If FK name specified, verify it exists
    if (explicitFKName) {
      const namedFK = matchingFKs.find(fk => fk.fkName === explicitFKName);
      if (!namedFK) {
        const availableFKs = matchingFKs.map(fk => fk.fkName).join(', ');
        throw new Error(
          `Table '${parentTableName}', column '${columnName}': child table '${childTableName}' has no foreign key named '${explicitFKName}'. Available FKs: ${availableFKs}`
        );
      }
    } else {
      // No FK name specified - must be exactly one FK
      if (matchingFKs.length > 1) {
        const availableFKs = matchingFKs.map(fk => fk.fkName).join(', ');
        throw new Error(
          `Table '${parentTableName}', column '${columnName}': child table '${childTableName}' has multiple foreign keys to this table: [${availableFKs}]. Please specify which FK to use with syntax: TYPE(fk_name) @table.column`
        );
      }
    }

    // Validate source column exists in child table (if specified - COUNT might not have one)
    if (sourceColumn && sourceColumn !== '*') {
      if (!childTable.columns[sourceColumn]) {
        throw new Error(
          `Table '${parentTableName}', column '${columnName}': automation references non-existent column '${sourceColumn}' in child table '${childTableName}'`
        );
      }
    }

    // Validate WHERE clause column references
    if (automation.whereClause) {
      this.validateWhereClauseColumns(parentTableName, columnName, automation.whereClause, childTable, childTableName);
      // After validation, strip @ sigils for processedSchema (ready to use)
      automation.whereClause = automation.whereClause.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, '$1');
    }
  }

  /**
   * Validate SYNC/SNAPSHOT automation
   * Child table syncs from parent table
   */
  private validateSyncAutomation(
    childTableName: string,
    columnName: string,
    automation: any,
    childTable: ProcessedTable,
    processedSchema: ProcessedSchema
  ): void {
    const parentTableName = automation.table;
    const sourceColumn = automation.column;
    const explicitFKName = automation.foreign_key;

    // Validate parent table exists
    const parentTable = processedSchema.tables[parentTableName];
    if (!parentTable) {
      throw new Error(
        `Table '${childTableName}', column '${columnName}': automation references non-existent table '${parentTableName}'`
      );
    }

    // Validate FK exists using child's foreignKeys
    if (!childTable.foreignKeys || Object.keys(childTable.foreignKeys).length === 0) {
      throw new Error(
        `Table '${childTableName}', column '${columnName}': table has no foreign keys. Cannot sync from '${parentTableName}'.`
      );
    }

    // Find matching FKs to the parent table
    const matchingFKs = Object.entries(childTable.foreignKeys)
      .filter(([_, fk]) => fk.table === parentTableName)
      .map(([fkName, _]) => fkName);

    if (matchingFKs.length === 0) {
      throw new Error(
        `Table '${childTableName}', column '${columnName}': table has no foreign key to '${parentTableName}'`
      );
    }

    // If FK name specified, verify it exists
    if (explicitFKName) {
      if (!matchingFKs.includes(explicitFKName)) {
        const availableFKs = matchingFKs.join(', ');
        throw new Error(
          `Table '${childTableName}', column '${columnName}': table has no foreign key named '${explicitFKName}' to '${parentTableName}'. Available FKs: ${availableFKs}`
        );
      }
    } else {
      // No FK name specified - must be exactly one FK
      if (matchingFKs.length > 1) {
        const availableFKs = matchingFKs.join(', ');
        throw new Error(
          `Table '${childTableName}', column '${columnName}': table has multiple foreign keys to '${parentTableName}': [${availableFKs}]. Please specify which FK to use with syntax: TYPE(fk_name) @table.column`
        );
      }
    }

    // Validate source column exists in parent table
    if (!parentTable.columns[sourceColumn]) {
      throw new Error(
        `Table '${childTableName}', column '${columnName}': automation references non-existent column '${sourceColumn}' in parent table '${parentTableName}'`
      );
    }
  }

  /**
   * Validate WHERE clause column references exist in the specified table
   */
  private validateWhereClauseColumns(
    parentTableName: string,
    columnName: string,
    whereClause: string,
    childTable: ProcessedTable,
    childTableName: string
  ): void {
    // Extract all @column_name references from WHERE clause
    const columnRefs = whereClause.match(/@[a-zA-Z_][a-zA-Z0-9_]*/g) || [];

    for (const ref of columnRefs) {
      const refColumnName = ref.substring(1); // Remove @ prefix
      if (!childTable.columns[refColumnName]) {
        throw new Error(
          `Table '${parentTableName}', column '${columnName}': WHERE clause references non-existent column '${refColumnName}' in child table '${childTableName}'. WHERE: ${whereClause}`
        );
      }
    }
  }

  /**
   * Build minimal schema for automation parser's resolveAutomation function
   * It only needs tables with foreign_keys structure
   */
  private buildMinimalSchemaForAutomation(processedSchema: ProcessedSchema): any {
    const minimalSchema: any = { tables: {} };

    for (const [tableName, table] of Object.entries(processedSchema.tables)) {
      minimalSchema.tables[tableName] = {
        "foreign-keys": {}
      };

      // Convert foreignKeys to the old foreign-keys structure
      // Since FKs are now keyed by child column name, this works for multiple FKs to same parent
      for (const [fkName, fk] of Object.entries(table.foreignKeys)) {
        minimalSchema.tables[tableName]["foreign-keys"][fkName] = {
          table: fk.table
        };
      }
    }

    return minimalSchema;
  }

  /**
   * Validate formula columns and detect cycles in formula dependencies
   * Works on ProcessedSchema after all tables are built
   */
  validateFormulasAndCycles(processedSchema: ProcessedSchema): void {
    for (const [tableName, table] of Object.entries(processedSchema.tables)) {
      // Build dependency graph for this table's formulas
      const nodes = new Set<string>();
      const edges = new Map<string, Set<string>>();

      // Add all columns as nodes
      for (const columnName of Object.keys(table.columns)) {
        nodes.add(columnName);
        edges.set(columnName, new Set());
      }

      // Validate each formula column
      for (const [columnName, column] of Object.entries(table.columns)) {
        if (!column.formula) continue;

        // Validate: formula must have at least one @ sigil
        const columnRefs = column.formula.match(/@[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
        if (columnRefs.length === 0) {
          throw new Error(
            `Table '${tableName}', column '${columnName}': formula must reference at least one column using @ sigil. Formula: ${column.formula}`
          );
        }

        // Validate: all @column_name references exist
        for (const ref of columnRefs) {
          const refColumnName = ref.substring(1); // Remove @ prefix
          if (!table.columns[refColumnName]) {
            throw new Error(
              `Table '${tableName}', column '${columnName}': formula references non-existent column '${refColumnName}'. Formula: ${column.formula}`
            );
          }

          // Build dependency edge: refColumn -> columnName (refColumn must be computed before columnName)
          const refEdges = edges.get(refColumnName);
          if (refEdges) {
            refEdges.add(columnName);
          }
        }

        // After validation, strip @ sigils for processedSchema (ready to use)
        column.formula = column.formula.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, '$1');
      }

      // Detect cycles using topological sort (Kahn's algorithm)
      const inDegree = new Map<string, number>();
      for (const node of nodes) {
        inDegree.set(node, 0);
      }

      // Calculate in-degrees
      for (const [_, neighbors] of edges) {
        for (const neighbor of neighbors) {
          inDegree.set(neighbor, (inDegree.get(neighbor) || 0) + 1);
        }
      }

      // Queue nodes with in-degree 0
      const queue: string[] = [];
      for (const [node, degree] of inDegree) {
        if (degree === 0) {
          queue.push(node);
        }
      }

      // Process queue
      let processed = 0;
      while (queue.length > 0) {
        const node = queue.shift()!;
        processed++;

        const neighbors = edges.get(node);
        if (neighbors) {
          for (const neighbor of neighbors) {
            const newDegree = (inDegree.get(neighbor) || 0) - 1;
            inDegree.set(neighbor, newDegree);
            if (newDegree === 0) {
              queue.push(neighbor);
            }
          }
        }
      }

      // If we didn't process all nodes, there's a cycle
      if (processed < nodes.size) {
        // Find nodes in cycle (nodes with non-zero in-degree)
        const cycleNodes: string[] = [];
        for (const [node, degree] of inDegree) {
          if (degree > 0) {
            cycleNodes.push(node);
          }
        }

        throw new Error(
          `Table '${tableName}': circular dependency detected in formula columns. Columns in cycle: ${cycleNodes.join(', ')}`
        );
      }
    }
  }

  /**
   * Process a single table with integrated validation
   * Now works from flat lists instead of hierarchical schema
   */
  private processTableWithValidation(
    tableName: string,
    tableMetadata: FlattenedTable,
    tableCols: FlattenedColumn[],
    tableFKs: FlattenedForeignKey[],
    reusableColumns: Map<string, FlattenedReusableColumn>,
    allFKsByTable: Map<string, FlattenedForeignKey[]>,
    processedTables: Map<string, ProcessedTable>,
    layer: number
  ): ProcessedTable {
    // Validate table name is not a reserved word
    this.validateNotReservedWord(tableName, 'table');

    const columns = new Map<string, ColumnDefinition>();
    const fkExtensions: Record<string, { automation?: any, formula?: string }> = {};

    // Build FK name set for FK extension detection
    const fkNames = new Set(tableFKs.map(fk => fk.childColumn || fk.parentTable));

    // Step 1: Process columns from flat list (already parsed!)
    for (const flatCol of tableCols) {
      const columnName = flatCol.columnName;

      // Validate column name is not a reserved word
      this.validateNotReservedWord(columnName, 'column');

      // Check if this is an FK extension (only automation/formula, no type)
      const hasType = flatCol.type !== undefined;
      const hasRef = flatCol.$ref !== undefined;
      const hasAutomation = flatCol.automation !== undefined;
      const hasFormula = flatCol.formula !== undefined;

      if (!hasType && !hasRef && (hasAutomation || hasFormula)) {
        // VALIDATION: Mutual exclusion - cannot have both automation and formula
        if (hasAutomation && hasFormula) {
          throw new Error(
            `Table '${tableName}', column '${columnName}': ` +
            `cannot have both 'automation' and 'formula' properties`
          );
        }

        // Check if this is a SYNC/SNAPSHOT automation (regular column, needs type inference)
        const isSyncSnapshot = typeof flatCol.automation === 'string' &&
          (flatCol.automation.startsWith('SYNC ') || flatCol.automation.startsWith('SNAPSHOT '));

        if (isSyncSnapshot) {
          // This is a regular column with SYNC/SNAPSHOT automation
          columns.set(columnName, {
            type: '', // Empty placeholder - will be filled by propagateTypeAndMetadata
            automation: flatCol.automation,
            ...(flatCol.formula && { formula: flatCol.formula }),
            ...(flatCol.comment && { comment: flatCol.comment })
          } as ColumnDefinition);
          continue;
        }

        // Check if this column matches a foreign key
        const isFKExtension = fkNames.has(columnName);

        if (!isFKExtension && hasFormula) {
          // ERROR: Not an FK extension, formula column must have type or $ref
          throw new Error(
            `Table '${tableName}', column '${columnName}': ` +
            `formula columns must specify a type or use $ref to inherit from a reusable column`
          );
        }

        // It's an FK extension
        fkExtensions[columnName] = {
          ...(hasAutomation && { automation: flatCol.automation }),
          ...(hasFormula && { formula: flatCol.formula })
        };
        continue;
      }

      // Normal column processing - resolve $ref if present
      let resolvedCol: ColumnDefinition;

      if (flatCol.$ref) {
        const reusable = reusableColumns.get(flatCol.$ref);
        if (!reusable) {
          throw new Error(
            `Table '${tableName}', column '${columnName}': ` +
            `references unknown reusable column '$ref: ${flatCol.$ref}'`
          );
        }

        // Merge reusable column with any overrides from flatCol
        resolvedCol = {
          type: flatCol.type || reusable.type || '',
          ...(flatCol.size !== undefined ? { size: flatCol.size } : reusable.size !== undefined ? { size: reusable.size } : {}),
          ...(flatCol.decimal !== undefined ? { decimal: flatCol.decimal } : reusable.decimal !== undefined ? { decimal: reusable.decimal } : {}),
          primary_key: flatCol.primary_key ?? reusable.primary_key ?? false,
          unique: flatCol.unique ?? reusable.unique ?? false,
          not_null: flatCol["not-null"] ?? reusable["not-null"] ?? false,
          sequence: flatCol.sequence ?? reusable.sequence ?? false,
          ...(flatCol.default !== undefined ? { default: flatCol.default } : reusable.default !== undefined ? { default: reusable.default } : {}),
          ...(flatCol.automation !== undefined ? { automation: flatCol.automation } : reusable.automation !== undefined ? { automation: reusable.automation } : {}),
          ...(flatCol.formula !== undefined ? { formula: flatCol.formula } : reusable.formula !== undefined ? { formula: reusable.formula } : {}),
          ...(flatCol.format !== undefined ? { format: flatCol.format } : reusable.format !== undefined ? { format: reusable.format } : {}),
          ...(flatCol.label !== undefined ? { label: flatCol.label } : reusable.label !== undefined ? { label: reusable.label } : {}),
          ...(flatCol.comment !== undefined ? { comment: flatCol.comment } : reusable.comment !== undefined ? { comment: reusable.comment } : {})
        };
      } else {
        // No $ref, just use the parsed fields directly
        resolvedCol = {
          type: flatCol.type || '',
          ...(flatCol.size !== undefined && { size: flatCol.size }),
          ...(flatCol.decimal !== undefined && { decimal: flatCol.decimal }),
          primary_key: flatCol.primary_key ?? false,
          unique: flatCol.unique ?? false,
          not_null: flatCol["not-null"] ?? false,
          sequence: flatCol.sequence ?? false,
          ...(flatCol.default !== undefined && { default: flatCol.default }),
          ...(flatCol.automation !== undefined && { automation: flatCol.automation }),
          ...(flatCol.formula !== undefined && { formula: flatCol.formula }),
          ...(flatCol.format !== undefined && { format: flatCol.format }),
          ...(flatCol.label !== undefined && { label: flatCol.label }),
          ...(flatCol.comment !== undefined && { comment: flatCol.comment })
        };
      }

      // PostgreSQL requires primary keys to be NOT NULL
      // Mirror this constraint in our schema representation
      if (resolvedCol.primary_key) {
        resolvedCol["not-null"] = true;
      }

      columns.set(columnName, resolvedCol);
    }

    // Step 1.5: Validate primary key constraint - single column only
    const primaryKeyColumns = Array.from(columns.entries())
      .filter(([_, col]) => col.primary_key)
      .map(([name, _]) => name);

    if (primaryKeyColumns.length > 1) {
      throw new Error(
        `Table '${tableName}' has composite primary key (${primaryKeyColumns.join(', ')}). ` +
        `GenLogic only supports single-column primary keys. ` +
        `Use a surrogate key (e.g., 'id: serial primary key') plus a unique constraint on (${primaryKeyColumns.join(', ')}).`
      );
    }

    // Step 2: Generate FK columns from flat FK list (parent tables already processed)
    const generatedColumns = new Map<string, ColumnDefinition>();
    const fkColumnMapping: Record<string, string[]> = {};
    const normalizedForeignKeys: Record<string, ForeignKeyDefinition> = {};

    for (const flatFK of tableFKs) {
      const parentTableName = flatFK.parentTable;

      // Get parent table (either already processed or self-referential)
      let parentTable: ProcessedTable;
      if (parentTableName === tableName) {
        // Self-referential FK - use current table's columns
        parentTable = {
          comment: tableMetadata.comment,
          columns: Object.fromEntries(columns),
          foreignKeys: {},
          generatedColumns: {},
          fkColumnMapping: {}
        };
      } else {
        // Normal FK - parent must already be processed
        const pt = processedTables.get(parentTableName);
        if (!pt) {
          throw new Error(
            `Table '${tableName}', FK to '${parentTableName}': ` +
            `parent table not yet processed (layer calculation error)`
          );
        }
        parentTable = pt;
      }

      // Find parent's primary key columns
      const primaryKeyColumns = this.findPrimaryKeyColumnsFromMap(parentTable);
      if (primaryKeyColumns.length === 0) {
        throw new Error(
          `Table '${tableName}', FK to '${parentTableName}': ` +
          `parent table has no primary key columns`
        );
      }

      // ENFORCE: Single-column primary keys only
      if (primaryKeyColumns.length > 1) {
        throw new Error(
          `Table '${tableName}', FK to '${parentTableName}': ` +
          `parent table has composite primary key (not supported - use single-column PKs only)`
        );
      }

      const pkColumn = primaryKeyColumns[0];
      const parentPKColumnName = pkColumn.name;

      // Determine FK column name in child table
      let fkColumnName: string;
      if (flatFK.childColumn) {
        fkColumnName = flatFK.childColumn;
      } else {
        // Infer: parentTableName_id
        fkColumnName = `${parentTableName}_id`;
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
        ...(flatFK.notNull && { not_null: true }),
        ...(pkColumn.definition.label && { label: pkColumn.definition.label }),
        ...(pkColumn.definition.format && { format: pkColumn.definition.format })
      };

      // Apply FK extensions
      if (fkExtensions[fkColumnName]) {
        const extension = fkExtensions[fkColumnName];
        if (extension.automation) {
          fkColumnDef.automation = extension.automation;
        }
        if (extension.formula) {
          fkColumnDef.formula = extension.formula;
        }
      }

      generatedColumns.set(fkColumnName, fkColumnDef);

      // Store FK mapping (legacy - kept for backward compat)
      // If there are multiple FKs to same parent, keep appending
      if (!fkColumnMapping[parentTableName]) {
        fkColumnMapping[parentTableName] = [];
      }
      fkColumnMapping[parentTableName].push(fkColumnName);

      // Build complete FK definition with all info needed for DDL generation
      // KEY BY CHILD COLUMN NAME to support multiple FKs to same parent table
      normalizedForeignKeys[fkColumnName] = {
        table: parentTableName,
        column: fkColumnName,           // Child column (the FK column we generated)
        references: parentPKColumnName, // Parent PK column
        onDelete: flatFK.delete,        // Always present: 'restrict' or 'cascade'
        ...(flatFK.notNull && { not_null: true }),
        ...(flatFK.autoCreateParent && { auto_create_parent: true })
      };
    }

    // Merge FK columns into main columns map
    for (const [colName, colDef] of generatedColumns) {
      columns.set(colName, colDef);
    }

    // Step 3: Formula validation moved to Phase 8.1 for consistency
    // (all @ sigil validations happen together in Phase 8)

    // Step 4: Validate automations (FK and columns must exist)
    for (const [colName, col] of columns) {
      if (col.automation) {
        this.validateAutomationColumn(
          tableName,
          colName,
          col,
          tableFKs,
          allFKsByTable,
          processedTables
        );
      }
    }

    // Step 5: Validate auto_create_parent (parent must have PK)
    for (const flatFK of tableFKs) {
      if (flatFK.autoCreateParent) {
        const parentTable = processedTables.get(flatFK.parentTable);
        if (!parentTable) {
          throw new Error(
            `Table '${tableName}', FK to '${flatFK.parentTable}': ` +
            `auto_create_parent requires parent table to be processed`
          );
        }
        const parentPK = this.findPrimaryKeyColumnsFromMap(parentTable);
        if (parentPK.length === 0) {
          throw new Error(
            `Table '${tableName}', FK to '${flatFK.parentTable}': ` +
            `auto_create_parent requires parent table to have a primary key`
          );
        }
      }
    }

    // Step 6: Validate indexes and constraints (columns must exist)
    // NOTE: These are validated from yamlFlattenedLists in a later phase

    // Step 7: If this is a singleton table, add DEFAULT 0 to the first PK column
    if (tableMetadata.singleton) {
      // Find the first primary key column
      let firstPKColumn: string | undefined;

      // Check composite PK first
      if (tableMetadata.primaryKey && tableMetadata.primaryKey.length > 0) {
        firstPKColumn = tableMetadata.primaryKey[0];
      } else {
        // Check for column-level primary key
        for (const [colName, colDef] of columns) {
          if (colDef.primary_key) {
            firstPKColumn = colName;
            break;
          }
        }
      }

      if (firstPKColumn) {
        const pkColumn = columns.get(firstPKColumn);
        if (pkColumn) {
          // Add DEFAULT 0 if not already present
          if (!pkColumn.default) {
            pkColumn.default = '0';
          }
        }
      }
    }

    // Convert Map to Record for return type
    const columnsRecord: Record<string, ColumnDefinition> = {};
    for (const [name, def] of columns) {
      columnsRecord[name] = def;
    }

    return {
      comment: tableMetadata.comment,
      singleton: tableMetadata.singleton,  // Pass through singleton flag
      layer,  // Dependency layer for ordered DDL generation
      columns: columnsRecord,
      primaryKey: tableMetadata.primaryKey,  // Pass through composite PK definition
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
   * Validate a formula column's references
   */
  /**
   * DELETED: validateGeneratedColumn - moved to Phase 8.1 (processor.ts validateFormulasAndCycles)
   * All @ sigil validations now happen together in Phase 8
   */

  /**
   * Validate an automation column
   */
  private validateAutomationColumn(
    tableName: string,
    columnName: string,
    columnDef: ColumnDefinition,
    tableFKs: FlattenedForeignKey[],
    allFKsByTable: Map<string, FlattenedForeignKey[]>,
    processedTables: Map<string, ProcessedTable>
  ): void {
    // Automation validation is handled by automation-parser inferForeignKey()
    // which will validate FK paths when automation is resolved
    // This is a placeholder for now - deeper validation happens in trigger generation
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
    const ac = fk["auto-create"]!;
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
      if (!childColumns.has(ac.spread["generated-column"])) {
        throw new Error(`Table '${tableName}', FK '${fkName}': auto_create.spread["generated-column"] '${ac.spread["generated-column"]}' does not exist in child table`);
      }
    }

    // Validate copy_columns
    if (ac["copy-columns"]) {
      for (const [parentCol, childCol] of Object.entries(ac["copy-columns"])) {
        if (!parentColumns.has(parentCol)) {
          throw new Error(`Table '${tableName}', FK '${fkName}': auto_create["copy-columns"] parent column '${parentCol}' does not exist in parent table '${fk.table}'`);
        }
        if (!childColumns.has(childCol)) {
          throw new Error(`Table '${tableName}', FK '${fkName}': auto_create["copy-columns"] child column '${childCol}' does not exist in child table`);
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
    if (table["unique-constraints"]) {
      for (let i = 0; i < table["unique-constraints"].length; i++) {
        const constraintCols = table["unique-constraints"][i];

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
   * Validate CHECK constraint expression
   * Checks that all @column_name references exist in the table
   */
  private validateConstraintExpression(
    tableName: string,
    constraint: string,
    columns: Map<string, ColumnDefinition>
  ): void {
    // Extract all @column_name references from the constraint
    const columnRefs = constraint.match(/@[a-zA-Z_][a-zA-Z0-9_]*/g) || [];

    for (const ref of columnRefs) {
      const columnName = ref.substring(1); // Remove @ prefix
      if (!columns.has(columnName)) {
        throw new Error(
          `Table '${tableName}', constraint '${constraint}': ` +
          `referenced column '${columnName}' does not exist`
        );
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
  singleton?: boolean;  // If true, table can only contain one row
  layer?: number;  // Dependency layer (0 = no FKs, 1 = depends on layer 0, etc.)
  columns: Record<string, ColumnDefinition>;
  primaryKey?: string[];  // Composite primary key column names
  foreignKeys: Record<string, ForeignKeyDefinition>;
  generatedColumns: Record<string, ColumnDefinition>; // FK columns generated automatically
  fkColumnMapping: Record<string, string[]>; // Maps FK name to generated column names
  fkExtensions?: Record<string, { automation?: any, generated?: string }>; // Extensions for FK columns
  inboundForeignKeys?: Array<{  // Reverse FK index: which child tables point to this table
    childTable: string;         // Name of child table with FK to this table
    fkName: string;            // Name of the FK (for SUM(fkName) syntax)
    childColumn: string;       // Column name in child table
  }>;
  seedRows?: Array<Record<string, any>>;  // Seed data rows for this table
  indexes?: string[][];  // Indexes: array of column lists
  uniqueConstraints?: string[][];  // Unique constraints: array of column lists
  constraints?: string[];  // Table-level CHECK constraint expressions
}