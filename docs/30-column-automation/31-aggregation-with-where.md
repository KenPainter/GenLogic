Previous: [Moving Values from Child to Parent](30-child-to-parent.md) | Next: [Auto-Creating Parent Rows](../40-row-automation/10-auto-create-parent.md)

# Filtering Aggregations with WHERE Clauses

Aggregations can include WHERE clauses to filter which child rows are counted or summed. This allows you to track subsets like "active orders", "completed tasks", or "balanced transactions" without materializing separate columns in the child table.

## Quick Example

```yaml
tables:
  batches:
    columns:
      batch_id: serial primary key

      assigned_count:
        definition: integer default 0
        automation: COUNT @ledger.ledger_id WHERE account_id_offset IS NOT NULL

      unassigned_count:
        definition: integer default 0
        automation: COUNT @ledger.ledger_id WHERE account_id_offset IS NULL

  ledger:
    foreign_keys:
      batch: { table: batches }
    columns:
      ledger_id: serial primary key
      batch: integer
      account_id_offset: integer  # NULL = unbalanced, value = balanced
```

## Syntax

```yaml
automation: TYPE @table.column WHERE condition
automation: TYPE(fk_name) @table.column WHERE condition
```

Where:
- `TYPE` is SUM or COUNT (most common), or MAX/MIN (less common use case)
- `@table.column` identifies the child table and column to aggregate
- `WHERE condition` is any PostgreSQL boolean expression using child table columns

**Column references**: Reference child table columns directly in the WHERE clause (no @ prefix):
```yaml
automation: COUNT @orders.id WHERE status = 'completed'
automation: SUM @transactions.amount WHERE account_id IS NOT NULL
```

GenLogic automatically qualifies column names with `NEW.`/`OLD.` when generating triggers.

## Complete Example: Transaction Reconciliation

```yaml
tables:
  batches:
    columns:
      batch_id: serial primary key
      name: varchar(50)

      # Count transactions by status
      assigned_count:
        definition: integer default 0
        automation: COUNT @ledger.ledger_id WHERE account_id_offset IS NOT NULL
        comment: Number of balanced transactions

      unassigned_count:
        definition: integer default 0
        automation: COUNT @ledger.ledger_id WHERE account_id_offset IS NULL
        comment: Number of unbalanced transactions

      # Sum amounts by status
      assigned_amount:
        definition: numeric(10,2) default 0
        automation: SUM @ledger.amount WHERE account_id_offset IS NOT NULL
        comment: Total amount of balanced transactions

      unassigned_amount:
        definition: numeric(10,2) default 0
        automation: SUM @ledger.amount WHERE account_id_offset IS NULL
        comment: Total amount of unbalanced transactions

  ledger:
    foreign_keys:
      batch: { table: batches }
    columns:
      ledger_id: serial primary key
      batch: integer
      amount: numeric(10,2)
      account_id_offset: integer  # NULL = unbalanced, populated = balanced
```

## How It Works

### INSERT - Conditional Update

Only updates parent aggregations if the new row matches the filter:

```sql
INSERT INTO batches (batch_id, name) VALUES (1, 'Batch 1');
-- All counts and amounts = 0

INSERT INTO ledger (ledger_id, batch, amount, account_id_offset)
VALUES (1, 1, 100.00, 5);  -- account_id_offset IS NOT NULL
-- assigned_count = 1, assigned_amount = 100.00
-- unassigned_count = 0, unassigned_amount = 0.00

INSERT INTO ledger (ledger_id, batch, amount, account_id_offset)
VALUES (2, 1, 50.00, NULL);  -- account_id_offset IS NULL
-- assigned_count = 1, assigned_amount = 100.00
-- unassigned_count = 1, unassigned_amount = 50.00
```

### UPDATE - Filter Transitions

Tracks when rows start or stop matching the filter:

**Unassigned → Assigned**:
```sql
UPDATE ledger SET account_id_offset = 7 WHERE ledger_id = 2;
-- Stopped matching "IS NULL", started matching "IS NOT NULL"
-- assigned_count: 1 → 2 (increment)
-- unassigned_count: 1 → 0 (decrement)
-- assigned_amount: 100.00 → 150.00 (add 50.00)
-- unassigned_amount: 50.00 → 0.00 (subtract 50.00)
```

**Assigned → Unassigned**:
```sql
UPDATE ledger SET account_id_offset = NULL WHERE ledger_id = 1;
-- Stopped matching "IS NOT NULL", started matching "IS NULL"
-- assigned_count: 2 → 1 (decrement)
-- unassigned_count: 0 → 1 (increment)
-- assigned_amount: 150.00 → 50.00 (subtract 100.00)
-- unassigned_amount: 0.00 → 100.00 (add 100.00)
```

**Value Change (Still Matching)**:
```sql
UPDATE ledger SET amount = 200.00 WHERE ledger_id = 2;
-- Still matches "IS NOT NULL"
-- assigned_count: 1 (unchanged)
-- assigned_amount: 50.00 + (200.00 - 50.00) = 200.00
```

### DELETE - Conditional Decrement

Only decrements if the deleted row matched the filter:

```sql
DELETE FROM ledger WHERE ledger_id = 2;  -- was assigned
-- assigned_count: 1 → 0
-- assigned_amount: 200.00 → 0.00
-- unassigned values unchanged
```

## Filter Examples

### NULL Checks

```yaml
# Count rows with missing data
automation: COUNT @transactions.id WHERE account_id IS NULL

# Sum only rows with data present
automation: SUM @orders.total WHERE status IS NOT NULL
```

### Equality Comparisons

```yaml
# Count completed orders
automation: COUNT @orders.id WHERE status = 'completed'

# Sum only positive amounts
automation: SUM @transactions.amount WHERE amount > 0
```

### Complex Conditions

```yaml
# High priority completed tasks
automation: COUNT @tasks.id WHERE status = 'done' AND priority = 'high'

# Posted or pending amounts
automation: SUM @ledger.amount WHERE (status = 'posted' OR status = 'pending')

# Non-zero inventory
automation: COUNT @items.id WHERE quantity > 0 AND quantity IS NOT NULL
```

### Multiple Filters on Same Column

```yaml
# Track order status distribution
completed_orders:
  automation: COUNT @orders.id WHERE status = 'completed'
pending_orders:
  automation: COUNT @orders.id WHERE status = 'pending'
cancelled_orders:
  automation: COUNT @orders.id WHERE status = 'cancelled'
```

## Use Cases

### Status Tracking
Track counts by state without creating separate boolean flags:
```yaml
active_count: { automation: COUNT @items.id WHERE status = 'active' }
inactive_count: { automation: COUNT @items.id WHERE status = 'inactive' }
```

### Financial Reconciliation
Separate balanced vs unbalanced transactions:
```yaml
balanced_amount: { automation: SUM @ledger.amount WHERE offset_account IS NOT NULL }
unbalanced_amount: { automation: SUM @ledger.amount WHERE offset_account IS NULL }
```

### Data Quality Metrics
Track valid vs invalid records:
```yaml
valid_records: { automation: COUNT @data.id WHERE validation_status = 'valid' }
invalid_records: { automation: COUNT @data.id WHERE validation_status = 'invalid' }
```

### Conditional Financial Totals
Sum only specific transaction types:
```yaml
revenue_total: { automation: SUM @transactions.amount WHERE amount > 0 }
expense_total: { automation: SUM @transactions.amount WHERE amount < 0 }
```

### Category-Based Aggregation
Aggregate by type without separate FKs:
```yaml
high_priority_count: { automation: COUNT @tasks.id WHERE priority = 'high' }
medium_priority_count: { automation: COUNT @tasks.id WHERE priority = 'medium' }
```

## Backfilling

When adding a filtered aggregation to an existing table with data, GenLogic automatically backfills with correct values:

```yaml
# Add to existing database
batches:
  columns:
    batch_id: serial primary key
    assigned_count:  # NEW COLUMN
      definition: integer default 0
      automation: COUNT @ledger.ledger_id WHERE account_id_offset IS NOT NULL
```

GenLogic generates:
```sql
ALTER TABLE batches ADD COLUMN assigned_count INTEGER DEFAULT 0;

-- Backfill with correct values
UPDATE batches SET assigned_count = (
  SELECT COUNT(*)
  FROM ledger
  WHERE ledger.batch = batches.batch_id
    AND (account_id_offset IS NOT NULL)
);
```

All existing batches immediately have correct counts.

## Restrictions

### Supported Aggregation Types

WHERE clauses work with:
- **SUM** - Most common use case
- **COUNT** - Most common use case
- **MAX** - Less common (filter narrows the set to find max from)
- **MIN** - Less common (filter narrows the set to find min from)

WHERE clauses are **not supported** with:
- **LAST_VALUE** - No clear semantics (which row is "last" among filtered rows?)

### Column References

WHERE clauses can only reference columns in the **child table** (the table being aggregated). They cannot reference:
- Parent table columns
- Other tables
- Subqueries

### Cannot Combine with Formula

A column cannot have both `automation` and `formula`:
```yaml
# INVALID
balance:
  automation: SUM @transactions.amount WHERE status = 'posted'
  formula: "@debits - @credits"  # ERROR: can't have both
```

## Test Coverage

### Behavior (End-to-End Tests)

Tests that verify filtered aggregation behavior with actual data:

- [x] [Filtered aggregations](../../tests/06-behavior/automations-sum-filtered) - SUM and COUNT with WHERE clauses
  - INSERT: rows matching and not matching filter
  - UPDATE: filter transitions (unassigned→assigned, assigned→unassigned)
  - UPDATE: value changes while still matching filter
  - DELETE: removing filtered rows
  - Multiple filtered aggregations on same FK
  - Verifies correct final counts and sums

---

Previous: [Moving Values from Child to Parent](30-child-to-parent.md) | Next: [Auto-Creating Parent Rows](../40-row-automation/10-auto-create-parent.md)
