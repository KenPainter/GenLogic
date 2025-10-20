Previous: [Calculating Values Within a Row](20-calculate-within-row.md) | Next: [Schema Validation](../50-integrity-features/01-schema-validation.md)

# Moving Values from Child to Parent

Parent tables can automatically maintain aggregate values from child tables.

## Aggregation Types

GenLogic provides five aggregation types:

- SUM: Total numeric values (account balances, order totals)
- COUNT: Number of child rows (product counts, item quantities)
- MAX: Highest value (maximum price, latest date)
- MIN: Lowest value (minimum price, earliest date)
- LAST_VALUE: Most recent value (last order date, current status)

All aggregations update automatically when child rows are inserted, updated, or deleted.

## Simple Example

```yaml
tables:
  accounts:
    columns:
      account_id: serial primary key
      account_name: varchar(100)
      balance:
        definition: numeric(10,2)
        automation: SUM @transactions.amount

  transactions:
    foreign_keys:
      account_fk: accounts
    columns:
      transaction_id: serial primary key
      account_fk: integer
      amount: numeric(10,2)
      description: varchar(200)
```

## What Happens

Triggers on the child table maintain parent aggregations automatically.

When you insert a transaction:

```sql
INSERT INTO accounts (account_name) VALUES ('Checking');
-- account_id = 1, balance = 0.00

INSERT INTO transactions (account_fk, amount, description)
VALUES (1, 100.00, 'Deposit');
-- balance automatically becomes 100.00

INSERT INTO transactions (account_fk, amount, description)
VALUES (1, -25.00, 'Withdrawal');
-- balance automatically becomes 75.00
```

The parent balance column stays current without manual updates.

## Syntax

The automation format is: `TYPE @table.column` where:
- TYPE is one of: SUM, COUNT, MAX, MIN, LAST_VALUE
- table is the child table name
- column is the column in the child table to aggregate

If the child table has multiple foreign keys to the parent table, specify which one:
```yaml
automation: TYPE(foreign_key_name) @table.column
```

## SUM Aggregation

Sum numeric values from child rows:

```yaml
tables:
  accounts:
    columns:
      account_id: serial primary key
      balance:
        definition: numeric(10,2)
        automation: SUM @transactions.amount

  transactions:
    foreign_keys:
      account_fk: accounts
    columns:
      transaction_id: serial primary key
      account_fk: integer
      amount: numeric(10,2)
```

Use cases: Account balances, order totals, inventory quantities, financial summaries.

## COUNT Aggregation

Count the number of child rows:

```yaml
tables:
  categories:
    columns:
      category_id: serial primary key
      product_count:
        definition: integer
        automation: COUNT @products.product_id

  products:
    foreign_keys:
      category_fk: categories
    columns:
      product_id: serial primary key
      category_fk: integer
      product_name: varchar(100)
```

Use cases: Record counts, statistics, item quantities, monitoring.

## MAX and MIN Aggregations

Track maximum or minimum values:

```yaml
tables:
  orders:
    columns:
      order_id: serial primary key
      max_item_price:
        definition: numeric(10,2)
        automation: MAX @order_items.unit_price
      min_item_price:
        definition: numeric(10,2)
        automation: MIN @order_items.unit_price

  order_items:
    foreign_keys:
      order_fk: orders
    columns:
      item_id: serial primary key
      order_fk: integer
      unit_price: numeric(10,2)
```

Use cases: Price ranges, date ranges (earliest/latest), extreme values.

## LAST_VALUE Aggregation

Copy the most recent value from child rows:

```yaml
tables:
  customers:
    columns:
      customer_id: serial primary key
      last_order_date:
        definition: date
        automation: LAST_VALUE @orders.order_date

  orders:
    foreign_keys:
      customer_fk: customers
    columns:
      order_id: serial primary key
      customer_fk: integer
      order_date: date
```

Use cases: Most recent activity, current status, last update timestamp.

## Default Values

Aggregation columns are initialized with appropriate defaults:

- SUM: 0
- COUNT: 0
- MAX: NULL (until first child row exists)
- MIN: NULL (until first child row exists)
- LAST_VALUE: NULL (until first child row exists)

## When Aggregations Update

Aggregations update automatically when:

1. Child row is inserted
2. Child row is updated (foreign key or source column changes)
3. Child row is deleted

The parent value is recalculated incrementally using triggers.

## Restrictions

### Cannot Use with Formula

A column cannot have both automation and formula properties:

```yaml
# INVALID
balance:
  definition: numeric(10,2)
  automation: SUM @transactions.amount
  formula: "@debits - @credits"  # Can't have both
```

### Foreign Key Required

Aggregations require a foreign key relationship from the child table to the parent table. The foreign key must exist in the child table's foreign_keys section.

### Circular Aggregations

Circular aggregations are safe with GenLogic's change detection:

```yaml
# VALID - Both tables can aggregate from each other
tables:
  accounts:
    columns:
      balance:
        definition: numeric(10,2)
        automation: SUM @transactions.amount

  transactions:
    columns:
      account_balance_at_time:
        definition: numeric(10,2)
        automation: SNAPSHOT @accounts.balance
```

GenLogic's triggers only propagate changes when values actually change, preventing infinite loops.

## Complete Example

Multiple aggregations on one parent:

```yaml
tables:
  orders:
    columns:
      order_id: serial primary key

      # Sum of line item amounts
      order_total:
        definition: numeric(10,2)
        automation: SUM @order_items.line_total

      # Count of line items
      item_count:
        definition: integer
        automation: COUNT @order_items.item_id

      # Highest priced item
      max_item_price:
        definition: numeric(10,2)
        automation: MAX @order_items.unit_price

      # Lowest priced item
      min_item_price:
        definition: numeric(10,2)
        automation: MIN @order_items.unit_price

  order_items:
    foreign_keys:
      order_fk: orders
    columns:
      item_id: serial primary key
      order_fk: integer
      unit_price: numeric(10,2)
      quantity: integer
      line_total:
        definition: numeric(10,2)
        formula: "@unit_price * @quantity"
```

Usage:

```sql
INSERT INTO orders DEFAULT VALUES;
-- order_id = 1, order_total = 0.00, item_count = 0

INSERT INTO order_items (order_fk, unit_price, quantity)
VALUES (1, 10.00, 2);
-- order_total = 20.00, item_count = 1, max = 10.00, min = 10.00

INSERT INTO order_items (order_fk, unit_price, quantity)
VALUES (1, 15.00, 1);
-- order_total = 35.00, item_count = 2, max = 15.00, min = 10.00

SELECT order_total, item_count, max_item_price, min_item_price
FROM orders WHERE order_id = 1;
-- order_total | item_count | max_item_price | min_item_price
-- ------------|------------|----------------|----------------
-- 35.00       | 2          | 15.00          | 10.00
```

## Test Coverage

This section lists tests that verify child-to-parent aggregation features work correctly.

### Behavior (End-to-End Tests)

Tests that verify aggregation automation behavior with actual data:

- [x] [SUM automation](../../tests/06-behavior/automations-sum) - Basic SUM aggregation
- [x] [COUNT automation](../../tests/06-behavior/automations-count) - Row counting automation
- [x] [MAX automation](../../tests/06-behavior/automations-max) - Maximum value tracking
- [x] [MIN automation](../../tests/06-behavior/automations-min) - Minimum value tracking
- [x] [LAST_VALUE automation](../../tests/06-behavior/automations-last-value) - Most recent value capture
- [x] [Incremental SUM](../../tests/06-behavior/automations-incremental) - SUM with INSERT/UPDATE/DELETE
- [x] [Multiple automations](../../tests/06-behavior/automations-multiple) - Multiple aggregations on same FK

---

Previous: [Calculating Values Within a Row](20-calculate-within-row.md) | Next: [Schema Validation](../50-integrity-features/01-schema-validation.md)
