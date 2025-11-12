# 2A1: Basic SYNC on INSERT

Tests that child columns with SYNC automation pull values from parent table on INSERT.

## Build Schema

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      base_price: numeric(10,2)
      tax_rate: numeric(5,4)

  orders:
    columns:
      order_id: serial primary key
      product_id: FK(products)
      quantity: integer

      # SYNC: Always reflects current parent value
      product_name:
        definition: varchar(100)
        automation: SYNC products.product_name

      current_price:
        definition: numeric(10,2)
        automation: SYNC products.base_price

      current_tax_rate:
        definition: numeric(5,4)
        automation: SYNC products.tax_rate
```

## Insert Parent Rows

```sql
INSERT INTO products (product_name, base_price, tax_rate)
VALUES
  ('Widget A', 10.00, 0.0825),
  ('Widget B', 25.50, 0.0825);
```

## Verify Parent Data

```sql
SELECT product_name, base_price, tax_rate
FROM products
ORDER BY product_id;
```

```json
[
  {
    "product_name": "Widget A",
    "base_price": "10.00",
    "tax_rate": "0.0825"
  },
  {
    "product_name": "Widget B",
    "base_price": "25.50",
    "tax_rate": "0.0825"
  }
]
```

## Insert Child Rows

```sql
INSERT INTO orders (product_id, quantity)
VALUES ((SELECT product_id FROM products WHERE product_name = 'Widget A'), 5);

INSERT INTO orders (product_id, quantity)
VALUES ((SELECT product_id FROM products WHERE product_name = 'Widget B'), 3);
```

## Verify SYNC Values Were Pulled on INSERT

Child rows should have SYNC'd values from parents at time of INSERT.

```sql
SELECT quantity, product_name, current_price, current_tax_rate
FROM orders
ORDER BY order_id;
```

```json
[
  {
    "quantity": 5,
    "product_name": "Widget A",
    "current_price": "10.00",
    "current_tax_rate": "0.0825"
  },
  {
    "quantity": 3,
    "product_name": "Widget B",
    "current_price": "25.50",
    "current_tax_rate": "0.0825"
  }
]
```
