# 4A1: Simple Arithmetic Formulas

Tests basic arithmetic formula columns within a row.
Covers: addition, subtraction, multiplication, division, and combined expressions.

## Build Schema

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      unit_cost: numeric(10,2)
      markup_percent: numeric(5,2)
      tax_rate: numeric(5,4)

      # Formula: Calculate selling price from cost + markup
      selling_price:
        definition: numeric(10,2)
        formula: "unit_cost * (1 + markup_percent / 100)"

      # Formula: Calculate tax amount
      tax_amount:
        definition: numeric(10,2)
        formula: "selling_price * tax_rate"

      # Formula: Calculate final price
      final_price:
        definition: numeric(10,2)
        formula: "selling_price + tax_amount"

      # Formula: Calculate profit margin
      profit_margin:
        definition: numeric(10,2)
        formula: "selling_price - unit_cost"
```

## Insert Product with Formulas

```sql
INSERT INTO products (product_name, unit_cost, markup_percent, tax_rate)
VALUES ('Widget A', 100.00, 25.00, 0.0825);
```

## Verify All Formulas Calculated

```sql
SELECT product_name, unit_cost, markup_percent, tax_rate,
       selling_price, tax_amount, final_price, profit_margin
FROM products;
```

```json
[
  {
    "product_name": "Widget A",
    "unit_cost": "100.00",
    "markup_percent": "25.00",
    "tax_rate": "0.0825",
    "selling_price": "125.00",
    "tax_amount": "10.31",
    "final_price": "135.31",
    "profit_margin": "25.00"
  }
]
```

## Insert Multiple Products

```sql
INSERT INTO products (product_name, unit_cost, markup_percent, tax_rate)
VALUES
  ('Widget B', 50.00, 50.00, 0.0825),
  ('Widget C', 200.00, 15.00, 0.0825),
  ('Widget D', 75.50, 33.33, 0.0825);
```

## Verify All Products

```sql
SELECT product_name, unit_cost, markup_percent,
       selling_price, tax_amount, final_price, profit_margin
FROM products
ORDER BY product_id;
```

```json
[
  {
    "product_name": "Widget A",
    "unit_cost": "100.00",
    "markup_percent": "25.00",
    "selling_price": "125.00",
    "tax_amount": "10.31",
    "final_price": "135.31",
    "profit_margin": "25.00"
  },
  {
    "product_name": "Widget B",
    "unit_cost": "50.00",
    "markup_percent": "50.00",
    "selling_price": "75.00",
    "tax_amount": "6.19",
    "final_price": "81.19",
    "profit_margin": "25.00"
  },
  {
    "product_name": "Widget C",
    "unit_cost": "200.00",
    "markup_percent": "15.00",
    "selling_price": "230.00",
    "tax_amount": "18.98",
    "final_price": "248.98",
    "profit_margin": "30.00"
  },
  {
    "product_name": "Widget D",
    "unit_cost": "75.50",
    "markup_percent": "33.33",
    "selling_price": "100.66",
    "tax_amount": "8.30",
    "final_price": "108.96",
    "profit_margin": "25.16"
  }
]
```

## Update Base Values

```sql
UPDATE products
SET unit_cost = 120.00, markup_percent = 30.00
WHERE product_name = 'Widget A';
```

## Verify Formulas Recalculated on Update

```sql
SELECT product_name, unit_cost, markup_percent,
       selling_price, tax_amount, final_price, profit_margin
FROM products
WHERE product_name = 'Widget A';
```

```json
[
  {
    "product_name": "Widget A",
    "unit_cost": "120.00",
    "markup_percent": "30.00",
    "selling_price": "156.00",
    "tax_amount": "12.87",
    "final_price": "168.87",
    "profit_margin": "36.00"
  }
]
```

## Test Division Formula

```sql
INSERT INTO products (product_name, unit_cost, markup_percent, tax_rate)
VALUES ('Widget E', 99.99, 10.01, 0.0825);
```

## Verify Division Works

```sql
SELECT product_name, unit_cost, markup_percent, selling_price
FROM products
WHERE product_name = 'Widget E';
```

```json
[
  {
    "product_name": "Widget E",
    "unit_cost": "99.99",
    "markup_percent": "10.01",
    "selling_price": "110.00"
  }
]
```
