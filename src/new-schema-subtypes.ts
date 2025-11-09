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

export interface TableDef {
  pkColumn?: string;
  pkDefinition?: string;
  // As we build it out:
  columns?: Record<string, any>;
  foreignKeys?: ForeignKeyDef[];
  columnRefs?: Array<{ sourceColumn: string; referencedColumn: string }>;
  columnEdges?: Array<[string, string]>;  // For topological sort of formulas
  constraints?: any[];
  indexes?: any[];
}
