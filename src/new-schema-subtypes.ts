/**
 * NewSchema Subtypes
 *
 * All type definitions used by NewSchema are collected here
 * to keep new-schema.ts focused on the class implementation.
 *
 * CONVENTION: Always import subtypes from this file, not from new-schema.ts
 *
 * ⚠️ CRITICAL: THESE TYPE DEFINITIONS MUST NOT CHANGE! ⚠️
 *
 * These types are used for BOTH desired schema (YAML) and live schema (database).
 * The diff engine relies on identical structure for comparison.
 *
 * If you need to add fields:
 * - Make them OPTIONAL (use ?)
 * - Document in docs/architecture/newschema-limitations.md
 * - NEVER remove or rename existing fields
 * - NEVER change field types
 */

export interface SchemaError {
  location: string;  // Navigator: e.g. "ledger.amount.formula" or "account.balance"
  message: string;
}

export interface ForeignKeyDef {
  name: string;              // Generated name for DDL: e.g. "fk_transactions_account_id"
  childColumn: string;       // e.g. "account_id"
  parentTable: string;       // e.g. "accounts"
  parentColumn: string;      // e.g. "account_id"
  deleteAction?: string;     // e.g. "cascade", "restrict", "set null", etc.
  autoCreateParent?: boolean;
}

export interface ConstraintDef {
  name: string;
  expression?: string;  // Optional: inner expression (for backward compatibility)
  constraint_definition: string;  // Required: PostgreSQL format CHECK (...) for apples-to-apples comparison
}

export interface UniqueConstraintDef {
  name: string;
  columns: string[];
}

export interface IndexDef {
  name: string;
  columns: string[];
}

/**
 * Column Definition
 *
 * NAMING CONVENTION: Property names align with PostgreSQL's information_schema.columns
 * This ensures apples-to-apples comparison between desired (YAML) and live (database) schemas.
 *
 * The desired schema parses user's SQL strings into these properties.
 * The live schema maps directly from PostgreSQL's information_schema to these properties.
 * Both use the same rebuildDefinitionString() to create normalized comparison strings.
 *
 * Special handling ("the wart"):
 * - `serial`: Computed on both sides (from "serial" keyword in YAML, or nextval() in live DB)
 */
export interface ColumnDef {
  // User's original definition string (YAML only, not in live schema)
  definition?: string;

  // PostgreSQL-aligned properties (used by both desired and live schemas)
  type: string;                        // e.g., "integer", "character varying", "numeric"
  character_maximum_length?: number;   // For varchar, char, text types
  numeric_precision?: number;          // For numeric, decimal types
  numeric_scale?: number;              // For numeric, decimal types (decimal places)
  nullable?: boolean;                  // TRUE if nullable, FALSE if NOT NULL (matches PG convention)
  isPrimaryKey?: boolean;              // TRUE if primary key
  isUnique?: boolean;                  // TRUE if unique constraint
  defaultValue?: string;               // Default value expression

  // GenLogic-specific properties
  serial?: boolean;                    // THE WART: TRUE if auto-increment (serial/bigserial/smallserial)
  formula?: string;                    // GenLogic formula expression
  automation?: string;                 // GenLogic automation expression
  automationType?: string;             // SUM, COUNT, MIN, MAX, etc.
  automationSourceTable?: string;
  automationSourceColumn?: string;
  automationFKColumn?: string;
  automationWhereClause?: string;      // Optional WHERE clause for filtered aggregations

  // Metadata
  label?: string;
  comment?: string;
  format?: string;

  // Normalized comparison string (built by rebuildDefinitionString)
  normalizedDef?: string;
}

export interface TableDef {
  pkColumn?: string;
  pkDefinition?: string;
  comment?: string;
  layer?: number;  // Topological layer for FK dependencies (for inspection)
  columnLayers?: Record<number, string[]>;  // Layers for formula columns (JSON-dumpable)
  columns?: Record<string, ColumnDef>;
  foreignKeys?: Record<string, ForeignKeyDef>;  // Keyed by FK name for easy diffing
  columnRefs?: Array<{ sourceColumn: string; referencedColumn: string }>;
  columnEdges?: Array<[string, string]>;  // For topological sort of formulas
  seedRows?: any[];
  constraints?: Record<string, ConstraintDef>;  // Keyed by constraint name for easy diffing
  uniqueConstraints?: Record<string, UniqueConstraintDef>;  // Keyed by constraint name for easy diffing
  indexes?: Record<string, IndexDef>;  // Keyed by index name for easy diffing
}
