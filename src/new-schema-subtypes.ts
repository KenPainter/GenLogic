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

export interface TableDef {
  pkColumn?: string;
  pkDefinition?: string;
  // As we build it out:
  columns?: Record<string, any>;
  constraints?: any[];
  indexes?: any[];
}
