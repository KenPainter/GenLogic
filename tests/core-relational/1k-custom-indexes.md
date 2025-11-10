# Test: 1K - Custom Indexes

Tests custom indexes defined in the schema for performance optimization.

## Step 1: Single column custom index

```yaml
tables:
  products:
    columns:
      id: serial primary key
      name: varchar(100)
      category: varchar(50)
      price: numeric(10,2)
    indexes:
      - [category]
```

## Verify single column index created

```json
{
  "newSchema": {
    "tables.products": "@exists",
    "tables.products.indexes": "@exists",
    "errors.length": 0
  }
}
```

## Query for custom index

```sql
SELECT
  i.relname as index_name,
  a.attname as column_name,
  ix.indisunique as is_unique,
  ix.indisprimary as is_primary
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE t.relname = 'products'
  AND ix.indisprimary = false
  AND i.relname LIKE 'idx_%'
ORDER BY i.relname;
```

## Verify category index exists

```json
[
  {"index_name": "idx_products_category", "column_name": "category", "is_unique": false, "is_primary": false}
]
```

## Test index improves query performance

```sql
INSERT INTO products (name, category, price) VALUES ('Widget A', 'Electronics', 19.99);
INSERT INTO products (name, category, price) VALUES ('Widget B', 'Electronics', 29.99);
INSERT INTO products (name, category, price) VALUES ('Gadget A', 'Tools', 39.99);
SELECT name, category, price FROM products WHERE category = 'Electronics' ORDER BY name;
```

## Verify indexed query works

```json
[
  {"name": "Widget A", "category": "Electronics", "price": "19.99"},
  {"name": "Widget B", "category": "Electronics", "price": "29.99"}
]
```

## Step 2: Multi-column composite index

```yaml
tables:
  products:
    columns:
      id: serial primary key
      name: varchar(100)
      category: varchar(50)
      price: numeric(10,2)
    indexes:
      - [category]

  orders:
    columns:
      id: serial primary key
      customer_id: integer
      order_date: date
      status: varchar(20)
    indexes:
      - [customer_id, order_date]
```

## Verify composite index created

```json
{
  "newSchema": {
    "tables.orders": "@exists",
    "tables.orders.indexes": "@exists"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "orders"
  }
}
```

## Query for composite index

```sql
SELECT
  i.relname as index_name,
  array_agg(a.attname ORDER BY a.attnum) as columns
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE t.relname = 'orders'
  AND ix.indisprimary = false
  AND i.relname LIKE 'idx_%'
GROUP BY i.relname
ORDER BY i.relname;
```

## Verify composite index on customer_id and order_date

```json
[
  {"index_name": "idx_orders_customer_id_order_date", "columns": "{customer_id,order_date}"}
]
```

## Test composite index query

```sql
INSERT INTO orders (customer_id, order_date, status) VALUES (1001, '2025-01-10', 'pending');
INSERT INTO orders (customer_id, order_date, status) VALUES (1001, '2025-01-15', 'shipped');
INSERT INTO orders (customer_id, order_date, status) VALUES (1002, '2025-01-12', 'pending');
SELECT customer_id, order_date, status
FROM orders
WHERE customer_id = 1001
ORDER BY order_date;
```

## Verify composite indexed query

```json
[
  {"customer_id": 1001, "order_date": "2025-01-10T00:00:00.000Z", "status": "pending"},
  {"customer_id": 1001, "order_date": "2025-01-15T00:00:00.000Z", "status": "shipped"}
]
```

## Step 3: Multiple indexes on same table

```yaml
tables:
  products:
    columns:
      id: serial primary key
      name: varchar(100)
      category: varchar(50)
      price: numeric(10,2)
    indexes:
      - [category]

  orders:
    columns:
      id: serial primary key
      customer_id: integer
      order_date: date
      status: varchar(20)
    indexes:
      - [customer_id, order_date]

  employees:
    columns:
      id: serial primary key
      first_name: varchar(50)
      last_name: varchar(50)
      department: varchar(50)
      hire_date: date
    indexes:
      - [last_name]
      - [department]
      - [hire_date]
```

## Verify multiple indexes on same table

```json
{
  "newSchema": {
    "tables.employees": "@exists",
    "tables.employees.indexes": "@exists"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "employees"
  }
}
```

## Query for multiple indexes

```sql
SELECT
  i.relname as index_name,
  a.attname as column_name
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE t.relname = 'employees'
  AND ix.indisprimary = false
  AND i.relname LIKE 'idx_%'
ORDER BY i.relname, a.attname;
```

## Verify all three indexes exist

```json
[
  {"index_name": "idx_employees_department", "column_name": "department"},
  {"index_name": "idx_employees_hire_date", "column_name": "hire_date"},
  {"index_name": "idx_employees_last_name", "column_name": "last_name"}
]
```

## Test multiple index queries

```sql
INSERT INTO employees (first_name, last_name, department, hire_date)
VALUES ('Alice', 'Smith', 'Engineering', '2025-01-01');
INSERT INTO employees (first_name, last_name, department, hire_date)
VALUES ('Bob', 'Jones', 'Engineering', '2025-01-05');
INSERT INTO employees (first_name, last_name, department, hire_date)
VALUES ('Charlie', 'Smith', 'Sales', '2025-01-03');
SELECT last_name, department, hire_date FROM employees WHERE department = 'Engineering' ORDER BY hire_date;
```

## Verify indexed queries work

```json
[
  {"last_name": "Smith", "department": "Engineering", "hire_date": "2025-01-01T00:00:00.000Z"},
  {"last_name": "Jones", "department": "Engineering", "hire_date": "2025-01-05T00:00:00.000Z"}
]
```

## Step 4: Three-column composite index

```yaml
tables:
  products:
    columns:
      id: serial primary key
      name: varchar(100)
      category: varchar(50)
      price: numeric(10,2)
    indexes:
      - [category]

  orders:
    columns:
      id: serial primary key
      customer_id: integer
      order_date: date
      status: varchar(20)
    indexes:
      - [customer_id, order_date]

  employees:
    columns:
      id: serial primary key
      first_name: varchar(50)
      last_name: varchar(50)
      department: varchar(50)
      hire_date: date
    indexes:
      - [last_name]
      - [department]
      - [hire_date]

  shipments:
    columns:
      id: serial primary key
      warehouse: varchar(10)
      carrier: varchar(50)
      ship_date: date
      status: varchar(20)
    indexes:
      - [warehouse, carrier, ship_date]
```

## Verify three-column composite index

```json
{
  "newSchema": {
    "tables.shipments": "@exists",
    "tables.shipments.indexes": "@exists"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "shipments"
  }
}
```

## Query for three-column composite index

```sql
SELECT
  i.relname as index_name,
  array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) as columns
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE t.relname = 'shipments'
  AND ix.indisprimary = false
GROUP BY i.relname
ORDER BY i.relname;
```

## Verify three-column composite index

```json
[
  {"index_name": "idx_shipments_warehouse_carrier_ship_date", "columns": "{warehouse,carrier,ship_date}"}
]
```

## Test three-column composite index query

```sql
INSERT INTO shipments (warehouse, carrier, ship_date, status)
VALUES ('WH1', 'FedEx', '2025-01-10', 'shipped');
INSERT INTO shipments (warehouse, carrier, ship_date, status)
VALUES ('WH1', 'FedEx', '2025-01-11', 'shipped');
INSERT INTO shipments (warehouse, carrier, ship_date, status)
VALUES ('WH1', 'UPS', '2025-01-10', 'pending');
SELECT warehouse, carrier, ship_date, status
FROM shipments
WHERE warehouse = 'WH1' AND carrier = 'FedEx'
ORDER BY ship_date;
```

## Verify three-column indexed query

```json
[
  {"warehouse": "WH1", "carrier": "FedEx", "ship_date": "2025-01-10T00:00:00.000Z", "status": "shipped"},
  {"warehouse": "WH1", "carrier": "FedEx", "ship_date": "2025-01-11T00:00:00.000Z", "status": "shipped"}
]
```

## Summary query: Count all custom indexes

```sql
SELECT
  t.relname as table_name,
  COUNT(i.relname) as custom_index_count
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
WHERE t.relkind = 'r'
  AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND ix.indisprimary = false
  AND NOT ix.indisunique
  AND i.relname LIKE 'idx_%'
GROUP BY t.relname
HAVING COUNT(i.relname) > 0
ORDER BY t.relname;
```

## Summary of custom indexes

```json
[
  {"table_name": "employees", "custom_index_count": "3"},
  {"table_name": "orders", "custom_index_count": "1"},
  {"table_name": "products", "custom_index_count": "1"},
  {"table_name": "shipments", "custom_index_count": "1"}
]
```
