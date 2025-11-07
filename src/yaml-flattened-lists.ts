// YAML Flattened Lists
//
// This is an intermediate representation that flattens the hierarchical YAML structure
// into flat lists with ZERO processing, cross-referencing, or validation.
//
// GenLogicSchema (YAML) → YamlFlattenedLists (raw flat lists) → ProcessedSchema (database reality)

import type { ForeignKeyDefinition, AutomationDefinition } from './types.js';

/**
 * YAML schema flattened into lists - NO processing, just structural transformation
 */
export interface YamlFlattenedLists {
  reusableColumns: FlattenedReusableColumn[];
  tables: FlattenedTable[];
  columns: FlattenedColumn[];
  foreignKeys: FlattenedForeignKey[];
  automations: FlattenedAutomation[];
  indexes: FlattenedIndex[];
  uniqueConstraints: FlattenedUniqueConstraint[];
  checkConstraints: FlattenedCheckConstraint[];
  seedRows: FlattenedSeedRow[];
}

/**
 * Table with basic metadata (no nested structures)
 */
export interface FlattenedTable {
  name: string;
  comment?: string;
  singleton?: boolean;
  primaryKey?: string[];  // Composite primary key column names
}

/**
 * Column definition with table context - flattened and PARSED
 */
export interface FlattenedColumn {
  tableName: string;
  columnName: string;

  // Parsed SQL type fields (from parseSQLType)
  type?: string;            // SQL type (e.g., "integer", "varchar", "numeric")
  size?: number;            // Size for varchar, char, bit
  decimal?: number;         // Decimal places for numeric/decimal
  primary_key?: boolean;    // PRIMARY KEY constraint
  unique?: boolean;         // UNIQUE constraint
  not_null?: boolean;       // NOT NULL constraint
  sequence?: boolean;       // AUTO INCREMENT (from serial types)
  default?: string;         // DEFAULT value

  // GenLogic properties
  automation?: string;      // Automation expression
  formula?: string;         // Formula expression
  format?: string;          // Display format hint
  label?: string;           // Display label
  comment?: string;         // Human-readable description
  $ref?: string;            // Reference to reusable column (raw, not resolved yet)

  [key: string]: any;       // Allow other properties to pass through
}

/**
 * Foreign key with table context attached - fully flattened
 *
 * New simplified syntax:
 * - childTable: table that HAS the FK
 * - parentTable: table being referenced
 * - childColumn: column name in child table (null = inferred)
 * - notNull: whether FK column is NOT NULL
 * - delete: 'restrict' or 'cascade'
 * - autoCreateParent: auto-create parent row if missing
 */
export interface FlattenedForeignKey {
  childTable: string;       // Child table (table that HAS the FK)
  fkName: string;           // FK name from YAML (used by automation parser)
  parentTable: string;      // Parent table (referenced table)
  childColumn: string | null;  // Child column name (null = inferred from parent table/PK)
  notNull: boolean;         // NOT NULL constraint
  delete: 'restrict' | 'cascade';  // ON DELETE action
  autoCreateParent: boolean;  // Auto-create parent row if referenced value doesn't exist
}

/**
 * Automation with full context
 */
export interface FlattenedAutomation {
  tableName: string;
  columnName: string;
  automation: AutomationDefinition;
}

/**
 * Index with table context
 */
export interface FlattenedIndex {
  tableName: string;
  columns: string[];
}

/**
 * Unique constraint with table context
 */
export interface FlattenedUniqueConstraint {
  tableName: string;
  columns: string[];
}

/**
 * CHECK constraint with table context
 */
export interface FlattenedCheckConstraint {
  tableName: string;
  expression: string;  // The constraint expression (with @column_name syntax)
}

/**
 * Seed row with table context
 */
export interface FlattenedSeedRow {
  tableName: string;
  data: Record<string, any>;
}

/**
 * Reusable column definition - flattened and PARSED
 */
export interface FlattenedReusableColumn {
  name: string;

  // Parsed SQL type fields (from parseSQLType)
  type?: string;            // SQL type (e.g., "integer", "varchar", "numeric")
  size?: number;            // Size for varchar, char, bit
  decimal?: number;         // Decimal places for numeric/decimal
  primary_key?: boolean;    // PRIMARY KEY constraint
  unique?: boolean;         // UNIQUE constraint
  not_null?: boolean;       // NOT NULL constraint
  sequence?: boolean;       // AUTO INCREMENT (from serial types)
  default?: string;         // DEFAULT value

  // GenLogic properties
  automation?: string;      // Automation expression
  formula?: string;         // Formula expression
  format?: string;          // Display format hint
  label?: string;           // Display label
  comment?: string;         // Human-readable description

  [key: string]: any;       // Allow other properties to pass through
}
