# 5A4: No Auto-Delete Parent

Tests that GenLogic does NOT delete parent rows when all children are removed.

This is an explicit design decision: GenLogic auto-creates parents for convenience, but never auto-deletes them to err on the side of safety and avoid data loss.

Covers: auto-create parent, delete all children, verify parent persists.

## Build Schema

```yaml
tables:
  categories:
    columns:
      category_id: serial primary key
      category_name: varchar(100)
      created_at: timestamp default CURRENT_TIMESTAMP

  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      category_id: FK(categories) auto create parent
```

## Insert Product Without Existing Category

This will auto-create the parent category.

```sql
INSERT INTO products (product_name, category_id)
VALUES ('Widget', 100);
```

## Verify Parent Auto-Created

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

## Insert More Products with Same Category

```sql
INSERT INTO products (product_name, category_id)
VALUES
  ('Gadget', 100),
  ('Doohickey', 100),
  ('Thingamajig', 100);
```

## Verify All Products Created

```sql
SELECT COUNT(*) as product_count
FROM products
WHERE category_id = 100;
```

```json
[
  {
    "product_count": "4"
  }
]
```

## Delete All Products in Category

Now delete all children referencing the parent.

```sql
DELETE FROM products
WHERE category_id = 100;
```

## Verify All Products Deleted

```sql
SELECT COUNT(*) as product_count
FROM products
WHERE category_id = 100;
```

```json
[
  {
    "product_count": "0"
  }
]
```

## Verify Parent Still Exists

The parent category should NOT be auto-deleted, even though no children remain.

```sql
SELECT category_id, category_name
FROM categories
WHERE category_id = 100;
```

```json
[
  {
    "category_id": 100,
    "category_name": null
  }
]
```

## Update Orphaned Parent

The auto-created parent can still be updated or manually deleted.

```sql
UPDATE categories
SET category_name = 'Archived Products'
WHERE category_id = 100;
```

## Verify Parent Updated

```sql
SELECT category_id, category_name
FROM categories
WHERE category_id = 100;
```

```json
[
  {
    "category_id": 100,
    "category_name": "Archived Products"
  }
]
```

## Manual Delete of Orphaned Parent

Parents can be manually deleted when no children reference them.

```sql
DELETE FROM categories
WHERE category_id = 100;
```

## Verify Parent Deleted

```sql
SELECT COUNT(*) as category_count
FROM categories
WHERE category_id = 100;
```

```json
[
  {
    "category_count": "0"
  }
]
```
