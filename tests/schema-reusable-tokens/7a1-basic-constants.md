# 7A1: Basic Constants

Tests constant definition and substitution in schema YAML.
Covers: numeric constants, string constants, substitution in column definitions and defaults.

## Build Schema

```yaml
constants:
  TAX_RATE: 0.0825
  DEFAULT_CATEGORY: Electronics
  MAX_NAME_LENGTH: 100
  DEFAULT_PRICE: 9.99

tables:
  products:
    columns:
      product_id: serial primary key
      product_name: varchar(${MAX_NAME_LENGTH})
      category: varchar(${MAX_NAME_LENGTH}) default '${DEFAULT_CATEGORY}'
      price: numeric(10,2) default ${DEFAULT_PRICE}
      tax_rate: numeric(5,4) default ${TAX_RATE}

      # Formula using constant
      price_with_tax:
        definition: numeric(10,2)
        formula: "price * (1 + ${TAX_RATE})"
```

## Insert Product Using Defaults

```sql
INSERT INTO products (product_name)
VALUES ('Widget');
```

## Verify Constants Applied to Defaults

```sql
SELECT product_id, product_name, category, price, tax_rate, price_with_tax
FROM products;
```

```json
[
  {
    "product_id": 100,
    "product_name": "Widget",
    "category": "Electronics",
    "price": "9.99",
    "tax_rate": "0.0825",
    "price_with_tax": "10.81"
  }
]
```

## Insert Product with Explicit Values

```sql
INSERT INTO products (product_name, category, price)
VALUES ('Premium Widget', 'Gadgets', 49.99);
```

## Verify Explicit Values Override Defaults

```sql
SELECT product_id, product_name, category, price, tax_rate, price_with_tax
FROM products
ORDER BY product_id;
```

```json
[
  {
    "product_id": 100,
    "product_name": "Widget",
    "category": "Electronics",
    "price": "9.99",
    "tax_rate": "0.0825",
    "price_with_tax": "10.81"
  },
  {
    "product_id": 101,
    "product_name": "Premium Widget",
    "category": "Gadgets",
    "price": "49.99",
    "tax_rate": "0.0825",
    "price_with_tax": "54.11"
  }
]
```

## Verify Column Length from Constant

```sql
INSERT INTO products (product_name, category)
VALUES (REPEAT('A', 100), 'Test');
```

## Verify Max Length Enforced

```sql
SELECT LENGTH(product_name) as name_length, category
FROM products
WHERE category = 'Test';
```

```json
[
  {
    "name_length": 100,
    "category": "Test"
  }
]
```

## Update Price (Verify Formula Uses Constant)

```sql
UPDATE products
SET price = 100.00
WHERE product_name = 'Widget';
```

## Verify Formula Recalculated with Constant

```sql
SELECT product_name, price, tax_rate, price_with_tax
FROM products
WHERE product_name = 'Widget';
```

```json
[
  {
    "product_name": "Widget",
    "price": "100.00",
    "tax_rate": "0.0825",
    "price_with_tax": "108.25"
  }
]
```
