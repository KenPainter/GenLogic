# Aggregations

Aggregation columns in a parent table automatically compute values from child rows. GenLogic supports SUM, COUNT, MAX, and MIN.

## SUM Aggregation

SUM adds up numeric values from child rows.

```yaml
tables:
  accounts:
    columns:
      account_id: serial primary key
      account_name: varchar(100)

      # SUM: Total of all transaction amounts
      balance:
        definition: numeric(10,2)
        automation: SUM transactions.amount

  transactions:
    columns:
      transaction_id: serial primary key
      account_id: FK accounts
      amount: numeric(10,2)
      description: varchar(200)
```

Insert an account:
```sql
INSERT INTO accounts (account_name)
VALUES ('Checking');
```

The balance starts at 0.00.

Insert transactions:
```sql
INSERT INTO transactions (account_id, amount, description)
VALUES
  (100, 100.00, 'Deposit'),
  (100, 50.00, 'Deposit'),
  (100, -25.00, 'Withdrawal');
```

The account balance is now 125.00.

## COUNT Aggregation

COUNT counts the number of child rows.

```yaml
tables:
  customers:
    columns:
      customer_id: serial primary key
      customer_name: varchar(100)

      # COUNT: Number of orders for this customer
      order_count:
        definition: integer
        # Note: genlogic syntax requires a column name, but it
        # is ignored.  Use any column name.
        automation: COUNT orders.order_id

  orders:
    columns:
      order_id: serial primary key
      customer_id: FK customers
      order_date: date
```

Insert a customer:
```sql
INSERT INTO customers (customer_name)
VALUES ('Alice');
```

The order_count starts at 0.

Insert orders:
```sql
INSERT INTO orders (customer_id, order_date)
VALUES
  (100, '2025-01-15'),
  (100, '2025-01-16'),
  (100, '2025-01-17');
```

The order_count is now 3.

## MAX and MIN Aggregations

MAX finds the highest value, MIN finds the lowest value.

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)

      # MAX: Highest review score
      highest_rating:
        definition: integer
        automation: MAX reviews.rating

      # MIN: Lowest review score
      lowest_rating:
        definition: integer
        automation: MIN reviews.rating

  reviews:
    columns:
      review_id: serial primary key
      product_id: FK products
      rating: integer
      comment: text
```

Insert a product:
```sql
INSERT INTO products (product_name)
VALUES ('Widget');
```

Both highest_rating and lowest_rating are NULL (no reviews yet).

Insert reviews:
```sql
INSERT INTO reviews (product_id, rating, comment)
VALUES
  (100, 5, 'Excellent'),
  (100, 4, 'Very good'),
  (100, 3, 'Decent');
```

Now highest_rating = 5 and lowest_rating = 3.

## Aggregations on INSERT

When a child row is inserted, the parent aggregation updates immediately.

## Aggregations on UPDATE

When a child value changes, the parent aggregation recalculates:

```sql
UPDATE transactions
SET amount = 200.00
WHERE transaction_id = 100;
```

The account balance recalculates with the new amount.

## Aggregations on DELETE

When a child row is deleted, the parent aggregation recalculates:

```sql
DELETE FROM transactions
WHERE transaction_id = 100;
```

The account balance decreases by the deleted transaction's amount.

## Aggregations on FK Change

When a child's foreign key changes, both old and new parent aggregations update:

```sql
UPDATE orders
SET customer_id = 200;
```

Customer 100's order_count decreases by 1, customer 200's order_count increases by 1.

## Multiple Aggregations

A parent can have multiple aggregations:

```yaml
tables:
  customers:
    columns:
      customer_id: serial primary key
      customer_name: varchar(100)

      order_count:
        definition: integer
        automation: COUNT orders.order_id

      total_revenue:
        definition: numeric(10,2)
        automation: SUM orders.total_amount

      largest_order:
        definition: numeric(10,2)
        automation: MAX orders.total_amount

  orders:
    columns:
      order_id: serial primary key
      customer_id: FK customers
      total_amount: numeric(10,2)
```

All aggregations update when child rows change.

## Aggregating from Multiple Foreign Keys

When a child table has multiple foreign keys to the same parent, specify which FK to aggregate from.

```yaml
tables:
  accounts:
    columns:
      account_id: serial primary key
      account_name: varchar(100)

      # Sum amounts where this account is the sender
      total_sent:
        definition: numeric(10,2)
        automation: SUM(from_account_id) transfers.amount

      # Sum amounts where this account is the receiver
      total_received:
        definition: numeric(10,2)
        automation: SUM(to_account_id) transfers.amount

      # Net balance
      balance:
        definition: numeric(10,2)
        formula: "total_received - total_sent"

  transfers:
    columns:
      transfer_id: serial primary key
      from_account_id: FK accounts
      to_account_id: FK accounts
      amount: numeric(10,2)
      transfer_date: date
```

Insert accounts:
```sql
INSERT INTO accounts (account_name)
VALUES ('Alice'), ('Bob');
```

Both accounts start with total_sent = 0.00 and total_received = 0.00.

Insert transfers:
```sql
INSERT INTO transfers (from_account_id, to_account_id, amount, transfer_date)
VALUES
  (100, 101, 50.00, '2025-01-15'),
  (100, 101, 25.00, '2025-01-16'),
  (101, 100, 10.00, '2025-01-17');
```

Account 100 (Alice):
- total_sent = 75.00
- total_received = 10.00
- balance = -65.00

Account 101 (Bob):
- total_sent = 10.00
- total_received = 75.00
- balance = 65.00

## Default Values

SUM and COUNT default to 0 when there are no child rows.

MAX and MIN default to NULL when there are no child rows.
