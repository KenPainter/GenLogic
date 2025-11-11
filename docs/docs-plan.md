# GenLogic Documentation Plan

This document outlines the documentation structure based on the test suite.

## 1. Core Relational Features

Topics from core-relational test suite:

- Database bootstrap and schema evolution
- Primary keys (serial, integer, UUID)
- Foreign keys (basic, multi-level, self-referential, multiple FKs)
- Delete actions (cascade, set null, restrict, set default)
- Layer ordering and dependency resolution
- Unique constraints (single column, composite)
- Check constraints
- Not null constraints
- Auto-generated indexes
- Custom indexes
- Idempotency and no-change rebuilds
- Schema normalization
- Live schema detection

## 2. Column Automations

Topics from column-automations test suite:

### 2.1 SYNC Automation
- Basic SYNC on insert
- SYNC on FK update
- SYNC on parent update
- SYNC behavior vs SNAPSHOT

### 2.2 SNAPSHOT Automation
- Basic SNAPSHOT on insert
- SNAPSHOT on FK update
- SNAPSHOT ignores parent updates
- SNAPSHOT vs SYNC comparison

### 2.3 Aggregations
- SUM (on insert, update, delete, FK change, multiple aggregations)
- COUNT (on insert, FK change, delete)
- MAX/MIN (basic, on delete, on update)

### 2.4 Formula Columns
- Arithmetic formulas
- String formulas
- Formula dependencies and execution order

## 3. Schema Reusable Tokens

Topics from schema-reusable-tokens test suite:

- Constants (numeric, string)
- Constant substitution in column definitions
- Reusable column definitions
- Column extensions with reusable tokens

## 4. Seed Data

Topics from seed-rows test suite:

- Basic seed-rows property
- Seed data with foreign keys
- Seed data with automations
- Seed data with formulas
- Idempotency (ON CONFLICT DO NOTHING)

## 5. Auto-Create Parent

Topics from auto-create-parent test suite:

- Basic auto-create parent feature
- Concurrent auto-create scenarios
- Multi-level auto-create
- Interaction with existing parent rows

## 6. Complex Business Logic

Topics from complex-biz-logic test suite:

- Formula → FK → SYNC → Formula chains
- Safe loop handling
- Cascading calculations (discount scenarios)

## 7. Data Protections

Topics from protections test suite:

- NaN protection for numeric types
- Infinity protection for numeric types
- Check constraint generation

## 8. Schema Errors and Validation

Topics from schema-errors test suite (need to explore):

- Invalid schema detection
- Error messages
- Validation rules

## Documentation Organization

Suggested hierarchy:

```
docs/
  01-getting-started/
    - basic-concepts
      - description of "Augmented Normalization"
        - normalized base with materialized calculations
        - non-subvertible calculated columns
      - GenLogic never drops tables or columns (OK to repeat this)
      - DRY and explicit syntax
    - benefits of Augmented Normalization
      - business logic is
        - formally verifiable based on DAG
        - declarative and DRY
      - application code
        - no ORM or similar abstraction bloat
        - much simpler application code
    - installation
    - quick-start
    - coding schemas with AI assistants

  02-table-and-column-basics/
    - basic YAML: tables and columns
    - column definition syntax
      - supported properties
      - limitations (like no check constraints)
    - specifying a primary key
      - limit 1 column
    - foreign keys
      - basic syntax
      - multiple foreign keys
      - delete actions (cascade, set null, restrict, set default)
      - what Genlogic creates
      - Self-referential FKs are supported
    - table level indexes
      - auto-generated indexes (for FKs, etc)
    - table level unique constraints
    - table level check constraints
    - not null constraints
    - schema evolution
      - live schema detection
      - adding tables and columns
      - modifying existing schemas

  03-column-automations/
    - sync-automation
    - snapshot-automation
    - aggregations
    - formula-columns

  04-schema-features/
    - constants
    - reusable-columns
    - seed-data
    - auto-create-parent

  05-advanced/
    - dependency-chains
    - complex-business-logic

  06-protections
    - idempotency
    - no table drops or column drops
    - NaN and Infinity data-protections
    - Non-subvertible calculations (not yet implemented)
    - cycle detection
      - in foreign keys, the table DAG
      - in formulas and automations, the column DAG

  07-reference/
    - yaml-schema (might be the AI assistant context)
    - cli-commands
    - error-messages
    - schema normalization (how GenLogic internally represents schemas)


```

## Notes

Each topic should include:
- Syntax examples from tests
- Use cases
- Behavior on insert/update/delete
- Interaction with other features
- Common pitfalls

Tests provide executable examples for all documentation.
