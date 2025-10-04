import type { GenLogicSchema, ColumnDefinition, AutomationDefinition } from './types.js';
import type { ProcessedSchema, ProcessedTable } from './schema-processor.js';

/**
 * ResolvedSchemaGenerator - Creates human/AI-readable schema documentation
 *
 * Generates a YAML file showing the actual database structure after GenLogic processing,
 * with clear guidance on what is writable by applications vs managed by the database.
 */
export class ResolvedSchemaGenerator {
  /**
   * Generate resolved schema document
   */
  generateResolvedSchema(
    schema: GenLogicSchema,
    processedSchema: ProcessedSchema,
    sourceFile: string,
    database: string
  ): any {
    const resolved: any = {
      _metadata: this.generateMetadata(sourceFile, database),
      tables: {}
    };

    if (!schema.tables || !processedSchema.tables) {
      return resolved;
    }

    // Generate documentation for each table
    for (const [tableName, tableDefSrc] of Object.entries(schema.tables)) {
      const processedTable = processedSchema.tables[tableName];
      if (!processedTable) {
        console.warn(`⚠️  Warning: Table '${tableName}' not found in processed schema during resolved schema generation`);
        continue;
      }

      resolved.tables[tableName] = this.generateTableDoc(
        tableName,
        tableDefSrc,
        processedTable,
        schema,
        processedSchema
      );
    }

    // Add usage guide at the end
    resolved._usage_guide = this.generateUsageGuide();

    return resolved;
  }

  /**
   * Generate metadata section
   */
  private generateMetadata(sourceFile: string, database: string): any {
    return {
      generated_at: new Date().toISOString(),
      source_schema: sourceFile,
      database: database,
      genlogic_version: "1.0.0",
      note: "This describes the ACTUAL database structure after GenLogic processing",
      warning: "⚠️  DO NOT implement automations in middleware - they run in the database!"
    };
  }

  /**
   * Generate documentation for a single table
   */
  private generateTableDoc(
    tableName: string,
    tableDefSrc: any,
    processedTable: ProcessedTable,
    schema: GenLogicSchema,
    processedSchema: ProcessedSchema
  ): any {
    const tableDoc: any = {
      _table_info: this.generateTableInfo(tableName, tableDefSrc, processedTable),
      columns: {}
    };

    // Combine explicit columns and generated FK columns
    const allColumns = { ...processedTable.columns, ...processedTable.generatedColumns };

    for (const [columnName, columnDef] of Object.entries(allColumns)) {
      tableDoc.columns[columnName] = this.generateColumnDoc(
        columnName,
        columnDef,
        tableName,
        tableDefSrc,
        processedTable,
        schema,
        processedSchema
      );
    }

    return tableDoc;
  }

  /**
   * Generate table-level information
   */
  private generateTableInfo(_tableName: string, tableDefSrc: any, processedTable: ProcessedTable): any {
    const hasAutomations = tableDefSrc.columns && Object.values(tableDefSrc.columns).some(
      (col: any) => col && typeof col === 'object' && ('automation' in col || 'calculated' in col)
    );

    const hasSyncTargets = tableDefSrc.sync && Object.keys(tableDefSrc.sync).length > 0;

    const info: any = {
      has_triggers: hasAutomations || hasSyncTargets,
      has_automations: hasAutomations,
      foreign_keys: Object.keys(processedTable.foreignKeys).length
    };

    // Document sync relationships
    if (hasSyncTargets) {
      info.sync_targets = Object.keys(tableDefSrc.sync).map((targetTable: string) => ({
        target_table: targetTable,
        operations: tableDefSrc.sync[targetTable].operations || ['insert', 'update', 'delete'],
        note: `Changes in this table are automatically synced to ${targetTable}`
      }));
    }

    // Process ui-notes if present
    if (tableDefSrc['ui-notes'] && Array.isArray(tableDefSrc['ui-notes'])) {
      const uiGuidance = this.expandUIGuidance(tableDefSrc['ui-notes']);
      if (Object.keys(uiGuidance).length > 0) {
        info.ui_guidance = uiGuidance;
      }
    }

    return info;
  }

  /**
   * Expand column-level ui-notes into UI guidance
   */
  private expandColumnUIGuidance(uiNotes: ('read-only' | 'hidden')[]): any {
    const guidance: any = {};

    for (const note of uiNotes) {
      switch (note) {
        case 'read-only':
          guidance.read_only = {
            editable: false,
            description: 'This column should not be editable in the UI',
            ui_behavior: [
              'Display as read-only text or disabled input field',
              'Do not allow user modifications',
              'Show value but prevent editing'
            ]
          };
          break;

        case 'hidden':
          guidance.hidden = {
            visible: false,
            description: 'This column should not be visible in the UI',
            ui_behavior: [
              'Do not display this column in forms or tables',
              'Exclude from user-facing displays',
              'May be used internally but hidden from users'
            ]
          };
          break;
      }
    }

    return guidance;
  }

  /**
   * Expand ui-notes into detailed UI guidance
   */
  private expandUIGuidance(uiNotes: string[]): any {
    const guidance: any = {};

    for (const note of uiNotes) {
      switch (note) {
        case 'singleton':
          guidance.row_expectations = {
            type: 'singleton',
            expected_rows: 'exactly_one',
            description: 'This table should contain exactly one row',
            ui_behavior: [
              'Do not show "Add" or "New" buttons',
              'Do not show "Delete" button',
              'Present as a form, not a list',
              'Load the single row on component mount',
              'Show edit mode directly or with single "Edit" button'
            ],
            query_pattern: 'SELECT * FROM table_name LIMIT 1',
            note: 'Always expect exactly one row. If no row exists, show error or create default.'
          };
          break;

        case 'no-insert':
          if (!guidance.crud_restrictions) {
            guidance.crud_restrictions = {};
          }
          guidance.crud_restrictions.insert = {
            allowed: false,
            reason: 'Schema restricts INSERT operations',
            ui_behavior: [
              'Do not show "Add" or "New" buttons',
              'Do not implement create/insert forms',
              'Rows are managed by database or other processes'
            ]
          };
          break;

        case 'no-update':
          if (!guidance.crud_restrictions) {
            guidance.crud_restrictions = {};
          }
          guidance.crud_restrictions.update = {
            allowed: false,
            reason: 'Schema restricts UPDATE operations',
            ui_behavior: [
              'Do not show "Edit" buttons',
              'Show all fields as read-only',
              'Data is immutable after creation'
            ]
          };
          break;

        case 'no-delete':
          if (!guidance.crud_restrictions) {
            guidance.crud_restrictions = {};
          }
          guidance.crud_restrictions.delete = {
            allowed: false,
            reason: 'Schema restricts DELETE operations',
            ui_behavior: [
              'Do not show "Delete" buttons',
              'Records cannot be removed once created',
              'Consider soft-delete column if needed'
            ]
          };
          break;
      }
    }

    return guidance;
  }

  /**
   * Generate documentation for a single column
   */
  private generateColumnDoc(
    columnName: string,
    columnDef: ColumnDefinition,
    tableName: string,
    tableDefSrc: any,
    processedTable: ProcessedTable,
    schema: GenLogicSchema,
    processedSchema: ProcessedSchema
  ): any {
    const doc: any = {
      type: columnDef.type
    };

    // Add type parameters
    if (columnDef.size !== undefined) doc.size = columnDef.size;
    if (columnDef.decimal !== undefined) doc.decimal = columnDef.decimal;
    if (columnDef.primary_key) doc.primary_key = true;
    if (columnDef.unique) doc.unique = true;

    // Determine NULL handling
    const nullHandling = this.determineNullHandling(columnDef);
    doc.expect_null_on_read = nullHandling.expectNullOnRead;
    doc.can_write_null = nullHandling.canWriteNull;

    // Determine if this is a generated FK column
    const isGeneratedFK = columnName in processedTable.generatedColumns;

    // Determine writability and behavior
    const writabilityInfo = this.determineWritability(
      columnName,
      columnDef,
      tableName,
      tableDefSrc,
      processedTable,
      isGeneratedFK,
      schema,
      processedSchema
    );

    Object.assign(doc, writabilityInfo);

    // Add column-level UI notes if present
    if (columnDef['ui-notes'] && Array.isArray(columnDef['ui-notes']) && columnDef['ui-notes'].length > 0) {
      doc.ui_notes = this.expandColumnUIGuidance(columnDef['ui-notes']);
    }

    return doc;
  }

  /**
   * Determine NULL handling for a column
   */
  private determineNullHandling(columnDef: ColumnDefinition): {
    expectNullOnRead: boolean;
    canWriteNull: boolean;
  } {
    // Primary keys: never NULL
    if (columnDef.primary_key) {
      return {
        expectNullOnRead: false,
        canWriteNull: false
      };
    }

    // Sequence columns: never NULL (auto-generated)
    if (columnDef.sequence) {
      return {
        expectNullOnRead: false,
        canWriteNull: false
      };
    }

    // Aggregation automations: DEFAULT 0, never NULL on read, not writable
    if (columnDef.automation) {
      const isAggregation = ['SUM', 'COUNT', 'MAX', 'MIN'].includes(columnDef.automation.type);
      if (isAggregation) {
        return {
          expectNullOnRead: false,  // Has DEFAULT 0
          canWriteNull: false        // Not writable at all
        };
      }

      // FETCH/FETCH_UPDATES/LATEST: may be NULL, not writable
      return {
        expectNullOnRead: true,   // May be NULL if not fetched/no children
        canWriteNull: false        // Not writable at all
      };
    }

    // Calculated columns: may be NULL depending on expression, not writable
    if (columnDef.calculated) {
      return {
        expectNullOnRead: true,   // Depends on calculation
        canWriteNull: false        // Not writable at all
      };
    }

    // Regular columns: nullable by default in PostgreSQL
    return {
      expectNullOnRead: true,    // May be NULL
      canWriteNull: true         // Can write NULL
    };
  }

  /**
   * Determine column writability and generate guidance
   */
  private determineWritability(
    columnName: string,
    columnDef: ColumnDefinition,
    tableName: string,
    _tableDefSrc: any,
    processedTable: ProcessedTable,
    isGeneratedFK: boolean,
    _schema: GenLogicSchema,
    _processedSchema: ProcessedSchema
  ): any {
    // Case 1: Sequence column (auto-increment)
    if (columnDef.sequence) {
      return {
        writable: 'never',
        reason: 'auto_increment_sequence',
        insert_behavior: 'omit',
        update_behavior: 'immutable',
        note: 'Database generates this value'
      };
    }

    // Case 2: Calculated column
    if (columnDef.calculated) {
      return {
        writable: 'never',
        reason: 'database_calculation',
        managed_by: {
          type: 'trigger_calculation',
          trigger_name: `${tableName}_before_insert_genlogic`,
          calculated_from: columnDef.calculated,
          evaluation_timing: 'before_write'
        },
        insert_behavior: 'omit',
        update_behavior: 'forbidden',
        query_note: 'Always calculated on write, never stale',
        warning: '⚠️  AUTOMATED IN DATABASE - DO NOT SET IN APPLICATION'
      };
    }

    // Case 3: Automation column
    if (columnDef.automation) {
      const managedBy = this.generateManagedByInfo(
        columnDef.automation,
        tableName,
        columnName,
        _schema,
        _processedSchema
      );

      // RULE_MATCH is different - middleware controls updates via stored procedures
      if ((columnDef.automation as any).type === 'RULE_MATCH') {
        return {
          writable: 'hybrid',
          reason: 'rule_match_automation',
          managed_by: managedBy,
          insert_behavior: 'optional',
          update_behavior: 'allowed',
          query_note: 'Middleware uses preview functions and performs updates after user approval',
          note: 'This column uses RULE_MATCH automation. Middleware should preview matches and apply updates.'
        };
      }

      // Standard automations (SUM, COUNT, etc.)
      return {
        writable: 'never',
        reason: 'database_automation',
        managed_by: managedBy,
        insert_behavior: 'omit',
        update_behavior: 'forbidden',
        query_note: 'Always reflects current state via triggers',
        warning: '⚠️  AUTOMATED IN DATABASE - DO NOT SET IN APPLICATION'
      };
    }

    // Case 4: Generated FK column
    if (isGeneratedFK) {
      // Find which FK this belongs to
      const fkInfo = this.findForeignKeyInfo(columnName, processedTable);

      return {
        writable: 'always',
        source: 'foreign_key_column',
        references: fkInfo,
        insert_behavior: 'optional',
        update_behavior: 'allowed',
        note: 'Application controls this value to establish relationships'
      };
    }

    // Case 5: Primary key (non-sequence)
    if (columnDef.primary_key) {
      return {
        writable: 'always',
        insert_behavior: 'required',
        update_behavior: 'immutable',
        note: 'Application must provide this value, cannot change after insert'
      };
    }

    // Case 6: Regular column
    return {
      writable: 'always',
      insert_behavior: 'optional',
      update_behavior: 'allowed',
      note: 'Application controls this value'
    };
  }

  /**
   * Generate managed_by information for automated columns
   */
  private generateManagedByInfo(
    automation: AutomationDefinition,
    tableName: string,
    columnName: string,
    _schema: GenLogicSchema,
    _processedSchema: ProcessedSchema
  ): any {
    // Handle RULE_MATCH automation
    if ((automation as any).type === 'RULE_MATCH') {
      const ruleMatch = automation as any;
      const sprocBaseName = `${tableName}_${columnName}_rule_match`;

      return {
        type: 'stored_procedure',
        automation_type: 'RULE_MATCH',
        source_table: ruleMatch.source_table,
        mode: ruleMatch.mode || 'stored_procedure',

        stored_procedures: {
          rule_preview: {
            name: `${tableName}_${columnName}_rule_preview`,
            signature: '(rule_id INTEGER)',
            returns: 'TABLE(transaction_id INTEGER, description VARCHAR, payee VARCHAR, current_offset_account VARCHAR, would_match BOOLEAN)',
            description: 'Preview what a specific rule would match. Use when creating/editing rules.',
            usage: `-- Preview what rule #42 would match\nSELECT * FROM ${tableName}_${columnName}_rule_preview(42);\n\n-- Returns all uncategorized transactions and whether they match this rule`
          },
          categorize_preview: {
            name: `${tableName}_${columnName}_categorize_preview`,
            signature: '(transaction_ids INTEGER[] DEFAULT NULL)',
            returns: 'TABLE(transaction_id INTEGER, description VARCHAR, current_offset_account VARCHAR, proposed_offset_account VARCHAR, matched_rule_id INTEGER, rule_priority INTEGER)',
            description: 'Preview categorization for transactions (NULL = all uncategorized). Use after bulk imports.',
            usage: `-- Preview categorization for newly imported transactions\nSELECT * FROM ${tableName}_${columnName}_categorize_preview(ARRAY[1001, 1002, 1003]);\n\n-- Preview all uncategorized transactions\nSELECT * FROM ${tableName}_${columnName}_categorize_preview(NULL);`
          },
          categorize_apply: {
            name: `${tableName}_${columnName}_categorize_apply`,
            signature: '(transaction_ids INTEGER[] DEFAULT NULL)',
            returns: 'TABLE(transaction_id INTEGER, offset_account VARCHAR, rule_id INTEGER)',
            description: 'Apply categorization to transactions (NULL = all uncategorized). Actually performs UPDATEs.',
            usage: `-- Apply categorization to newly imported transactions\nSELECT * FROM ${tableName}_${columnName}_categorize_apply(ARRAY[1001, 1002, 1003]);\n\n-- Apply to all uncategorized transactions\nSELECT * FROM ${tableName}_${columnName}_categorize_apply(NULL);`
          }
        },

        match_rules: {
          source_columns: ruleMatch.source_columns,
          destination_columns: ruleMatch.destination_columns,
          supported_operators: ruleMatch.operators,
          overwrite_policy: ruleMatch.overwrite_policy || 'if_null'
        },

        ui_guidance: {
          workflow_new_rule: `1. User creates a new categorization rule\n2. Call rule_preview to show what it matches\n3. Display: "This rule matches N transactions. Apply?"\n4. If approved, middleware does simple UPDATE`,

          workflow_bulk_import: `1. Import transactions with ${columnName} = NULL\n2. Call categorize_preview to see what rules match\n3. Display matches grouped by rule for user approval\n4. Call categorize_apply to perform UPDATEs`,

          example_new_rule: `-- User creates rule #42: "NETFLIX → Entertainment"\n-- Preview what it matches:\nSELECT \n  t.transaction_id,\n  t.description,\n  t.amount\nFROM ${tableName}_${columnName}_rule_preview(42) p\nJOIN ${tableName} t ON t.transaction_id = p.transaction_id\nWHERE p.would_match = true;\n\n-- Show user: "This rule matches 47 transactions. Apply?"\n-- If approved, middleware does:\nUPDATE ${tableName}\nSET ${columnName} = (SELECT target_value FROM ${ruleMatch.source_table} WHERE rule_id = 42)\nWHERE transaction_id IN (SELECT transaction_id FROM ${tableName}_${columnName}_rule_preview(42) WHERE would_match = true);`,

          example_bulk_import: `-- Import 100 new transactions (IDs 1001-1100)\n-- Preview categorization:\nSELECT \n  proposed_offset_account,\n  COUNT(*) as match_count,\n  ARRAY_AGG(transaction_id) as transactions\nFROM ${tableName}_${columnName}_categorize_preview(ARRAY[1001, 1002, ...1100])\nWHERE proposed_offset_account IS NOT NULL\nGROUP BY proposed_offset_account\nORDER BY match_count DESC;\n\n-- Show user: "75 of 100 transactions matched rules. Apply?"\n-- If approved:\nSELECT * FROM ${tableName}_${columnName}_categorize_apply(ARRAY[1001, 1002, ...1100]);`
        }
      };
    }

    // Standard automation handling
    const stdAutomation = automation as any;
    const info: any = {
      type: 'trigger_aggregation',
      automation_type: stdAutomation.type,
      source_table: stdAutomation.table,
      source_column: stdAutomation.column
    };

    // Determine which table has the trigger
    if (['SUM', 'COUNT', 'MAX', 'MIN', 'LATEST'].includes(stdAutomation.type)) {
      // Aggregations: trigger is on the source (child) table
      info.trigger_name = `${stdAutomation.table}_before_insert_genlogic`;
      info.aggregation_path = `${stdAutomation.table}.${stdAutomation.foreign_key} -> ${tableName}`;
      info.update_strategy = 'incremental';
      info.note = `Aggregates ${stdAutomation.type} from ${stdAutomation.table}.${stdAutomation.column}`;
    } else if (['SNAPSHOT', 'FOLLOW'].includes(stdAutomation.type)) {
      // SNAPSHOT/FOLLOW: trigger is on the parent table
      info.trigger_name = `${stdAutomation.table}_before_update_genlogic`;
      info.cascade_path = `${stdAutomation.table} -> ${tableName}.${stdAutomation.foreign_key}`;
      info.update_strategy = stdAutomation.type === 'FOLLOW' ? 'on_parent_change' : 'on_insert_only';
      info.note = stdAutomation.type === 'SNAPSHOT'
        ? `Snapshot from ${stdAutomation.table}.${stdAutomation.column} (captured on INSERT only)`
        : `Follows ${stdAutomation.table}.${stdAutomation.column} (synchronized on parent UPDATE)`;
    }

    return info;
  }

  /**
   * Find foreign key reference information for a column
   */
  private findForeignKeyInfo(columnName: string, processedTable: ProcessedTable): any {
    // Search through FK mappings to find which FK this column belongs to
    for (const [fkName, fkColumns] of Object.entries(processedTable.fkColumnMapping)) {
      if (fkColumns.includes(columnName)) {
        const fkDef = processedTable.foreignKeys[fkName];
        if (fkDef) {
          return {
            table: fkDef.table,
            column: columnName, // This is simplified - may need to look up actual target PK
            constraint: fkName
          };
        }
      }
    }

    return null;
  }

  /**
   * Generate usage guide section
   */
  private generateUsageGuide(): any {
    return {
      insert_pattern: `To insert data, only include columns where writable=always and insert_behavior != omit.
Example for accounts:
  INSERT INTO accounts (account, category) VALUES ('Checking', 'Asset');

❌ WRONG - don't set automated columns:
  INSERT INTO accounts (account, category, debits, balance) VALUES (...);`,

      update_pattern: `To update data, only modify columns where writable=always and update_behavior=allowed.
Example for accounts:
  UPDATE accounts SET category = 'Liability' WHERE id = 5;

❌ WRONG - don't update automated columns:
  UPDATE accounts SET balance = 1000 WHERE id = 5;  -- Will be overwritten!`,

      query_pattern: `All columns are readable. Automated columns are always current - no need to recalculate.
Example:
  SELECT account, category, balance FROM accounts WHERE category = 'Asset';

The balance is ALWAYS up-to-date due to database triggers.`,

      automation_philosophy: `GenLogic implements "Augmented Normalization":
- Write normalized data (accounts, ledger entries)
- Read denormalized data (balances pre-calculated)
- Middleware NEVER calculates aggregations or balances
- Database maintains ALL computed values via triggers
- Zero middleware business logic = zero bugs`
    };
  }
}
