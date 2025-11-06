# Table-Level CHECK Constraints (Untested Feature)

## Overview

Table-level CHECK constraints allow you to define custom business rules and validation logic that spans multiple columns. Use `@column_name` syntax to reference columns in constraint expressions.

## Status

**⚠️ UNTESTED** - This feature has been implemented but not yet tested in production.

## Syntax

Add a `constraints` array to your table definition:

```yaml
tables:
  batch_types:
    columns:
      batch_type_id: serial primary key
      batch_type_code: varchar(20)
      batch_count:
        definition: integer
        automation: COUNT @batches.batch_id

    constraints:
      - NOT (@batch_type_id = 1 AND @batch_count > 1)
```

## How It Works

GenLogic converts `@column_name` references to quoted SQL identifiers and generates CHECK constraints in the CREATE TABLE statement:

```sql
CREATE TABLE "batch_types" (
  "batch_type_id" serial,
  "batch_type_code" varchar(20),
  "batch_count" integer,
  PRIMARY KEY ("batch_type_id"),
  CHECK (NOT ("batch_type_id" = 1 AND "batch_count" > 1))
);
```

## Validation

During schema processing, GenLogic validates that:
- All `@column_name` references exist in the table
- Constraint expressions are valid SQL syntax (at runtime when PostgreSQL executes the DDL)

## Complex Constraint Examples

**Range validation:**
```yaml
constraints:
  - @start_date <= @end_date
  - @quantity > 0
```

**Conditional requirements:**
```yaml
constraints:
  - @status != 'shipped' OR @tracking_number IS NOT NULL
```

**Multi-column validation:**
```yaml
constraints:
  - @discount_amount <= @total_amount
  - NOT (@is_active = true AND @deleted_at IS NOT NULL)
```

**Conditional limits (original use case):**
```yaml
# Limit batch_count to 1 if and only if batch_type_id is 1
constraints:
  - NOT (@batch_type_id = 1 AND @batch_count > 1)
```

## Testing Needed

- [ ] Create table with single CHECK constraint
- [ ] Create table with multiple CHECK constraints
- [ ] Verify constraint violations are caught by PostgreSQL
- [ ] Test with formula columns
- [ ] Test with automation columns
- [ ] Test constraint expressions with NULL values
- [ ] Test complex boolean logic (AND, OR, NOT)
- [ ] Test with existing tables (constraint addition)
- [ ] Verify error messages when constraint is violated

## Limitations

- Constraints are only added during table creation (not yet supported for adding to existing tables)
- No support for named constraints (GenLogic uses PostgreSQL auto-naming)
- Constraint expressions use GenLogic `@column_name` syntax, not raw SQL column references
