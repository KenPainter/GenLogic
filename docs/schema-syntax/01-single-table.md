Previous: [CLI Usage](../installation-and-usage/20-cli-usage.md) | Next: [Reusable Columns](02-reusable-columns.md)

# Single Table Definition

A GenLogic schema defines one or more tables with their columns and data types.

## Basic Structure

```yaml
tables:
  table_name:
    columns:
      column_name: *any valid PostgreSQL type*
```

## Complete Example with All Column Types

```yaml
tables:
  products:
    columns:
      # Integer types
      id: serial primary key
      stock_count: bigint
      priority: smallint

      # Text types
      name: varchar(100)
      code: char(10)
      description: text

      # Numeric types with precision
      price: numeric(10,2)
      weight: decimal(8,3)
      unlimited_precision: numeric

      # Floating point
      ratio: real
      precise_ratio: double precision

      # Boolean
      active: boolean

      # Date and time
      manufacture_date: date
      created_at: timestamp
      updated_at: timestamptz

      # Other types
      external_id: uuid
      bit_flags: bit(8)
      settings: json
      metadata: jsonb
```

## Column Definition Formats

### SQL String (Simple)
The simplest format uses SQL definition strings directly:

```yaml
columns:
  id: serial primary key
  name: varchar(100) not null unique
  balance: numeric(15,2) default 0
  created_at: timestamp default NOW()
```

### Object Format (For GenLogic Features)
Use object format when you need GenLogic-specific features like automation or generated columns:

```yaml
columns:
  total_sales:
    definition: numeric(12,2)
    automation: SUM @orders.amount
    comment: Total from all orders

  net_balance:
    definition: numeric(15,2)
    # use quotes if the first symbol is @ in the string
    generated: "@debits - @credits"
    comment: Calculated balance
```

## Data Type Reference

### Integer Types
- integer - 4-byte integer
- bigint - 8-byte integer
- smallint - 2-byte integer
- serial - Auto-incrementing integer
- bigserial - Auto-incrementing bigint

### Text Types
- varchar(n) - Variable-length text, size required
- char(n) - Fixed-length text, size required
- text - Unlimited length text

### Numeric Types
- numeric(p,s) - Exact decimal with precision and scale
- decimal(p,s) - Same as numeric
- numeric - Unlimited precision
- real - 4-byte floating point
- double precision - 8-byte floating point

### Boolean
- boolean - true/false values

### Date and Time
- date - Calendar date
- timestamp - Date and time without timezone
- timestamptz - Date and time with timezone

### Other Types
- uuid - Universally unique identifier
- bit(n) - Fixed-length bit string
- json - JSON data
- jsonb - Binary JSON data (indexable)

### SQL Constraints
You can combine types with constraints:
- not null - Prevents NULL values
- unique - Ensures unique values
- default value - Sets default value
- primary key - Marks as primary key

## Test Coverage

This section lists tests that verify single-table features work correctly.

### Validation (Runtime)

These tests verify that GenLogic catches invalid table and column definitions:

- [x] [Simple valid schema](../../tests/04-validation/simple-schema) - Valid basic schema passes validation
- [x] [Invalid table names](../../tests/04-validation/invalid-table-name) - Malformed table names rejected
- [x] [Invalid column names](../../tests/04-validation/invalid-column-name) - Malformed column names rejected
- [x] [Invalid column references](../../tests/04-validation/invalid-column-reference) - Non-existent column references in automations
- [x] [Table name reserved word](../../tests/04-validation/table-name-reserved-word) - PostgreSQL reserved words rejected in table names
- [x] [Column name reserved word](../../tests/04-validation/column-name-reserved-word) - PostgreSQL reserved words rejected in column names

### Schema Features (Isolated Tests)

These tests verify that GenLogic generates correct table and column DDL:

- [x] [Column types](../../tests/05-schema-features/column-types) - All PostgreSQL data types (serial, integer, varchar, numeric, timestamp, boolean, uuid, json, etc.)
- [x] [SERIAL, BIGSERIAL, SMALLSERIAL](../../tests/05-schema-features/column-types-serial) - Serial types create sequences
- [x] [INTEGER, BIGINT, SMALLINT](../../tests/05-schema-features/column-types-integer) - Integer types
- [x] [NUMERIC(p,s), DECIMAL(p,s)](../../tests/05-schema-features/column-types-numeric) - Fixed precision numeric types
- [x] [REAL, DOUBLE PRECISION](../../tests/05-schema-features/column-types-float) - Floating point types
- [x] [VARCHAR(n), CHAR(n), TEXT](../../tests/05-schema-features/column-types-text) - Text types
- [x] [BOOLEAN](../../tests/05-schema-features/column-types-boolean) - Boolean type
- [x] [UUID](../../tests/05-schema-features/column-types-uuid) - UUID type
- [x] [JSON, JSONB](../../tests/05-schema-features/column-types-json) - JSON types
- [x] [Comment on table](../../tests/05-schema-features/comment-table) - Table-level comments
- [x] [Comment on column](../../tests/05-schema-features/comment-column) - Column-level comments

### Additive Changes (Schema Evolution)

These tests verify that GenLogic safely modifies existing database schemas:

- [x] [New table added](../../tests/05-schema-features/additive-new-table) - New table added to existing database
- [x] [New column added](../../tests/05-schema-features/additive-new-column) - New column added to existing table
- [x] [Column widening](../../tests/05-schema-features/additive-widen-column) - Columns widened for CHAR, VARCHAR, NUMERIC

### Behavior (End-to-End Tests)

These tests verify schema evolution behavior with actual data:

- [x] [VARCHAR size expansion](../../tests/06-behavior/column-expansion-varchar) - Widening VARCHAR columns
- [x] [NUMERIC precision expansion](../../tests/06-behavior/column-expansion-numeric) - Widening NUMERIC precision/scale
- [x] [Expansion via reusable columns](../../tests/06-behavior/column-expansion-reusable) - Column expansion through $ref

---

Previous: [CLI Usage](../installation-and-usage/20-cli-usage.md) | Next: [Reusable Columns](02-reusable-columns.md)
