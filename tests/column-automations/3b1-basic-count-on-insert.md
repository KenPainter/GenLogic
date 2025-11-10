# 3B1: Basic COUNT on INSERT

Tests that parent COUNT aggregation columns update correctly when child rows are inserted.

## Build Schema

```yaml
tables:
  customers:
    columns:
      customer_id: serial primary key
      customer_name: varchar(100)

      # COUNT: Number of orders for this customer
      order_count:
        definition: integer
        automation: COUNT orders.order_id

  orders:
    columns:
      order_id: serial primary key
      customer_id: FK customers
      order_date: date
      total_amount: numeric(10,2)
```

## Insert Parent Rows

```sql
INSERT INTO customers (customer_name)
VALUES ('Alice'), ('Bob'), ('Charlie');
```

## Verify Initial Counts (Should be 0)

```sql
SELECT customer_name, order_count
FROM customers
ORDER BY customer_id;
```

```json
[
  {
    "customer_name": "Alice",
    "order_count": 0
  },
  {
    "customer_name": "Bob",
    "order_count": 0
  },
  {
    "customer_name": "Charlie",
    "order_count": 0
  }
]
```

## Insert First Order for Alice

```sql
INSERT INTO orders (customer_id, order_date, total_amount)
VALUES ((SELECT customer_id FROM customers WHERE customer_name = 'Alice'), '2025-01-15', 150.00);
```

## Verify Alice Count Incremented

```sql
SELECT customer_name, order_count
FROM customers
WHERE customer_name = 'Alice';
```

```json
[
  {
    "customer_name": "Alice",
    "order_count": 1
  }
]
```

## Insert Multiple Orders for Alice

```sql
INSERT INTO orders (customer_id, order_date, total_amount)
VALUES
  ((SELECT customer_id FROM customers WHERE customer_name = 'Alice'), '2025-01-16', 200.00),
  ((SELECT customer_id FROM customers WHERE customer_name = 'Alice'), '2025-01-17', 75.00);
```

## Verify Alice Count

```sql
SELECT customer_name, order_count
FROM customers
WHERE customer_name = 'Alice';
```

```json
[
  {
    "customer_name": "Alice",
    "order_count": 3
  }
]
```

## Insert Orders for Bob and Charlie

```sql
INSERT INTO orders (customer_id, order_date, total_amount)
VALUES
  ((SELECT customer_id FROM customers WHERE customer_name = 'Bob'), '2025-01-18', 300.00),
  ((SELECT customer_id FROM customers WHERE customer_name = 'Bob'), '2025-01-19', 125.00),
  ((SELECT customer_id FROM customers WHERE customer_name = 'Charlie'), '2025-01-20', 500.00);
```

## Verify All Customer Counts

```sql
SELECT customer_name, order_count
FROM customers
ORDER BY customer_id;
```

```json
[
  {
    "customer_name": "Alice",
    "order_count": 3
  },
  {
    "customer_name": "Bob",
    "order_count": 2
  },
  {
    "customer_name": "Charlie",
    "order_count": 1
  }
]
```

## Insert More Orders to All Customers

```sql
INSERT INTO orders (customer_id, order_date, total_amount)
VALUES
  ((SELECT customer_id FROM customers WHERE customer_name = 'Alice'), '2025-01-21', 99.00),
  ((SELECT customer_id FROM customers WHERE customer_name = 'Bob'), '2025-01-22', 175.00),
  ((SELECT customer_id FROM customers WHERE customer_name = 'Charlie'), '2025-01-23', 225.00),
  ((SELECT customer_id FROM customers WHERE customer_name = 'Charlie'), '2025-01-24', 400.00);
```

## Verify Final Counts

```sql
SELECT customer_name, order_count
FROM customers
ORDER BY customer_id;
```

```json
[
  {
    "customer_name": "Alice",
    "order_count": 4
  },
  {
    "customer_name": "Bob",
    "order_count": 3
  },
  {
    "customer_name": "Charlie",
    "order_count": 3
  }
]
```
