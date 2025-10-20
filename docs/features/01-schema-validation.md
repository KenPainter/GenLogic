Previous: [Moving Values from Child to Parent](../30-column-automation/30-child-to-parent.md) | Next: [Non-Subvertible Calculations](02-non-subvertible-calculations.md)

# Schema Validation

GenLogic validates your schema files **before** connecting to the database. This ensures that syntax errors, invalid patterns, and schema structure problems are caught early, providing immediate feedback during development.

## Two-Stage Validation

GenLogic performs validation in two stages:

1. **YAML Parsing and JSON Schema Validation** (Phase 02)
   - Validates YAML syntax is correct
   - Validates schema structure against `genlogic-schema.json`
   - Validates naming patterns (table names, column names, etc.)
   - Validates PostgreSQL identifier length limits (63 characters)
   - **No database connection required**

2. **Runtime Validation** (Phase 04)
   - Validates references (columns, tables) actually exist
   - Detects circular dependencies in automations and generated columns
   - Validates foreign key relationships
   - Validates index and constraint references
   - **Requires schema processing, before database operations**

This document covers **Stage 1: Schema Validation**. Stage 2 validations are documented in their respective feature pages.

## IDE Support

GenLogic schema files can be validated in real-time by your IDE or text editor.

### VS Code

Add this to the top of your schema file:

```yaml
# yaml-language-server: $schema=../src/genlogic-schema.json
```

Adjust the path to point to your `genlogic-schema.json` file. VS Code will:
- Validate schema structure as you type
- Show errors inline with red squiggles
- Provide autocomplete for valid properties
- Show documentation on hover

### Other IDEs

Most modern IDEs with YAML support can use JSON Schema for validation:
- **IntelliJ IDEA**: Supports JSON Schema validation natively
- **Sublime Text**: Install "LSP-yaml" package
- **Vim/Neovim**: Use ALE or coc.nvim with yaml-language-server

### Command-Line Validation

You can also validate schemas without running GenLogic by using a JSON Schema validator like AJV:

```bash
npm install -g ajv-cli
ajv validate -s src/genlogic-schema.json -d your-schema.yaml
```

## What Gets Validated

### YAML Syntax

The schema file must be valid YAML. Common errors:
- Inconsistent indentation (use spaces, not tabs)
- Missing colons after keys
- Unquoted strings starting with special characters (`@`, `$`, etc.)

Example error:
```
Error: Invalid YAML syntax at line 15
```

### Table and Column Name Patterns

Names must start with a letter or underscore, followed by letters, numbers, or underscores.

**Valid names:**
- `users`
- `order_items`
- `_internal_table`
- `table123`

**Invalid names:**
- `123users` (starts with number)
- `my-table` (contains hyphen)
- `my table` (contains space)
- `@table` (starts with special character)

### PostgreSQL Identifier Length Limit

PostgreSQL limits identifiers to 63 characters. GenLogic enforces this at validation time.

**Valid:**
```yaml
tables:
  table_name_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:  # 64 chars - TOO LONG
```

**Error:**
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

Some features require specific fields. For example, `matching_table` requires `result_column_name`:

**Invalid:**
```yaml
matching_tables:
  tax_rates:
    # Missing result_column_name
```

**Error:**
```
matching_table requires result_column_name
```

### Unknown Properties

GenLogic uses `additionalProperties: false` in the JSON Schema to reject unknown properties. This catches typos early.

**Invalid:**
```yaml
tables:
  users:
    colums:  # Typo: should be "columns"
      id: serial primary key
```

**Error:**
```
Unknown property: colums
```

### Automation Format

Automations must follow the pattern `OPERATION @table.column`:

**Valid:**
- `SUM @orders.amount`
- `COUNT @transactions.id`
- `MAX @payments.date`

**Invalid:**
- `SUM orders.amount` (missing `@`)
- `SUM @orders` (missing column)
- `SUMM @orders.amount` (typo in operation)

These are caught by JSON Schema pattern validation.

## Benefits of Early Validation

1. **Fast Feedback**: Errors are caught before database operations
2. **IDE Integration**: See errors as you type
3. **Clear Error Messages**: JSON Schema provides specific error locations
4. **Documentation**: JSON Schema documents valid syntax patterns
5. **No Database Required**: Validate schemas offline

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

**Notation**: `[3]` indicates validation performed by third-party JSON Schema validator (AJV), not GenLogic code.

---

Previous: [Moving Values from Child to Parent](../30-column-automation/30-child-to-parent.md) | Next: [Non-Subvertible Calculations](02-non-subvertible-calculations.md)
