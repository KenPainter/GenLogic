Previous: [Foreign Keys](20-foreign-keys.md) | Next: [Moving Values from Parent to Child](../30-column-automation/10-parent-to-child.md)

# Indexes and Unique Constraints

GenLogic supports defining indexes and unique constraints for multi-column combinations.

## Indexes

Create indexes using the `indexes` section:

```yaml
tables:
  orders:
    columns:
      order_id: serial primary key
      customer_id: integer
      order_date: date
      status: varchar(20)

    foreign_keys:
      customer: customers

    indexes:
      - [order_date]
      - [customer_id, order_date]
      - [status, order_date]
```

Foreign key columns automatically get indexes.

## Unique Constraints

Single-column unique constraints can be declared in the column definition using
the `unique` keyword - see [Tables and Columns](10-tables-and-columns.md).


Single-column or multi-column unique constraints can be added
using the `unique_constraints` section:

```yaml
tables:
  enrollments:
    columns:
      enrollment_id: serial primary key
      student_id: integer
      course_id: integer
      semester: varchar(20)

    foreign_keys:
      student: students
      course: courses

    unique_constraints:
      - [student_id, course_id, semester]
```

Unique constraints allow multiple NULL values. In PostgreSQL, NULLs are not considered equal,
so a unique constraint on a nullable column permits multiple rows with NULL.

## Example

```yaml
tables:
  users:
    columns:
      user_id: serial primary key
      email: varchar(255)
      username: varchar(50)
      external_id: varchar(100)

    unique_constraints:
      - [email]
      - [username]
      - [external_id]  # Nullable - multiple NULLs allowed

  ledger:
    columns:
      ledger_id: serial primary key
      institution: varchar(30)
      trxid: varchar(50)
      amount: numeric(10,2)
      date: date

    indexes:
      - [institution, trxid]
      - [date]

    unique_constraints:
      - [institution, trxid, date]
```

## Test Coverage

This section lists tests that verify index and constraint features work correctly.

### Validation (Runtime)

These tests verify that GenLogic catches invalid index and constraint definitions:

- [x] [Index on non-existent column](../../tests/04-validation/invalid-index-columns) - Error when index references non-existent column
- [x] [Unique constraint on non-existent column](../../tests/04-validation/invalid-unique-constraint-columns) - Error when unique constraint references non-existent column
- [x] [Unique on nullable FK](../../tests/04-validation/unique-on-nullable-fk) - Unique constraints on nullable FKs are valid (should pass)

### Schema Features (Isolated Tests)

These tests verify that GenLogic generates correct index and constraint DDL:

- [x] [Indexes and constraints](../../tests/05-schema-features/indexes-and-constraints) - Single/multi-column indexes and unique constraints
- [x] [Single column index](../../tests/05-schema-features/indexes-and-constraints) - Single column index (tested above)
- [x] [Multi-column index](../../tests/05-schema-features/index-multi-column) - Index on multiple columns
- [x] [Unique index](../../tests/05-schema-features/index-unique) - Unique constraint on column
- [x] [Index on FK column](../../tests/05-schema-features/index-on-fk) - FK columns auto-indexed
- [x] [Multiple indexes](../../tests/05-schema-features/indexes-multiple) - Multiple indexes on same table
- [x] [Multi-column unique](../../tests/05-schema-features/indexes-and-constraints) - Multi-column unique constraint (tested above)
- [x] [Single column unique](../../tests/05-schema-features/unique-single-column) - Single column unique constraint
- [x] [Multiple unique constraints](../../tests/05-schema-features/unique-multiple-constraints) - Multiple unique constraints on same table
- [x] [Unique on nullable column](../../tests/05-schema-features/unique-on-nullable) - Unique constraint with nullable column

---

Previous: [Foreign Keys](20-foreign-keys.md) | Next: [Moving Values from Parent to Child](../30-column-automation/10-parent-to-child.md)
