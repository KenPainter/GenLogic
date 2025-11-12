# 5A1: Basic Auto-Create Parent

Tests the auto-create parent feature: inserting a child with a non-existent parent FK(automatically) creates the parent row.
Covers: basic auto-create, verify parent created, verify child references correct parent.

## Build Schema

```yaml
tables:
  categories:
    columns:
      category_id: serial primary key
      category_name: varchar(100)

  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      category_id: FK(categories) auto create parent
```

## Insert Product Without Existing Category

```sql
INSERT INTO products (product_name, category_id)
VALUES ('Widget', 100);
```

## Verify Product Created

```sql
SELECT product_id, product_name, category_id
FROM products;
```

```json
[
  {
    "product_id": 100,
    "product_name": "Widget",
    "category_id": 100
  }
]
```

## Verify Parent Category Auto-Created

```sql
SELECT category_id, category_name
FROM categories;
```

```json
[
  {
    "category_id": 100,
    "category_name": null
  }
]
```

## Insert Another Product with Same Category

```sql
INSERT INTO products (product_name, category_id)
VALUES ('Gadget', 100);
```

## Verify No Duplicate Parent Created

```sql
SELECT category_id, category_name
FROM categories
ORDER BY category_id;
```

```json
[
  {
    "category_id": 100,
    "category_name": null
  }
]
```

## Verify Both Products Reference Same Parent

```sql
SELECT product_id, product_name, category_id
FROM products
ORDER BY product_id;
```

```json
[
  {
    "product_id": 100,
    "product_name": "Widget",
    "category_id": 100
  },
  {
    "product_id": 101,
    "product_name": "Gadget",
    "category_id": 100
  }
]
```

## Insert Product with Different Category

```sql
INSERT INTO products (product_name, category_id)
VALUES ('Doohickey', 200);
```

## Verify Second Parent Created

```sql
SELECT category_id, category_name
FROM categories
ORDER BY category_id;
```

```json
[
  {
    "category_id": 100,
    "category_name": null
  },
  {
    "category_id": 200,
    "category_name": null
  }
]
```

## Update Category Name (Manually)

```sql
UPDATE categories
SET category_name = 'Electronics'
WHERE category_id = 100;
```

## Verify Category Updated

```sql
SELECT category_id, category_name
FROM categories
WHERE category_id = 100;
```

```json
[
  {
    "category_id": 100,
    "category_name": "Electronics"
  }
]
```

## Insert Product with Existing Category

```sql
INSERT INTO categories (category_id, category_name)
VALUES (300, 'Home & Garden');

INSERT INTO products (product_name, category_id)
VALUES ('Hammer', 300);
```

## Verify Existing Category Not Duplicated

```sql
SELECT category_id, category_name
FROM categories
ORDER BY category_id;
```

```json
[
  {
    "category_id": 100,
    "category_name": "Electronics"
  },
  {
    "category_id": 200,
    "category_name": null
  },
  {
    "category_id": 300,
    "category_name": "Home & Garden"
  }
]
```
