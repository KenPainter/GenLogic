// GenLogic Type Definitions
// CORE PRINCIPLE: Foreign keys are DATA PIPELINES that create columns AND automation pathways

export interface DatabaseConfig {
  database: string;
  user: string;
  dryRun: boolean;
}

// YAML Schema Types - matches our JSON Schema structure
export interface GenLogicSchema {
  columns?: Record<string, ColumnDefinition>;
  tables?: Record<string, TableDefinition>;
  matching_tables?: Record<string, MatchingTableDefinition>;
}

export interface MatchingTableDefinition {
  comment?: string;
  result_column_name: string;
}

export interface ColumnDefinition {
  // SCHEMA INPUT: User provides either 'definition' (SQL string) OR individual fields below
  definition?: string;  // Full SQL definition string (e.g., "varchar(100) not null default 'foo'")

  // PROCESSED OUTPUT: After parsing SQL definition string
  type?: string;        // Base SQL type (e.g., "varchar", "integer") - populated by parser
  size?: number;
  decimal?: number;
  primary_key?: boolean;
  unique?: boolean;
  not_null?: boolean;
  sequence?: boolean;
  default?: string;

  // GenLogic features (input and output)
  automation?: AutomationDefinition;
  generated?: string;
  comment?: string;
  label?: string;      // Human-readable label for UI display
  format?: string;     // Format hint (e.g., 'currency', 'date', 'email')
}

export interface TableDefinition {
  comment?: string;
  columns?: Record<string, TableColumnDefinition>;
  foreign_keys?: Record<string, ForeignKeyDefinition | string>;  // String = simple shorthand
  unique_constraints?: string[][];  // Array of column name arrays: [['col1', 'col2'], ['col3', 'col4']]
  indexes?: string[][];  // Array of column name arrays: [['col1'], ['col2', 'col3']]
  'seed-rows'?: Record<string, any>[];
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
  comment?: string;
  table: string;    // VALIDATION REQUIRED: Must exist in 'tables' section
  prefix?: string;
  suffix?: string;
  not_null?: boolean;
  delete?: 'restrict' | 'cascade';
  auto_create_parent?: boolean;  // Auto-create parent row when child references non-existent parent
  auto_create?: AutoCreateDefinition;  // FK-following auto-creation (sync/spread)
}

export interface AutoCreateDefinition {
  on: ('insert' | 'update' | 'delete')[];  // Which operations trigger auto-creation
  spread?: {
    start: string;              // Column name in parent table
    end: string;                // Column name in parent table
    interval: string;           // Column name in parent table
    generated_column: string;   // Column name in this (child) table
  };
  copy_columns?: Record<string, string>;  // parent_col: child_col
  literals?: Record<string, string>;      // child_col: 'literal value'
  filter?: string;  // Optional SQL WHERE condition
}

export type AutomationDefinition =
  | string  // New format: "SUM table.column" or "SUM(fk_name) table.column"
  | RuleMatchAutomationDefinition;

// Parsed/normalized automation definition (internal use)
export interface ParsedStandardAutomation {
  type: 'SUM' | 'COUNT' | 'MAX' | 'MIN' | 'LAST_VALUE' | 'SNAPSHOT' | 'SYNC' | 'DOMINANT' | 'QUEUEPOS';
  table: string;      // VALIDATION REQUIRED: Must exist in 'tables' section
  foreign_key?: string; // VALIDATION REQUIRED: Must exist if specified, inferred if omitted
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