Previous: [Calculating Values Within a Row](05-calculated-columns.md) | Next: [Pattern Matching Tables](07-matching-tables.md)

# Moving Values from Child to Parent

Parent tables can automatically maintain aggregate values from child tables.

## Basic Structure

```yaml
tables:
  parent_table:
    columns:
      aggregate_column:
        type: *result type*
        automation:
          type: *SUM | COUNT | MAX | MIN | LAST_VALUE*
          table: child_table
          foreign_key: parent_fk
          column: source_column

  child_table:
    foreign_keys:
      parent_fk: parent_table
    columns:
      source_column: *any valid PostgreSQL type*
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
        type: numeric(10,2)
        automation:
          type: SUM
          table: transactions
          foreign_key: account_fk
          column: amount

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
        type: integer
        automation:
          type: COUNT
          table: products
          foreign_key: category_fk
          column: product_id

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
        type: numeric(10,2)
        automation:
          type: MAX
          table: order_items
          foreign_key: order_fk
          column: unit_price

      # Track lowest item price
      min_item_price:
        type: numeric(10,2)
        automation:
          type: MIN
          table: order_items
          foreign_key: order_fk
          column: unit_price

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
        type: date
        automation:
          type: LAST_VALUE
          table: orders
          foreign_key: customer_fk
          column: order_date

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
        type: numeric(10,2)
        automation:
          type: SUM
          table: order_items
          foreign_key: order_fk
          column: line_total

      # Count of line items
      item_count:
        type: integer
        automation:
          type: COUNT
          table: order_items
          foreign_key: order_fk
          column: item_id

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

---

Previous: [Calculating Values Within a Row](05-calculated-columns.md) | Next: [Pattern Matching Tables](07-matching-tables.md)
