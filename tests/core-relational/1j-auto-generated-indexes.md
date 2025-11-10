# Test: 1J - Auto-Generated Indexes

Tests that GenLogic automatically creates indexes for primary keys, foreign keys, and unique constraints.

## Step 1: PK creates index automatically

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100)
```

## Verify PK index created

```json
{
  "newSchema": {
    "tables.customers": "@exists",
    "tables.customers.pkColumn": "id",
    "errors.length": 0
  }
}
```

## Query for PK index

```sql
SELECT
  i.relname as index_name,
  a.attname as column_name,
  ix.indisprimary as is_primary
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE t.relname = 'customers'
  AND ix.indisprimary = true
ORDER BY i.relname;
```

## Verify PK index exists

```json
[
  {"index_name": "customers_pkey", "column_name": "id", "is_primary": true}
]
```

## Step 2: FK creates index automatically

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100)

  orders:
    columns:
      id: serial primary key
      customer_id: FK customers
      order_date: date
```

## Verify FK index created

```json
{
  "newSchema": {
    "tables.orders": "@exists",
    "tables.orders.foreignKeys.fk_orders_customer_id": "@exists"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "orders"
  }
}
```

## Query for FK index

```sql
SELECT
  i.relname as index_name,
  a.attname as column_name
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE t.relname = 'orders'
  AND ix.indisprimary = false
  AND a.attname = 'customer_id'
ORDER BY i.relname;
```

## Verify FK index exists

```json
[
  {"index_name": "idx_orders_customer_id", "column_name": "customer_id"}
]
```

## Step 3: UNIQUE constraint creates index automatically

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100)

  orders:
    columns:
      id: serial primary key
      customer_id: FK customers
      order_date: date

  products:
    columns:
      id: serial primary key
      sku: varchar(50) unique
      name: varchar(100)
```

## Verify UNIQUE index created

```json
{
  "newSchema": {
    "tables.products": "@exists",
    "tables.products.columns.sku.isUnique": true
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "products"
  }
}
```

## Query for UNIQUE index

```sql
SELECT
  i.relname as index_name,
  a.attname as column_name,
  ix.indisunique as is_unique
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE t.relname = 'products'
  AND ix.indisprimary = false
  AND ix.indisunique = true
ORDER BY i.relname;
```

## Verify UNIQUE index exists

```json
[
  {"index_name": "products_sku_key", "column_name": "sku", "is_unique": true}
]
```

## Step 4: Multiple FKs create multiple indexes

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100)

  orders:
    columns:
      id: serial primary key
      customer_id: FK customers
      order_date: date

  products:
    columns:
      id: serial primary key
      sku: varchar(50) unique
      name: varchar(100)

  line_items:
    columns:
      id: serial primary key
      order_id: FK orders
      product_id: FK products
      quantity: integer
```

## Verify multiple FK indexes created

```json
{
  "newSchema": {
    "tables.line_items": "@exists",
    "tables.line_items.foreignKeys.fk_line_items_order_id": "@exists",
    "tables.line_items.foreignKeys.fk_line_items_product_id": "@exists"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "line_items"
  }
}
```

## Query for multiple FK indexes

```sql
SELECT
  i.relname as index_name,
  a.attname as column_name
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE t.relname = 'line_items'
  AND ix.indisprimary = false
ORDER BY i.relname, a.attname;
```

## Verify both FK indexes exist

```json
[
  {"index_name": "idx_line_items_order_id", "column_name": "order_id"},
  {"index_name": "idx_line_items_product_id", "column_name": "product_id"}
]
```

## Step 5: Composite unique creates index

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100)

  orders:
    columns:
      id: serial primary key
      customer_id: FK customers
      order_date: date

  products:
    columns:
      id: serial primary key
      sku: varchar(50) unique
      name: varchar(100)

  line_items:
    columns:
      id: serial primary key
      order_id: FK orders
      product_id: FK products
      quantity: integer

  inventory:
    columns:
      id: serial primary key
      warehouse: varchar(10)
      product_code: varchar(20)
      bin_location: varchar(10)
    unique:
      - [warehouse, product_code, bin_location]
```

## Verify composite unique index created

```json
{
  "newSchema": {
    "tables.inventory": "@exists",
    "tables.inventory.uniqueConstraints": "@exists"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "inventory"
  }
}
```

## Query for composite unique index

```sql
SELECT
  i.relname as index_name,
  array_agg(a.attname ORDER BY a.attnum) as columns,
  ix.indisunique as is_unique
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE t.relname = 'inventory'
  AND ix.indisprimary = false
  AND ix.indisunique = true
GROUP BY i.relname, ix.indisunique
ORDER BY i.relname;
```

## Verify composite unique index on three columns

```json
[
  {"index_name": "inventory_warehouse_product_code_bin_location_key", "columns": ["warehouse", "product_code", "bin_location"], "is_unique": true}
]
```

## Summary query: Count all auto-generated indexes

```sql
SELECT
  t.relname as table_name,
  COUNT(i.relname) as index_count,
  COUNT(CASE WHEN ix.indisprimary THEN 1 END) as pk_indexes,
  COUNT(CASE WHEN ix.indisunique AND NOT ix.indisprimary THEN 1 END) as unique_indexes,
  COUNT(CASE WHEN NOT ix.indisunique AND NOT ix.indisprimary THEN 1 END) as fk_indexes
FROM pg_class t
LEFT JOIN pg_index ix ON t.oid = ix.indrelid
LEFT JOIN pg_class i ON i.oid = ix.indexrelid
WHERE t.relkind = 'r'
  AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY t.relname
ORDER BY t.relname;
```

## Summary of all indexes

```json
[
  {"table_name": "customers", "index_count": "1", "pk_indexes": "1", "unique_indexes": "0", "fk_indexes": "0"},
  {"table_name": "inventory", "index_count": "2", "pk_indexes": "1", "unique_indexes": "1", "fk_indexes": "0"},
  {"table_name": "line_items", "index_count": "3", "pk_indexes": "1", "unique_indexes": "0", "fk_indexes": "2"},
  {"table_name": "orders", "index_count": "2", "pk_indexes": "1", "unique_indexes": "0", "fk_indexes": "1"},
  {"table_name": "products", "index_count": "2", "pk_indexes": "1", "unique_indexes": "1", "fk_indexes": "0"}
]
```
