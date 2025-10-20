Previous: [Introduction](00-introduction.md) | Next: [Numeric Integrity](20-numeric-integrity.md)

# Schema Validation

GenLogic validates schema files to catch syntax errors, invalid patterns, and structure problems during development.

## Use Cases

- Catch typos in property names before deployment
- Enforce naming conventions for tables and columns
- Validate automation syntax patterns
- Ensure PostgreSQL identifier length limits (63 characters)

## Simple Example

Invalid schema with typo:

```yaml
tables:
  users:
    colums:  # Typo: should be "columns"
      id: serial primary key
```

GenLogic immediately rejects this:

```
Error: Unknown property: colums
```

## Two-Stage Validation

GenLogic performs validation in two stages:

Stage 1: YAML and JSON Schema Validation (Phase 02)
- Validates YAML syntax is correct
- Validates schema structure against genlogic-schema.json
- Validates naming patterns (table names, column names, etc.)
- Validates PostgreSQL identifier length limits (63 characters)
- No database connection required

Stage 2: Runtime Validation (Phase 04)
- Validates references (columns, tables) actually exist
- Detects circular dependencies in automations and formula columns
- Validates foreign key relationships
- Validates index and constraint references
- Requires schema processing, before database operations

This document covers Stage 1: Schema Validation. Stage 2 validations are documented in their respective feature pages.

## What Gets Validated

### YAML Syntax

The schema file must be valid YAML. Common errors:
- Inconsistent indentation (use spaces, not tabs)
- Missing colons after keys
- Unquoted strings starting with special characters (@, $, etc.)

Example error:
```
Error: Invalid YAML syntax at line 15
```

### Table and Column Name Patterns

Names must start with a letter or underscore, followed by letters, numbers, or underscores.

Valid names:
- users
- order_items
- _internal_table
- table123

Invalid names:
- 123users (starts with number)
- my-table (contains hyphen)
- my table (contains space)
- @table (starts with special character)

### PostgreSQL Identifier Length Limit

PostgreSQL limits identifiers to 63 characters. GenLogic enforces this at validation time.

Invalid:
```yaml
tables:
  table_name_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:  # 64 chars - TOO LONG
```

Error:
```
Table name exceeds PostgreSQL's 63-character limit
```

This applies to:
- Table names
- Column names
- Reusable column names
- Foreign key names
- Index names

### Required Fields

Some features require specific fields. For example, matching_table requires result_column_name:

Invalid:
```yaml
matching_tables:
  tax_rates:
    # Missing result_column_name
```

Error:
```
matching_table requires result_column_name
```

### Unknown Properties

GenLogic uses additionalProperties: false in the JSON Schema to reject unknown properties. This catches typos early.

Invalid:
```yaml
tables:
  users:
    colums:  # Typo: should be "columns"
      id: serial primary key
```

Error:
```
Unknown property: colums
```

### Automation Format

Automations must follow the pattern OPERATION @table.column:

Valid:
- SUM @orders.amount
- COUNT @transactions.id
- MAX @payments.date

Invalid:
- SUM orders.amount (missing @)
- SUM @orders (missing column)
- SUMM @orders.amount (typo in operation)

These are caught by JSON Schema pattern validation.

## IDE Integration

GenLogic schemas support real-time validation in your IDE. See [IDE Support](../90-application/10-ide-support.md) for setup instructions for VS Code, IntelliJ, Vim, and other editors.

## Test Coverage

This section lists tests that verify schema validation works correctly.

### Valid Schemas
- [x] [Valid minimal schema](../../tests/02-schema-validation/valid-minimal-schema) - Basic valid schema accepted

### YAML Parsing
- [x] [Invalid YAML syntax](../../tests/02-schema-validation/invalid-yaml) - Malformed YAML rejected

### JSON Schema Validation (Third-Party)

The following validations are performed by the AJV JSON Schema validator (third-party tool):

- [3] [Unknown top-level key](../../tests/02-schema-validation/unknown-top-level-key) - JSON Schema rejects invalid properties
- [3] [Invalid table name pattern](../../tests/02-schema-validation/invalid-table-name-pattern) - Table name must match pattern
- [3] [Invalid column name pattern](../../tests/02-schema-validation/invalid-column-name-pattern) - Column name must match pattern
- [3] [Table name exceeds 63 chars](../../tests/02-schema-validation/table-name-exceeds-63-chars) - PostgreSQL identifier length limit
- [3] [Column name exceeds 63 chars](../../tests/02-schema-validation/column-name-exceeds-63-chars) - PostgreSQL identifier length limit
- [3] [Reusable column name exceeds 63 chars](../../tests/02-schema-validation/reusable-column-name-exceeds-63-chars) - PostgreSQL identifier length limit
- [3] [Invalid automation format](../../tests/02-schema-validation/invalid-automation-format) - Automation must match pattern
- [3] [Missing required field](../../tests/02-schema-validation/missing-required-field-matching-table) - matching_table requires result_column_name

Notation: [3] indicates validation performed by third-party JSON Schema validator (AJV), not GenLogic code.

---

Previous: [Introduction](00-introduction.md) | Next: [Numeric Integrity](20-numeric-integrity.md)
