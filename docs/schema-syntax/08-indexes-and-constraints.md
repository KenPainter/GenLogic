Previous: [Pattern Matching Tables](07-matching-tables.md) | Next: [Label and Format](09-label-and-format.md)

# Indexes and Unique Constraints

GenLogic supports defining composite indexes and unique constraints on your tables.

## Indexes

Create non-unique indexes for query performance:

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
      - [order_date]              # Single-column index
      - [customer_id, order_date] # Composite index
      - [status, order_date]      # Another composite index
```

**Generated SQL:**
```sql
CREATE INDEX "idx_orders_order_date" ON "orders" ("order_date");
CREATE INDEX "idx_orders_customer_id_order_date" ON "orders" ("customer_id", "order_date");
CREATE INDEX "idx_orders_status_order_date" ON "orders" ("status", "order_date");
```

**Note:** Foreign key columns automatically get indexes, so you don't need to manually add them.

## Unique Constraints

Create composite unique constraints to ensure combinations of columns are unique:

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
      - [student_id, course_id, semester]  # Student can only enroll once per course per semester
```

**Generated SQL:**
```sql
CREATE UNIQUE INDEX "unique_enrollments_student_id_course_id_semester"
  ON "enrollments" ("student_id", "course_id", "semester");
```

## Real-World Example: Transaction Deduplication

```yaml
tables:
  ledger:
    columns:
      ledger_id: serial primary key
      institution: varchar(30)
      trxid: varchar(50)
      amount: numeric(10,2)
      date: date

    indexes:
      - [institution, trxid]  # Fast lookup for deduplication
```

This creates an index that makes checking for duplicate transactions (by institution + trxid) very fast.

## When to Use Each

### Use `indexes` for:
- Columns frequently used in WHERE clauses
- Columns used in JOIN conditions (though FK columns get indexes automatically)
- Columns used in ORDER BY clauses
- Composite queries (multiple columns together in WHERE)

### Use `unique_constraints` for:
- Business rules requiring unique combinations (student + course + semester)
- Natural keys (email + domain)
- Preventing duplicate data (account + transaction_id)

## Column References

Both `indexes` and `unique_constraints` can reference:
- Regular columns
- Foreign key columns (generated automatically)
- Any column in the table after FK expansion

GenLogic validates that all referenced columns exist and will error if you reference a non-existent column.

---

Previous: [Pattern Matching Tables](07-matching-tables.md) | Next: [Label and Format](09-label-and-format.md)
