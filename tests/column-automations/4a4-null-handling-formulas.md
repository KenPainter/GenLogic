# 4A4: NULL Handling in Formulas

Tests how formulas handle NULL values.
Covers: NULL propagation, COALESCE, NULL checks, default values.

## Build Schema

```yaml
tables:
  orders:
    columns:
      order_id: serial primary key
      customer_name: varchar(100)
      item_price: numeric(10,2)
      discount_percent: numeric(5,2)
      shipping_cost: numeric(10,2)

      # Formula: Discount amount (NULL if no discount)
      discount_amount:
        definition: numeric(10,2)
        formula: "item_price * discount_percent / 100"

      # Formula: Discounted price with NULL handling
      discounted_price:
        definition: numeric(10,2)
        formula: "item_price - COALESCE(discount_amount, 0)"

      # Formula: Total with optional shipping
      total:
        definition: numeric(10,2)
        formula: "discounted_price + COALESCE(shipping_cost, 0)"

      # Formula: Has discount flag
      has_discount:
        definition: boolean
        formula: "discount_percent IS NOT NULL"
```

## Insert Order Without Discount or Shipping

```sql
INSERT INTO orders (customer_name, item_price, discount_percent, shipping_cost)
VALUES ('Alice', 100.00, NULL, NULL);
```

## Verify NULL Handling

```sql
SELECT customer_name, item_price, discount_percent, discount_amount,
       discounted_price, shipping_cost, total, has_discount
FROM orders;
```

```json
[
  {
    "customer_name": "Alice",
    "item_price": "100.00",
    "discount_percent": null,
    "discount_amount": null,
    "discounted_price": "100.00",
    "shipping_cost": null,
    "total": "100.00",
    "has_discount": false
  }
]
```

## Insert Order With Discount, No Shipping

```sql
INSERT INTO orders (customer_name, item_price, discount_percent, shipping_cost)
VALUES ('Bob', 200.00, 15.00, NULL);
```

## Verify Discount Calculated, Shipping NULL

```sql
SELECT customer_name, item_price, discount_percent, discount_amount,
       discounted_price, shipping_cost, total, has_discount
FROM orders
WHERE customer_name = 'Bob';
```

```json
[
  {
    "customer_name": "Bob",
    "item_price": "200.00",
    "discount_percent": "15.00",
    "discount_amount": "30.00",
    "discounted_price": "170.00",
    "shipping_cost": null,
    "total": "170.00",
    "has_discount": true
  }
]
```

## Insert Order With Everything

```sql
INSERT INTO orders (customer_name, item_price, discount_percent, shipping_cost)
VALUES ('Carol', 150.00, 10.00, 25.00);
```

## Verify All Fields Populated

```sql
SELECT customer_name, item_price, discount_percent, discount_amount,
       discounted_price, shipping_cost, total, has_discount
FROM orders
WHERE customer_name = 'Carol';
```

```json
[
  {
    "customer_name": "Carol",
    "item_price": "150.00",
    "discount_percent": "10.00",
    "discount_amount": "15.00",
    "discounted_price": "135.00",
    "shipping_cost": "25.00",
    "total": "160.00",
    "has_discount": true
  }
]
```

## Insert Order With Shipping, No Discount

```sql
INSERT INTO orders (customer_name, item_price, discount_percent, shipping_cost)
VALUES ('David', 75.00, NULL, 10.00);
```

## Verify Shipping Without Discount

```sql
SELECT customer_name, item_price, discount_percent, discount_amount,
       discounted_price, shipping_cost, total, has_discount
FROM orders
WHERE customer_name = 'David';
```

```json
[
  {
    "customer_name": "David",
    "item_price": "75.00",
    "discount_percent": null,
    "discount_amount": null,
    "discounted_price": "75.00",
    "shipping_cost": "10.00",
    "total": "85.00",
    "has_discount": false
  }
]
```

## Update NULL to Value

```sql
UPDATE orders
SET discount_percent = 20.00
WHERE customer_name = 'Alice';
```

## Verify Formulas Recalculated

```sql
SELECT customer_name, item_price, discount_percent, discount_amount,
       discounted_price, total, has_discount
FROM orders
WHERE customer_name = 'Alice';
```

```json
[
  {
    "customer_name": "Alice",
    "item_price": "100.00",
    "discount_percent": "20.00",
    "discount_amount": "20.00",
    "discounted_price": "80.00",
    "total": "80.00",
    "has_discount": true
  }
]
```

## Update Value to NULL

```sql
UPDATE orders
SET discount_percent = NULL
WHERE customer_name = 'Bob';
```

## Verify NULL Propagation

```sql
SELECT customer_name, discount_percent, discount_amount, discounted_price, has_discount
FROM orders
WHERE customer_name = 'Bob';
```

```json
[
  {
    "customer_name": "Bob",
    "discount_percent": null,
    "discount_amount": null,
    "discounted_price": "200.00",
    "has_discount": false
  }
]
```
