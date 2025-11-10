# 2B1: Basic SNAPSHOT on INSERT

Tests that child columns with SNAPSHOT automation capture values from parent table on INSERT.
Unlike SYNC, SNAPSHOT values are frozen at time of capture.

## Build Schema

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      list_price: numeric(10,2)
      description: text

  orders:
    columns:
      order_id: serial primary key
      product_id: FK products
      quantity: integer
      order_date: date

      # SNAPSHOT: Captures price at time of order
      price_at_order:
        definition: numeric(10,2)
        automation: SNAPSHOT products.list_price

      product_name_at_order:
        definition: varchar(100)
        automation: SNAPSHOT products.product_name

      description_at_order:
        definition: text
        automation: SNAPSHOT products.description
```

## Insert Parent Rows

```sql
INSERT INTO products (product_name, list_price, description)
VALUES
  ('Laptop Pro', 1299.99, 'High-performance laptop'),
  ('Wireless Mouse', 29.99, 'Ergonomic wireless mouse');
```

## Verify Parent Data

```sql
SELECT product_name, list_price, description
FROM products
ORDER BY product_id;
```

```json
[
  {
    "product_name": "Laptop Pro",
    "list_price": "1299.99",
    "description": "High-performance laptop"
  },
  {
    "product_name": "Wireless Mouse",
    "list_price": "29.99",
    "description": "Ergonomic wireless mouse"
  }
]
```

## Insert Child Rows

```sql
INSERT INTO orders (product_id, quantity, order_date)
VALUES
  ((SELECT product_id FROM products WHERE product_name = 'Laptop Pro'), 2, '2025-01-15'),
  ((SELECT product_id FROM products WHERE product_name = 'Wireless Mouse'), 5, '2025-01-16');
```

## Verify SNAPSHOT Values Were Captured on INSERT

Child rows should have captured parent values at time of INSERT.

```sql
SELECT quantity, order_date, price_at_order, product_name_at_order, description_at_order
FROM orders
ORDER BY order_id;
```

```json
[
  {
    "quantity": 2,
    "order_date": "2025-01-15T00:00:00.000Z",
    "price_at_order": "1299.99",
    "product_name_at_order": "Laptop Pro",
    "description_at_order": "High-performance laptop"
  },
  {
    "quantity": 5,
    "order_date": "2025-01-16T00:00:00.000Z",
    "price_at_order": "29.99",
    "product_name_at_order": "Wireless Mouse",
    "description_at_order": "Ergonomic wireless mouse"
  }
]
```
