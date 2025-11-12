# Test: 1N - Live Schema Detection

Tests that GenLogic correctly detects existing database schema and populates .live.json
with accurate information about tables, columns, constraints, and indexes.

## Step 1: Create initial schema

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100) not null
      email: varchar(255) unique
```

## Verify initial build created tables

```json
{
  "newSchema": {
    "tables.customers": "@exists",
    "tables.customers.pkColumn": "id",
    "tables.customers.columns.id.type": "integer",
    "tables.customers.columns.name.type": "character varying",
    "tables.customers.columns.name.nullable": false,
    "tables.customers.columns.email.type": "character varying",
    "tables.customers.columns.email.isUnique": true,
    "tables.customers.uniqueConstraints": "@exists",
    "errors.length": 0
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "customers"
  }
}
```

## Verify table exists in database

```sql
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'customers'
  AND table_schema = 'public'
ORDER BY ordinal_position;
```

## Confirm customers table structure

```json
[
  {"table_name": "customers", "column_name": "id", "data_type": "integer", "is_nullable": "NO"},
  {"table_name": "customers", "column_name": "name", "data_type": "character varying", "is_nullable": "NO"},
  {"table_name": "customers", "column_name": "email", "data_type": "character varying", "is_nullable": "YES"}
]
```

## Insert test data

```sql
INSERT INTO customers (name, email) VALUES ('Alice', 'alice@example.com');
SELECT name, email FROM customers;
```

## Verify data inserted

```json
[
  {"name": "Alice", "email": "alice@example.com"}
]
```

## Step 2: Add table with FK(relationship)

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100) not null
      email: varchar(255) unique

  orders:
    columns:
      id: serial primary key
      customer_id: FK(customers) not null
      order_date: date
      total: numeric(10,2)
    constraints:
      - total >= 0
```

## Verify live schema detected existing customers table

```json
{
  "newSchema": {
    "tables.customers": "@exists",
    "tables.orders": "@exists",
    "tables.orders.foreignKeys.fk_orders_customer_id": "@exists",
    "tables.orders.foreignKeys.fk_orders_customer_id.parentTable": "customers"
  },
  "live": {
    "tables.customers": "@exists",
    "tables.customers.pkColumn": "id",
    "tables.customers.columns.id": "@exists",
    "tables.customers.columns.name": "@exists",
    "tables.customers.columns.email": "@exists"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "orders",
    "tablesToDrop.length": 0
  }
}
```

## Verify both tables exist in database

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('customers', 'orders')
ORDER BY table_name;
```

## Confirm both tables created

```json
[
  {"table_name": "customers"},
  {"table_name": "orders"}
]
```

## Insert order data

```sql
INSERT INTO orders (customer_id, order_date, total) VALUES (100, '2025-01-15', 99.99);
SELECT customer_id, order_date, total FROM orders;
```

## Verify order inserted

```json
[
  {"customer_id": 100, "order_date": "2025-01-15T00:00:00.000Z", "total": "99.99"}
]
```

## Step 3: Add table with multiple constraints

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100) not null
      email: varchar(255) unique

  orders:
    columns:
      id: serial primary key
      customer_id: FK(customers) not null
      order_date: date
      total: numeric(10,2)
    constraints:
      - total >= 0

  products:
    columns:
      id: serial primary key
      sku: varchar(50) unique not null
      name: varchar(100) not null
      price: numeric(10,2)
      stock: integer
    constraints:
      - price > 0
      - stock >= 0
    indexes:
      - [name]
```

## Verify live schema detects all constraints

```json
{
  "newSchema": {
    "tables.products": "@exists",
    "tables.products.columns.sku.isUnique": true,
    "tables.products.columns.sku.nullable": false,
    "tables.products.constraints": "@exists",
    "tables.products.indexes": "@exists"
  },
  "live": {
    "tables.customers": "@exists",
    "tables.orders": "@exists",
    "tables.orders.pkColumn": "id"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "products",
    "foreignKeysToAdd.length": 0,
    "constraintsToAdd.length": 2,
    "indexesToAdd.length": 1
  }
}
```

## Verify three tables exist in database

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('customers', 'orders', 'products')
ORDER BY table_name;
```

## Confirm three tables created

```json
[
  {"table_name": "customers"},
  {"table_name": "orders"},
  {"table_name": "products"}
]
```

## Insert product data

```sql
INSERT INTO products (sku, name, price, stock) VALUES ('WIDGET-001', 'Widget', 19.99, 100);
SELECT sku, name, price, stock FROM products;
```

## Verify product inserted

```json
[
  {"sku": "WIDGET-001", "name": "Widget", "price": "19.99", "stock": 100}
]
```

## Step 4: Add table with composite unique constraint

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100) not null
      email: varchar(255) unique

  orders:
    columns:
      id: serial primary key
      customer_id: FK(customers) not null
      order_date: date
      total: numeric(10,2)
    constraints:
      - total >= 0

  products:
    columns:
      id: serial primary key
      sku: varchar(50) unique not null
      name: varchar(100) not null
      price: numeric(10,2)
      stock: integer
    constraints:
      - price > 0
      - stock >= 0
    indexes:
      - [name]

  inventory:
    columns:
      id: serial primary key
      warehouse: varchar(10)
      product_sku: varchar(50)
      quantity: integer
    unique-constraints:
      - [warehouse, product_sku]
```

## Verify live schema detects composite unique

```json
{
  "newSchema": {
    "tables.inventory": "@exists",
    "tables.inventory.uniqueConstraints": "@exists"
  },
  "live": {
    "tables.customers": "@exists",
    "tables.orders": "@exists",
    "tables.products": "@exists",
    "tables.products.pkColumn": "id"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "inventory"
  }
}
```

## Verify all four tables exist in database

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('customers', 'orders', 'products', 'inventory')
ORDER BY table_name;
```

## Confirm all four tables created

```json
[
  {"table_name": "customers"},
  {"table_name": "inventory"},
  {"table_name": "orders"},
  {"table_name": "products"}
]
```

## Insert inventory data

```sql
INSERT INTO inventory (warehouse, product_sku, quantity) VALUES ('WH1', 'WIDGET-001', 50);
INSERT INTO inventory (warehouse, product_sku, quantity) VALUES ('WH2', 'WIDGET-001', 30);
SELECT warehouse, product_sku, quantity FROM inventory ORDER BY warehouse;
```

## Verify inventory inserted

```json
[
  {"warehouse": "WH1", "product_sku": "WIDGET-001", "quantity": 50},
  {"warehouse": "WH2", "product_sku": "WIDGET-001", "quantity": 30}
]
```

## Step 5: Verify live schema detects all tables

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100) not null
      email: varchar(255) unique

  orders:
    columns:
      id: serial primary key
      customer_id: FK(customers) not null
      order_date: date
      total: numeric(10,2)
    constraints:
      - total >= 0

  products:
    columns:
      id: serial primary key
      sku: varchar(50) unique not null
      name: varchar(100) not null
      price: numeric(10,2)
      stock: integer
    constraints:
      - price > 0
      - stock >= 0
    indexes:
      - [name]

  inventory:
    columns:
      id: serial primary key
      warehouse: varchar(10)
      product_sku: varchar(50)
      quantity: integer
    unique-constraints:
      - [warehouse, product_sku]
```

## Verify complete live schema detection

```json
{
  "live": {
    "tables.customers": "@exists",
    "tables.customers.pkColumn": "id",
    "tables.customers.columns.id": "@exists",
    "tables.customers.columns.name": "@exists",
    "tables.customers.columns.email": "@exists",
    "tables.orders": "@exists",
    "tables.orders.pkColumn": "id",
    "tables.orders.columns.customer_id": "@exists",
    "tables.orders.foreignKeys.fk_orders_customer_id": "@exists",
    "tables.products": "@exists",
    "tables.products.pkColumn": "id",
    "tables.products.columns.sku": "@exists",
    "tables.products.indexes": "@exists",
    "tables.inventory": "@exists",
    "tables.inventory.pkColumn": "id",
    "tables.inventory.uniqueConstraints": "@exists"
  },
  "diff": {
    "tablesToCreate.length": 0,
    "tablesToDrop.length": 0,
    "columnsToAdd.length": 0,
    "columnsToDrop.length": 0,
    "columnsToModify.length": 0
  }
}
```

## Query information_schema to verify live detection accuracy

```sql
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('customers', 'orders', 'products', 'inventory')
ORDER BY table_name, ordinal_position
LIMIT 12;
```

## Verify live schema matches database

```json
[
  {"table_name": "customers", "column_name": "id", "data_type": "integer", "is_nullable": "NO", "column_default": "nextval('customers_id_seq'::regclass)"},
  {"table_name": "customers", "column_name": "name", "data_type": "character varying", "is_nullable": "NO", "column_default": null},
  {"table_name": "customers", "column_name": "email", "data_type": "character varying", "is_nullable": "YES", "column_default": null},
  {"table_name": "inventory", "column_name": "id", "data_type": "integer", "is_nullable": "NO", "column_default": "nextval('inventory_id_seq'::regclass)"},
  {"table_name": "inventory", "column_name": "warehouse", "data_type": "character varying", "is_nullable": "YES", "column_default": null},
  {"table_name": "inventory", "column_name": "product_sku", "data_type": "character varying", "is_nullable": "YES", "column_default": null},
  {"table_name": "inventory", "column_name": "quantity", "data_type": "integer", "is_nullable": "YES", "column_default": null},
  {"table_name": "orders", "column_name": "id", "data_type": "integer", "is_nullable": "NO", "column_default": "nextval('orders_id_seq'::regclass)"},
  {"table_name": "orders", "column_name": "customer_id", "data_type": "integer", "is_nullable": "NO", "column_default": null},
  {"table_name": "orders", "column_name": "order_date", "data_type": "date", "is_nullable": "YES", "column_default": null},
  {"table_name": "orders", "column_name": "total", "data_type": "numeric", "is_nullable": "YES", "column_default": null},
  {"table_name": "products", "column_name": "id", "data_type": "integer", "is_nullable": "NO", "column_default": "nextval('products_id_seq'::regclass)"}
]
```

## Verify all data preserved through live schema detection

```sql
SELECT
  (SELECT COUNT(*) FROM customers) as customers,
  (SELECT COUNT(*) FROM orders) as orders,
  (SELECT COUNT(*) FROM products) as products,
  (SELECT COUNT(*) FROM inventory) as inventory;
```

## All data intact

```json
[
  {"customers": "1", "orders": "1", "products": "1", "inventory": "2"}
]
```
