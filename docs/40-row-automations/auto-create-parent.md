Previous: [Aggregations to Parent](../30-column-automations/aggregations.md) | Next: [Seed Rows](../50-seed-data/seed-data.md)

# Auto-Create Parent

Auto-create parent automatically creates a parent row when inserting a child with a non-existent foreign key value.

## Use Cases

Auto-create parent is useful for:
- Summary tables - auto create parent rows with aggregations
  (sits in the same space as materialized summary views, but
  they do not get stale)
- Lookup tables that grow dynamically
- Importing data where parent records may not exist yet
- Development and testing with incomplete data


## There is no Auto-Delete Parent

GenLogic does not delete a parent row when no children remain.
This is to err on the side of safety.  While it may be desirable
in the summary table use case, the results in other cases would
be data loss.

## Basic Auto-Create

Add `auto create parent` to a foreign key definition:

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

Insert a product with a category that doesn't exist:

```sql
INSERT INTO products (product_name, category_id)
VALUES ('Widget', 100);
```

GenLogic creates a category row with `category_id = 100` automatically. The category_name is NULL.

Verify the parent was created:

```sql
SELECT category_id, category_name
FROM categories;
```

Result:
```
category_id | category_name
------------+--------------
        100 | NULL
```

## No Duplicate Parents

Inserting another product with the same category_id does not create a duplicate parent:

```sql
INSERT INTO products (product_name, category_id)
VALUES ('Gadget', 100);
```

The categories table still has only one row with `category_id = 100`.

## Existing Parents

If the parent already exists, auto-create does nothing:

```sql
INSERT INTO categories (category_id, category_name)
VALUES (200, 'Electronics');

INSERT INTO products (product_name, category_id)
VALUES ('Laptop', 200);
```

The existing category is used. No duplicate is created.

## Populating Auto-Created Parents

Auto-created parent rows have only the primary key populated. Other columns are NULL or use their default values.

Update auto-created parents manually:

```sql
UPDATE categories
SET category_name = 'Hardware'
WHERE category_id = 100;
```

## Multi-Level Auto-Create

Auto-create works across multiple levels:

```yaml
tables:
  regions:
    columns:
      region_id: serial primary key
      region_name: varchar(100)

  stores:
    columns:
      store_id: serial primary key
      store_name: varchar(100)
      region_id: FK(regions) auto create parent

  orders:
    columns:
      order_id: serial primary key
      order_date: date
      store_id: FK(stores) auto create parent
```

Insert an order with non-existent store and region:

```sql
INSERT INTO orders (order_date, store_id)
VALUES ('2025-01-15', 100);
```

GenLogic creates:
1. A region row (because the store will need a region_id)
2. A store row with `store_id = 100`
3. The order row

All parent rows are created automatically.

---

Previous: [Aggregations to Parent](../30-column-automations/aggregations.md) | Next: [Seed Rows](../50-seed-data/seed-data.md)
