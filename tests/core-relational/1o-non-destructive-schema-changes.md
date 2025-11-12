# 1O: Non-Destructive Schema Changes

Tests that GenLogic never drops tables or columns when they are removed from the YAML schema.
This is a core safety guarantee: GenLogic only adds, never removes.

## Build Initial Schema with Multiple Tables

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      description: text
      price: numeric(10,2)

  legacy_data:
    columns:
      legacy_id: serial primary key
      legacy_code: varchar(50)
      legacy_description: text
      created_at: timestamp default CURRENT_TIMESTAMP
```

## Insert Data Into Both Tables

```sql
INSERT INTO products (product_name, description, price)
VALUES ('Widget', 'A useful widget', 29.99);

INSERT INTO legacy_data (legacy_code, legacy_description)
VALUES ('LEGACY-001', 'This data must survive schema changes');
```

## Verify Initial Data

```sql
SELECT product_id, product_name FROM products;
```

```json
[
  {
    "product_id": 100,
    "product_name": "Widget"
  }
]
```

```sql
SELECT legacy_id, legacy_code FROM legacy_data;
```

```json
[
  {
    "legacy_id": 100,
    "legacy_code": "LEGACY-001"
  }
]
```

## Rebuild Schema WITHOUT legacy_data Table and WITHOUT description Column

Simulate removing obsolete table and column from YAML.

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      # description column removed
      price: numeric(10,2)

  # legacy_data table completely removed
```

## Verify Removed Table Still Exists

GenLogic should NOT drop legacy_data table.

```sql
SELECT legacy_id, legacy_code, legacy_description
FROM legacy_data
ORDER BY legacy_id;
```

```json
[
  {
    "legacy_id": 100,
    "legacy_code": "LEGACY-001",
    "legacy_description": "This data must survive schema changes"
  }
]
```

## Verify Removed Column Still Exists

GenLogic should NOT drop products.description column.

```sql
SELECT product_id, product_name, description, price
FROM products
ORDER BY product_id;
```

```json
[
  {
    "product_id": 100,
    "product_name": "Widget",
    "description": "A useful widget",
    "price": "29.99"
  }
]
```

## Verify New Inserts Work on Non-Managed Table

The legacy_data table should still be fully functional.

```sql
INSERT INTO legacy_data (legacy_code, legacy_description)
VALUES ('LEGACY-002', 'Another legacy record');

SELECT legacy_id, legacy_code FROM legacy_data ORDER BY legacy_id;
```

```json
[
  {
    "legacy_id": 100,
    "legacy_code": "LEGACY-001"
  },
  {
    "legacy_id": 101,
    "legacy_code": "LEGACY-002"
  }
]
```

## Add More Data Using Removed Column

The description column should still be fully functional.

```sql
INSERT INTO products (product_name, description, price)
VALUES ('Gadget', 'A fancy gadget', 49.99);

SELECT product_id, product_name, description FROM products ORDER BY product_id;
```

```json
[
  {
    "product_id": 100,
    "product_name": "Widget",
    "description": "A useful widget"
  },
  {
    "product_id": 101,
    "product_name": "Gadget",
    "description": "A fancy gadget"
  }
]
```
