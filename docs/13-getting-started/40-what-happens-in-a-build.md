Previous: [Accessing the Database](30-accessing-the-database.md) | Next: [Coding with AI](50-coding-with-ai.md)

# What Happens in a Build

## Build Stages

The GenLogic build process follows these stages:
- Parse the YAML schema definition
- Conduct inferences, parse definitions, define edges at table and column levels
- Topologically sort tables into layers and detect foreign key cycles. Throws if cycles detected.
- Topologically sort columns into layers and detect calculation cycles. Throws if cycles detected.
- Compare schema to the live database
- Calculate diff
- Generate DDL
- Execute DDL

## Non-Destructive

A GenLogic build never drops tables or columns. GenLogic ignores tables and columns in the live database that are not in the YAML schema.

A "drop script" is generated with every build so the DBA can, at their discretion, drop unused or defunct columns and tables.

This means that if a foreign key column is removed from the schema, GenLogic will leave the column, but recognize that the constraint and the index on the live table are not specified in the schema, and it will drop them.

## Adds and Changes

A GenLogic DDL will:
- Create new tables
- Add or alter columns
- Drop check constraints, indexes, and unique constraints that are in the live database, on tables referenced in the schema, that do not match what is specified in the schema
- Add check constraints, indexes, and unique constraints that are in the schema but not in the live database
- ALWAYS drop all triggers on all tables referenced in the schema
- ALWAYS rebuild all triggers on all tables referenced in the schema. These triggers implement column automations and formulas
- INSERT seed rows (on conflict do nothing)

Comparisons of constraints, indexes and unique constraints are not based on names but on the substance of the elements.

## Idempotent

GenLogic builds are idempotent, or "rerunnable". Once a database is built, a second run of GenLogic will make no changes, except for the universal behavior of dropping and redefining all triggers.

## NaN Rejection

GenLogic puts a constraint on all numeric columns that will reject NaN, Infinity, and -Infinity.

This is because GenLogic was originally written to handle line-of-business applications where these values have no place.

## Safe Calculation of Materialized Values

GenLogic will fail a build if there are cycles in the foreign key relationships between tables, or if there are cycles in the automations and formulas for calculated columns.

With no cycles, a GenLogic-built database guarantees:
- Termination: All calculations will complete in finite time
- Determinism: Given the same DML to the same database, calculated values always produce the same result
- Consistency: All dependent values are computed after their dependencies
- No race conditions: No calculation can see an inconsistent intermediate state, no query will see intermediate state

---

Previous: [Accessing the Database](30-accessing-the-database.md) | Next: [Coding with AI](50-coding-with-ai.md)
