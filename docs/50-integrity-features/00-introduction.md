Previous: [Spreading Parent to Multiple Children](../40-row-automation/20-spread-to-children.md) | Next: [Schema Validation](10-schema-validation.md)

# Data Integrity Features

GenLogic extends traditional database integrity (primary keys, foreign keys) 
with additional protections for automated columns and schema evolution.

## What This Section Covers

Schema Validation - Catch errors before deployment with
two-stage validation: YAML/JSON Schema checks before database connection, 
and runtime validation of references and dependencies.

Numeric Integrity - Automatic protection from NaN and Infinity values 
that corrupt calculations. GenLogic adds CHECK constraints to all numeric columns.

Calculation Integrity - Automated and formula columns are non-subvertible - 
applications cannot corrupt calculated values through direct writes.
Enforced via triggers and column-level permissions.

Additive Changes Only - GenLogic never destroys data. All schema changes 
are additive: create tables, add columns, widen types - but never drop or narrow.

These protections ensure that your database maintains integrity as the 
schema evolves and as automated columns calculate values
across INSERT, UPDATE, and DELETE operations.

---

Previous: [Spreading Parent to Multiple Children](../40-row-automation/20-spread-to-children.md) | Next: [Schema Validation](10-schema-validation.md)
