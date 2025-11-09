/**
 * NewSchema Subtypes
 *
 * All type definitions used by NewSchema are collected here
 * to keep new-schema.ts focused on the class implementation.
 *
 * CONVENTION: Always import subtypes from this file, not from new-schema.ts
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
  expression: string;
}

export interface UniqueConstraintDef {
  name: string;
  columns: string[];
}

export interface IndexDef {
  name: string;
  columns: string[];
}

export interface TableDef {
  pkColumn?: string;
  pkDefinition?: string;
  comment?: string;
  layer?: number;  // Topological layer for FK dependencies (for inspection)
  columnLayers?: Record<number, string[]>;  // Layers for formula columns (JSON-dumpable)
  // As we build it out:
  columns?: Record<string, any>;
  foreignKeys?: Record<string, ForeignKeyDef>;  // Keyed by FK name for easy diffing
  columnRefs?: Array<{ sourceColumn: string; referencedColumn: string }>;
  columnEdges?: Array<[string, string]>;  // For topological sort of formulas
  seedRows?: any[];
  constraints?: Record<string, ConstraintDef>;  // Keyed by constraint name for easy diffing
  uniqueConstraints?: Record<string, UniqueConstraintDef>;  // Keyed by constraint name for easy diffing
  indexes?: Record<string, IndexDef>;  // Keyed by index name for easy diffing
}
