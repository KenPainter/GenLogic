# 3A2: SUM on UPDATE (Amount Changes)

Tests that parent SUM aggregation updates when child amount values change.

## Build Schema

```yaml
tables:
  orders:
    columns:
      order_id: serial primary key
      customer_name: varchar(100)

      # SUM: Total of all line item amounts
      order_total:
        definition: numeric(10,2)
        automation: SUM order_items.line_total

  order_items:
    columns:
      item_id: serial primary key
      order_id: FK(orders)
      product_name: varchar(100)
      quantity: integer
      unit_price: numeric(10,2)

      # Calculated column
      line_total:
        definition: numeric(10,2)
        formula: "quantity * unit_price"
```

## Insert Parent Row

```sql
INSERT INTO orders (customer_name)
VALUES ('Alice Johnson');
```

## Insert Order Items

```sql
INSERT INTO order_items (order_id, product_name, quantity, unit_price)
VALUES
  ((SELECT order_id FROM orders WHERE customer_name = 'Alice Johnson'), 'Widget A', 2, 10.00),
  ((SELECT order_id FROM orders WHERE customer_name = 'Alice Johnson'), 'Widget B', 3, 15.00);
```

## Verify Initial Total

```sql
SELECT customer_name, order_total
FROM orders;
```

```json
[
  {
    "customer_name": "Alice Johnson",
    "order_total": "65.00"
  }
]
```

## Update Quantity (Increases Total)

```sql
UPDATE order_items
SET quantity = 5
WHERE product_name = 'Widget A';
```

## Verify Total Updated

Formula recalculates line_total, which triggers SUM update.

```sql
SELECT customer_name, order_total
FROM orders;
```

```json
[
  {
    "customer_name": "Alice Johnson",
    "order_total": "95.00"
  }
]
```

## Update Unit Price (Changes Total)

```sql
UPDATE order_items
SET unit_price = 12.00
WHERE product_name = 'Widget B';
```

## Verify Total Updated Again

```sql
SELECT customer_name, order_total
FROM orders;
```

```json
[
  {
    "customer_name": "Alice Johnson",
    "order_total": "86.00"
  }
]
```

## Update Both Quantity and Price

```sql
UPDATE order_items
SET quantity = 1, unit_price = 20.00
WHERE product_name = 'Widget A';
```

## Verify Final Total

```sql
SELECT customer_name, order_total
FROM orders;
```

```json
[
  {
    "customer_name": "Alice Johnson",
    "order_total": "56.00"
  }
]
```

## Verify Individual Line Items

```sql
SELECT product_name, quantity, unit_price, line_total
FROM order_items
ORDER BY item_id;
```

```json
[
  {
    "product_name": "Widget A",
    "quantity": 1,
    "unit_price": "20.00",
    "line_total": "20.00"
  },
  {
    "product_name": "Widget B",
    "quantity": 3,
    "unit_price": "12.00",
    "line_total": "36.00"
  }
]
```
