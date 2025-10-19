Previous: [Generating Values Within a Row](05-generated-columns.md) | Next: [Pattern Matching Tables](07-matching-tables.md)

# Moving Values from Child to Parent

Parent tables can automatically maintain aggregate values from child tables.

## Basic Structure

```yaml
tables:
  parent_table:
    columns:
      aggregate_column:
        definition: *result type*
        automation: *TYPE child_table.source_column*

  child_table:
    foreign_keys:
      parent_fk: parent_table
    columns:
      source_column: *any valid PostgreSQL type*
```

The automation format is: `TYPE @table.column` where:
- `TYPE` is one of: SUM, COUNT, MAX, MIN, LAST_VALUE
- `table` is the child table name
- `column` is the column in the child table to aggregate

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
      account_name: varchar(100)

      # Automatically maintained sum
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

Example:

```sql
INSERT INTO accounts (account_name) VALUES ('Checking');
-- account_id = 1, balance = 0.00

INSERT INTO transactions (account_fk, amount, description)
VALUES (1, 100.00, 'Deposit');
-- balance automatically becomes 100.00

INSERT INTO transactions (account_fk, amount, description)
VALUES (1, -25.00, 'Withdrawal');
-- balance automatically becomes 75.00

SELECT account_name, balance FROM accounts WHERE account_id = 1;
-- account_name | balance
-- -------------|--------
-- Checking     | 75.00
```

## COUNT Aggregation

Count the number of child rows:

```yaml
tables:
  categories:
    columns:
      category_id: serial primary key
      category_name: varchar(100)

      # Count products in category
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

Example:

```sql
INSERT INTO categories (category_name) VALUES ('Electronics');
-- category_id = 1, product_count = 0

INSERT INTO products (category_fk, product_name) VALUES (1, 'Laptop');
INSERT INTO products (category_fk, product_name) VALUES (1, 'Mouse');
INSERT INTO products (category_fk, product_name) VALUES (1, 'Keyboard');

SELECT category_name, product_count FROM categories WHERE category_id = 1;
-- category_name | product_count
-- --------------|---------------
-- Electronics   | 3
```

## MAX and MIN Aggregations

Track maximum or minimum values:

```yaml
tables:
  orders:
    columns:
      order_id: serial primary key

      # Track highest item price
      max_item_price:
        definition: numeric(10,2)
        automation: MAX @order_items.unit_price

      # Track lowest item price
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

## LAST_VALUE Aggregation

Copy the most recent value from child rows:

```yaml
tables:
  customers:
    columns:
      customer_id: serial primary key

      # Track most recent order date
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

## What Happens

Triggers on the child table maintain parent aggregations. When child rows are inserted, updated, or deleted, the parent aggregate column is automatically recalculated.

## Multiple Aggregations

A parent can have multiple aggregations from the same or different child tables:

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

  order_items:
    foreign_keys:
      order_fk: orders

    columns:
      item_id: serial primary key
      order_fk: integer
      line_total: numeric(10,2)
```

## Aggregation Types Summary

| Type | Purpose | Example |
|------|---------|---------|
| SUM | Total of numeric values | Account balance, order total |
| COUNT | Number of child rows | Product count, order count |
| MAX | Highest value | Maximum price, latest date |
| MIN | Lowest value | Minimum price, earliest date |
| LAST_VALUE | Most recent value | Last order date, current status |

## Default Values

Aggregation columns are initialized with appropriate defaults:

- SUM: 0
- COUNT: 0
- MAX: NULL (until first child row exists)
- MIN: NULL (until first child row exists)
- LAST_VALUE: NULL (until first child row exists)

## When Aggregations Update

Aggregations are automatically updated when:

1. Child row is inserted
2. Child row is updated (foreign key or source column changes)
3. Child row is deleted

The parent row value is always current.

## Test Coverage

This section lists tests that verify child-to-parent aggregation features work correctly.

### Behavior (End-to-End Tests)

These tests verify aggregation automation behavior with actual data:

- [x] [SUM automation](../../tests/06-behavior/automations-sum) - Basic SUM aggregation
- [x] [COUNT automation](../../tests/06-behavior/automations-count) - Row counting automation
- [x] [MAX automation](../../tests/06-behavior/automations-max) - Maximum value tracking
- [x] [MIN automation](../../tests/06-behavior/automations-min) - Minimum value tracking
- [x] [LAST_VALUE automation](../../tests/06-behavior/automations-last-value) - Most recent value capture
- [x] [Incremental SUM](../../tests/06-behavior/automations-incremental) - SUM with INSERT/UPDATE/DELETE
- [x] [Multiple automations](../../tests/06-behavior/automations-multiple) - Multiple automations on same FK

---

Previous: [Generating Values Within a Row](05-generated-columns.md) | Next: [Pattern Matching Tables](07-matching-tables.md)
