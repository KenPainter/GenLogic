// GenLogic Type Definitions
// CORE PRINCIPLE: Foreign keys are DATA PIPELINES that create columns AND automation pathways

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  dryRun: boolean;
  testMode?: boolean;
}

// YAML Schema Types - matches our JSON Schema structure
export interface GenLogicSchema {
  columns?: Record<string, ColumnDefinition>;
  tables?: Record<string, TableDefinition>;
}

export interface ColumnDefinition {
  type: string;
  size?: number;
  decimal?: number;
  primary_key?: boolean;
  unique?: boolean;
  sequence?: boolean;
  automation?: AutomationDefinition;
  calculated?: string;
  'ui-notes'?: ('read-only' | 'hidden')[];
}

export interface TableDefinition {
  'ui-notes'?: UINote[];
  sync?: Record<string, SyncDefinition>;
  spread?: Record<string, SpreadDefinition>;
  columns?: Record<string, TableColumnDefinition>;
  foreign_keys?: Record<string, ForeignKeyDefinition>;
  content?: Record<string, any>[];
}

export type UINote = 'singleton' | 'no-insert' | 'no-update' | 'no-delete';

export interface SyncDefinition {
  direction?: 'push' | 'pull' | 'bidirectional';
  operations?: ('insert' | 'update' | 'delete')[];
  match_columns: Record<string, string>;  // source_col: target_col - always propagated
  match_conditions?: string[];  // Extra WHERE conditions (not propagated)
  column_map?: Record<string, string>;  // Data columns to sync
  literals?: Record<string, string>;  // Constants (INSERT only)
}

export interface SpreadDefinition {
  operations?: ('insert' | 'update' | 'delete')[];
  generate: {
    start_date: string;  // Column name for start date
    end_date: string;    // Column name for end date
    interval: string;    // Column name for interval (e.g., '1 month', '14 days')
  };
  column_map?: Record<string, string>;  // Data columns to spread
  literals?: Record<string, string>;  // Constants for generated rows
  tracking_column: string;  // FK column in target that points back to source
}

// Mixed inheritance syntax for table columns
export type TableColumnDefinition =
  | null                           // Empty - inherit same name
  | string                         // String - inherit named column
  | ColumnReference                // Object with $ref - inherit + override
  | ColumnDefinition;              // Full definition - no inheritance

export interface ColumnReference extends Partial<ColumnDefinition> {
  $ref: string; // VALIDATION REQUIRED: Must exist in top-level 'columns' section
}

export interface ForeignKeyDefinition {
  table: string;    // VALIDATION REQUIRED: Must exist in 'tables' section
  prefix?: string;
  suffix?: string;
  delete?: 'restrict' | 'cascade';
}

export type AutomationDefinition =
  | StandardAutomationDefinition
  | RuleMatchAutomationDefinition;

export interface StandardAutomationDefinition {
  type: 'SUM' | 'COUNT' | 'MAX' | 'MIN' | 'LATEST' | 'SNAPSHOT' | 'FOLLOW' | 'DOMINANT' | 'QUEUEPOS';
  table: string;      // VALIDATION REQUIRED: Must exist in 'tables' section
  foreign_key: string; // VALIDATION REQUIRED: Must exist in specified table's foreign_keys section
  column: string;
}

export interface RuleMatchAutomationDefinition {
  type: 'RULE_MATCH';
  mode: 'stored_procedure';  // Future: could add 'trigger' or 'hybrid'
  source_table: string;  // VALIDATION REQUIRED: Must exist in 'tables' section
  source_columns: {
    match_column: string;      // Column in source that specifies which destination column to match
    operator: string;          // Column in source that specifies comparison operator
    compare_value: string;     // Column in source with the pattern to match
    target_value: string;      // Column in source with value to set in destination
    priority: string;          // Column in source for tie-breaking
  };
  destination_columns: string[];  // VALIDATION REQUIRED: Must exist in destination table
  operators: ('equals' | 'starts_with' | 'contains' | 'ends_with')[];
  overwrite_policy?: 'always' | 'if_null' | 'never';  // Default: if_null
}

// Data Flow Graph Types - for cycle detection and validation
export interface DataFlowGraph {
  nodes: Set<string>;
  edges: Map<string, Set<string>>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Database Schema Introspection Types
export interface DatabaseTable {
  name: string;
  columns: DatabaseColumn[];
  foreignKeys: DatabaseForeignKey[];
  indexes: DatabaseIndex[];
  triggers: DatabaseTrigger[];
}

export interface DatabaseColumn {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey: boolean;
  isUnique: boolean;
}

export interface DatabaseForeignKey {
  name: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete: string;
}

export interface DatabaseIndex {
  name: string;
  columns: string[];
  isUnique: boolean;
}

export interface DatabaseTrigger {
  name: string;
  table: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  when: 'BEFORE' | 'AFTER';
  isGenLogicTrigger: boolean; // Based on naming convention
}