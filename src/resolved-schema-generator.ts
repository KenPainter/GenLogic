import type { GenLogicSchema, ColumnDefinition, AutomationDefinition, MatchingTableDefinition } from './types.js';
import type { ProcessedSchema, ProcessedTable } from './schema-processor.js';
import { resolveAutomation } from './automation-parser.js';

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
      tables: {},
      matching_tables: {}
    };

    // Generate documentation for regular tables
    if (schema.tables && processedSchema.tables) {
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
    }

    // Generate documentation for matching tables
    if (schema.matching_tables) {
      for (const [tableName, definition] of Object.entries(schema.matching_tables)) {
        resolved.matching_tables[tableName] = this.generateMatchingTableDoc(tableName, definition);
      }
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
      note: "This describes the ACTUAL database structure after GenLogic processing"
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
      _table_info: this.generateTableInfo(tableName, tableDefSrc, processedTable)
    };

    // Add indexes if present
    if (tableDefSrc.indexes && tableDefSrc.indexes.length > 0) {
      tableDoc.indexes = tableDefSrc.indexes.map((cols: string[]) => ({
        columns: cols
      }));
    }

    // Add unique constraints if present
    if (tableDefSrc.unique_constraints && tableDefSrc.unique_constraints.length > 0) {
      tableDoc.unique_constraints = tableDefSrc.unique_constraints.map((cols: string[]) => ({
        columns: cols
      }));
    }

    // Add columns
    tableDoc.columns = {};

    // Combine explicit columns and generated FK columns
    // All columns (including FK-generated) are now in processedTable.columns
    const allColumns = processedTable.columns;

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

    // Add description if present
    if (processedTable.description) {
      info.description = processedTable.description;
    }

    // Document sync relationships
    if (hasSyncTargets) {
      info.sync_targets = Object.keys(tableDefSrc.sync).map((targetTable: string) => ({
        target_table: targetTable,
        operations: tableDefSrc.sync[targetTable].operations || ['insert', 'update', 'delete'],
        note: `Changes in this table are automatically synced to ${targetTable}`
      }));
    }

    return info;
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

    // Add description if present
    if (columnDef.description) {
      doc.description = columnDef.description;
    }

    // Add label and format if present
    if (columnDef.label) {
      doc.label = columnDef.label;
    }
    if (columnDef.format) {
      doc.format = columnDef.format;
    }

    // Add type parameters
    if (columnDef.size !== undefined) doc.size = columnDef.size;
    if (columnDef.decimal !== undefined) doc.decimal = columnDef.decimal;
    if (columnDef.primary_key) doc.primary_key = true;
    if (columnDef.unique) doc.unique = true;

    // Determine nullable
    doc.nullable = this.isNullable(columnDef);

    // Determine if this is a generated FK column (check fkColumnMapping)
    const isGeneratedFK = Object.values(processedTable.fkColumnMapping || {})
      .flat()
      .includes(columnName);

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

    return doc;
  }

  /**
   * Determine if column is nullable
   */
  private isNullable(columnDef: ColumnDefinition): boolean {
    // Primary keys: NOT NULL
    if (columnDef.primary_key) {
      return false;
    }

    // Sequence columns: NOT NULL (auto-generated)
    if (columnDef.sequence) {
      return false;
    }

    // Aggregation automations: NOT NULL (have DEFAULT 0)
    if (columnDef.automation) {
      const isAggregation = ['SUM', 'COUNT', 'MAX', 'MIN'].includes(columnDef.automation.type);
      if (isAggregation) {
        return false;  // Has DEFAULT 0
      }
      // SNAPSHOT, SYNC, LAST_VALUE: nullable (may be NULL before first update)
      return true;
    }

    // Formula columns: nullable (depends on calculation)
    if (columnDef.formula) {
      return true;
    }

    // Regular columns: nullable by default in PostgreSQL
    return true;
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
        controlled_by: 'database server',
        formula: 'SERIAL'
      };
    }

    // Case 2: Calculated column
    if (columnDef.calculated) {
      return {
        controlled_by: 'database server',
        formula: columnDef.calculated,
        managed_by: {
          type: 'trigger_calculation',
          trigger_name: `${tableName}_before_insert_genlogic`,
          evaluation_timing: 'before_write'
        }
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
          controlled_by: 'client application',
          formula: this.generateAutomationFormula(columnDef.automation, tableName, _schema),
          managed_by: managedBy
        };
      }

      // Standard automations (SUM, COUNT, etc.)
      return {
        controlled_by: 'database server',
        formula: this.generateAutomationFormula(columnDef.automation, tableName, _schema),
        managed_by: managedBy
      };
    }

    // Case 4: Generated FK column
    if (isGeneratedFK) {
      // Find which FK this belongs to
      const fkInfo = this.findForeignKeyInfo(columnName, processedTable);

      return {
        source: 'foreign_key_column',
        controlled_by: 'client application',
        references: fkInfo
      };
    }

    // Case 5: Primary key (non-sequence)
    if (columnDef.primary_key) {
      return {
        controlled_by: 'client application'
      };
    }

    // Case 6: Regular column
    return {
      controlled_by: 'client application'
    };
  }

  /**
   * Generate human-readable formula string from automation definition
   */
  private generateAutomationFormula(automation: AutomationDefinition, tableName: string, schema: GenLogicSchema): string {
    // Parse automation if it's a string
    const parsed = resolveAutomation(automation, tableName, schema);

    // RULE_MATCH automation
    if (parsed.type === 'RULE_MATCH') {
      return `RULE_MATCH(${(parsed as any).source_table})`;
    }

    // Standard automations (SUM, COUNT, etc.)
    return `${parsed.type}(${parsed.table}.${parsed.column})`;
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
    // Parse automation if it's a string
    const parsed = resolveAutomation(automation, tableName, _schema);

    // Handle RULE_MATCH automation
    if (parsed.type === 'RULE_MATCH') {
      const ruleMatch = parsed as any;
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
    const info: any = {
      type: 'trigger_aggregation',
      automation_type: parsed.type,
      source_table: parsed.table,
      source_column: parsed.column
    };

    // Determine which table has the trigger
    if (['SUM', 'COUNT', 'MAX', 'MIN', 'LATEST'].includes(parsed.type)) {
      // Aggregations: trigger is on the source (child) table
      info.trigger_name = `${parsed.table}_before_insert_genlogic`;
      info.aggregation_path = `${parsed.table}.${parsed.foreign_key || '?'} -> ${tableName}`;
      info.update_strategy = 'incremental';
      info.note = `Aggregates ${parsed.type} from ${parsed.table}.${parsed.column}`;
    } else if (['SNAPSHOT', 'SYNC'].includes(parsed.type)) {
      // SNAPSHOT: pull-only on INSERT. SYNC: pull on INSERT, push from parent on UPDATE
      info.trigger_name = parsed.type === 'SYNC'
        ? `${parsed.table}_before_update_genlogic`
        : `${tableName}_before_insert_genlogic`;
      info.cascade_path = `${parsed.table} -> ${tableName}.${parsed.foreign_key || '?'}`;
      info.update_strategy = parsed.type === 'SYNC' ? 'on_parent_change' : 'on_insert_only';
      info.note = parsed.type === 'SNAPSHOT'
        ? `Snapshot from ${parsed.table}.${parsed.column} (captured on INSERT only)`
        : `Syncs with ${parsed.table}.${parsed.column} (updated when parent changes)`;
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
   * Generate documentation for a matching table
   */
  private generateMatchingTableDoc(tableName: string, definition: MatchingTableDefinition): any {
    const resultColumn = definition.result_column_name;

    return {
      _table_info: {
        type: 'pattern_matching_table',
        description: `Auto-generated pattern matching table with fixed structure for categorization`,
        has_stored_procedures: true,
        note: 'This table uses fixed structure: id, string_match, result_column, range_low_bound, range_high_bound'
      },

      columns: {
        id: {
          type: 'SERIAL',
          primary_key: true,
          controlled_by: 'database server',
          formula: 'SERIAL'
        },
        string_match: {
          type: 'VARCHAR(200)',
          controlled_by: 'client application',
          note: 'Pattern with SQL LIKE wildcards (%, _) to match against descriptions',
          example: '%starbucks%'
        },
        [resultColumn]: {
          type: 'VARCHAR(100)',
          controlled_by: 'client application',
          note: 'The categorization result value to return when this rule matches',
          example: 'Coffee'
        },
        range_low_bound: {
          type: 'NUMERIC(10,2)',
          controlled_by: 'client application',
          nullable: true,
          note: 'Minimum numeric value constraint (NULL = no lower bound)',
          example: '10.00'
        },
        range_high_bound: {
          type: 'NUMERIC(10,2)',
          controlled_by: 'client application',
          nullable: true,
          note: 'Maximum numeric value constraint (NULL = no upper bound)',
          example: '50.00'
        }
      },

      stored_procedures: {
        match_best: {
          name: `${tableName}_match_best`,
          signature: '(p_inputs JSONB)',
          returns: 'TABLE(input_id INTEGER, matched_id INTEGER, string_match VARCHAR, result_value VARCHAR, matched_column_count INTEGER, pattern_length INTEGER)',
          description: 'Returns the best (most specific) match for each input based on matched column count and pattern length',
          usage: `-- Match multiple inputs and get best match for each\nSELECT * FROM ${tableName}_match_best(\n  '[{"id": 1, "description": "STARBUCKS PURCHASE", "amount": 5.50},\n    {"id": 2, "description": "GROCERY STORE", "amount": 45.00}]'::jsonb\n);`,
          input_format: {
            required_fields: ['id (integer)', 'description (text)'],
            optional_fields: ['amount (numeric)'],
            example: '[{"id": 1, "description": "Transaction text", "amount": 25.50}]'
          },
          ranking_logic: {
            primary: 'matched_column_count (higher is better)',
            tiebreaker: 'pattern_length (longer is more specific)',
            explanation: 'Pattern match = 1 point, range_low_bound match = +1 point, range_high_bound match = +1 point'
          }
        },
        match_all: {
          name: `${tableName}_match_all`,
          signature: '(p_inputs JSONB)',
          returns: 'TABLE(input_id INTEGER, matched_id INTEGER, string_match VARCHAR, result_value VARCHAR, matched_column_count INTEGER, pattern_length INTEGER, match_rank INTEGER)',
          description: 'Returns ALL matches for each input, ranked by specificity (match_rank = 1 is best)',
          usage: `-- Get all matching rules for review\nSELECT * FROM ${tableName}_match_all(\n  '[{"id": 1, "description": "COFFEE SHOP", "amount": 15.00}]'::jsonb\n)\nORDER BY input_id, match_rank;`,
          use_case: 'Useful for debugging rules, showing users alternatives, or implementing custom selection logic'
        }
      },

      usage_examples: {
        insert_rules: {
          simple_pattern: `-- Pattern-only rule (matches any amount)\nINSERT INTO ${tableName} (string_match, ${resultColumn}) VALUES\n  ('%coffee%', 'Beverage');`,

          with_range: `-- Pattern with amount range\nINSERT INTO ${tableName} (string_match, ${resultColumn}, range_low_bound, range_high_bound) VALUES\n  ('%restaurant%', 'Dining - Expensive', 50.00, NULL),\n  ('%restaurant%', 'Dining - Moderate', 15.00, 50.00),\n  ('%restaurant%', 'Dining - Cheap', NULL, 15.00);`,

          exact_amount: `-- Exact amount match (both bounds equal)\nINSERT INTO ${tableName} (string_match, ${resultColumn}, range_low_bound, range_high_bound) VALUES\n  ('%streaming%', 'Premium Subscription', 14.99, 14.99);`
        },

        call_functions: {
          match_best: `-- Categorize new transactions\nSELECT \n  t.transaction_id,\n  t.description,\n  t.amount,\n  m.result_value AS ${resultColumn}\nFROM transactions t\nCROSS JOIN LATERAL (\n  SELECT result_value \n  FROM ${tableName}_match_best(\n    jsonb_build_array(jsonb_build_object(\n      'id', t.transaction_id,\n      'description', t.description,\n      'amount', t.amount\n    ))\n  )\n) m\nWHERE t.${resultColumn} IS NULL;`,

          match_all: `-- Review all matching rules for debugging\nSELECT \n  input_id,\n  match_rank,\n  string_match,\n  result_value,\n  matched_column_count\nFROM ${tableName}_match_all(\n  '[{"id": 1, "description": "COFFEE SHOP PURCHASE", "amount": 7.50}]'::jsonb\n)\nORDER BY match_rank;`
        }
      },

      specificity_examples: {
        description: 'Rules are ranked by specificity: more matching constraints = higher rank',
        examples: [
          {
            rule: '%coffee% with NO range constraints',
            matched_column_count: 1,
            specificity: 'low'
          },
          {
            rule: '%coffee% with range_low_bound = 5.00',
            matched_column_count: 2,
            specificity: 'medium'
          },
          {
            rule: '%coffee% with range_low_bound = 5.00 AND range_high_bound = 10.00',
            matched_column_count: 3,
            specificity: 'high'
          }
        ],
        tiebreaker: 'If matched_column_count is equal, longer patterns win (more specific text match)'
      }
    };
  }

  /**
   * Generate usage guide section
   */
  private generateUsageGuide(): any {
    return {
      insert_pattern: `To insert data, only include columns where controlled_by = "client application".
Example for accounts:
  INSERT INTO accounts (account, category) VALUES ('Checking', 'Asset');

❌ WRONG - don't set database-controlled columns:
  INSERT INTO accounts (account, category, debits, balance) VALUES (...);`,

      update_pattern: `To update data, only modify columns where controlled_by = "client application".
Example for accounts:
  UPDATE accounts SET category = 'Liability' WHERE id = 5;

❌ WRONG - don't update database-controlled columns:
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
