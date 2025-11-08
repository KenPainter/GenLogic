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
