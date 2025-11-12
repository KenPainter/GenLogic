# 7B1: Basic Reusable Columns

Tests reusable column definitions.
Covers: define once, use many times, type consistency.

## Build Schema

```yaml
columns:
  id-column: serial primary key

  name-column: varchar(100)

  email-column: varchar(200)

  created-at: timestamp default CURRENT_TIMESTAMP

  price-column: numeric(10,2)
    

tables:
  customers:
    columns:
      customer_id: id-column
      customer_name: name-column
      email: email-column
      created_at: created-at

  orders:
    columns:
      order_id: id-column
      customer_id: FK(customers)
      total_price: price-column
      created_at: created-at

  products:
    columns:
      product_id: id-column
      product_name: name-column
      price: price-column
      created_at: created-at
```

## Insert Customer

```sql
INSERT INTO customers (customer_name, email)
VALUES ('Alice', 'alice@example.com');
```

## Verify Customer Created with Timestamp

```sql
SELECT customer_id, customer_name, email, created_at IS NOT NULL as has_timestamp
FROM customers;
```

```json
[
  {
    "customer_id": 100,
    "customer_name": "Alice",
    "email": "alice@example.com",
    "has_timestamp": true
  }
]
```

## Insert Products

```sql
INSERT INTO products (product_name, price)
VALUES ('Widget', 29.99), ('Gadget', 49.99);
```

## Verify Products Created

```sql
SELECT product_id, product_name, price, created_at IS NOT NULL as has_timestamp
FROM products
ORDER BY product_id;
```

```json
[
  {
    "product_id": 100,
    "product_name": "Widget",
    "price": "29.99",
    "has_timestamp": true
  },
  {
    "product_id": 101,
    "product_name": "Gadget",
    "price": "49.99",
    "has_timestamp": true
  }
]
```

## Insert Order

```sql
INSERT INTO orders (customer_id, total_price)
VALUES (100, 79.98);
```

## Verify Order Created

```sql
SELECT order_id, customer_id, total_price, created_at IS NOT NULL as has_timestamp
FROM orders;
```

```json
[
  {
    "order_id": 100,
    "customer_id": 100,
    "total_price": "79.98",
    "has_timestamp": true
  }
]
```

## Verify Type Consistency (All IDs are serial)

```sql
SELECT
  c.customer_id,
  o.order_id,
  p.product_id
FROM customers c
CROSS JOIN orders o
CROSS JOIN products p
LIMIT 1;
```

```json
[
  {
    "customer_id": 100,
    "order_id": 100,
    "product_id": 100
  }
]
```

## Verify Type Consistency (All Names are varchar(100))

```sql
SELECT
  LENGTH(c.customer_name) as customer_name_type,
  LENGTH(p.product_name) as product_name_type
FROM customers c
CROSS JOIN products p
WHERE c.customer_name = 'Alice' AND p.product_name = 'Widget';
```

```json
[
  {
    "customer_name_type": 5,
    "product_name_type": 6
  }
]
```

## Insert Long Names to Test Varchar Limits

```sql
INSERT INTO customers (customer_name, email)
VALUES (REPEAT('B', 100), 'bob@example.com');

INSERT INTO products (product_name, price)
VALUES (REPEAT('X', 100), 9.99);
```

## Verify Names Truncated at Same Length

```sql
SELECT
  LENGTH(customer_name) as name_length,
  customer_name
FROM customers
WHERE email = 'bob@example.com';
```

```json
[
  {
    "name_length": 100,
    "customer_name": "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
  }
]
```

## Verify Product Name Length

```sql
SELECT
  LENGTH(product_name) as name_length
FROM products
WHERE price = 9.99;
```

```json
[
  {
    "name_length": 100
  }
]
```
