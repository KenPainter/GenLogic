# 8a1. Formula → FK → SYNC → Formula Chain

Tests complex dependency chains where a formula calculates an FK, which triggers SYNC, which is used by another formula.

## Build Schema

```yaml
tables:
  categories:
    columns:
      category_id: integer primary key
      category_name: character varying(100)
      tax_rate: numeric(5,4)

  products:
    columns:
      product_id: integer primary key
      product_name: character varying(100)
      customer_type: character varying(20)
      # Formula calculates FK based on customer_type
      category_id:
        definition: FK categories
        formula: "CASE WHEN customer_type = 'glamor' THEN 3 WHEN customer_type = 'whiz-kid' THEN 1 ELSE 2 END"
      # SYNC pulls category_name from the parent
      category_name:
        definition: character varying(100)
        automation: SYNC categories.category_name
      # SYNC pulls tax_rate from the parent
      tax_rate:
        definition: numeric(5,4)
        automation: SYNC categories.tax_rate
      base_price: numeric(10,2)
      # Formula uses the SYNC'd tax_rate
      price_with_tax:
        definition: numeric(10,2)
        formula: "base_price * (1 + tax_rate)"
```

## Seed Categories

```sql
INSERT INTO categories (category_id, category_name, tax_rate)
VALUES
  (1, 'Electronics', 0.0825),
  (2, 'Books', 0.0000),
  (3, 'Clothing', 0.0650);
```

## Insert Product - Formula Calculates FK

When we insert a product with customer_type, the formula should:
1. Calculate category_id from customer_type ('whiz-kid' → Electronics/1)
2. SYNC category_name and tax_rate from the linked category
3. Calculate price_with_tax using the SYNC'd tax_rate

```sql
INSERT INTO products (product_id, product_name, customer_type, base_price)
VALUES (1, 'Laptop', 'whiz-kid', 1000.00);

SELECT product_id, product_name, customer_type, category_id, category_name, tax_rate, base_price, price_with_tax
FROM products
WHERE product_id = 1;
```

```json
[
  {
    "product_id": 1,
    "product_name": "Laptop",
    "customer_type": "whiz-kid",
    "category_id": 1,
    "category_name": "Electronics",
    "tax_rate": "0.0825",
    "base_price": "1000.00",
    "price_with_tax": "1082.50"
  }
]
```

## Insert Product with Different Customer Type

Default customer_type (not 'glamor' or 'whiz-kid') should map to Books/2.

```sql
INSERT INTO products (product_id, product_name, customer_type, base_price)
VALUES (2, 'Novel', 'standard', 15.99);

SELECT product_id, product_name, customer_type, category_id, category_name, tax_rate, base_price, price_with_tax
FROM products
WHERE product_id = 2;
```

```json
[
  {
    "product_id": 2,
    "product_name": "Novel",
    "customer_type": "standard",
    "category_id": 2,
    "category_name": "Books",
    "tax_rate": "0.0000",
    "base_price": "15.99",
    "price_with_tax": "15.99"
  }
]
```

## Update Customer Type - Should Recalculate FK and Chain

When customer_type changes, formula should recalculate FK, trigger new SYNC, and recalculate final formula.
'glamor' → Clothing/3

```sql
UPDATE products
SET customer_type = 'glamor'
WHERE product_id = 1;

SELECT product_id, product_name, customer_type, category_id, category_name, tax_rate, base_price, price_with_tax
FROM products
WHERE product_id = 1;
```

```json
[
  {
    "product_id": 1,
    "product_name": "Laptop",
    "customer_type": "glamor",
    "category_id": 3,
    "category_name": "Clothing",
    "tax_rate": "0.0650",
    "base_price": "1000.00",
    "price_with_tax": "1065.00"
  }
]
```

## Update Base Price - Should Only Recalculate Final Formula

When base_price changes, only the final formula should recalculate (FK and SYNC stay the same).

```sql
UPDATE products
SET base_price = 1200.00
WHERE product_id = 1;

SELECT product_id, product_name, customer_type, category_id, category_name, tax_rate, base_price, price_with_tax
FROM products
WHERE product_id = 1;
```

```json
[
  {
    "product_id": 1,
    "product_name": "Laptop",
    "customer_type": "glamor",
    "category_id": 3,
    "category_name": "Clothing",
    "tax_rate": "0.0650",
    "base_price": "1200.00",
    "price_with_tax": "1278.00"
  }
]
```

## Update Category Tax Rate - Should Push to Products

When parent tax_rate changes, it should push to products and trigger formula recalculation.

```sql
UPDATE categories
SET tax_rate = 0.0800
WHERE category_id = 3;

SELECT product_id, product_name, customer_type, category_id, category_name, tax_rate, base_price, price_with_tax
FROM products
WHERE product_id = 1;
```

```json
[
  {
    "product_id": 1,
    "product_name": "Laptop",
    "customer_type": "glamor",
    "category_id": 3,
    "category_name": "Clothing",
    "tax_rate": "0.0800",
    "base_price": "1200.00",
    "price_with_tax": "1296.00"
  }
]
```
