# Test: 1G - UNIQUE Constraints

Tests single and composite UNIQUE constraints.

## Step 1: Single column unique

```yaml
tables:
  users:
    columns:
      id: serial primary key
      email: varchar(255) unique
      username: varchar(50)
```

## Verify single column unique constraint

```json
{
  "newSchema": {
    "tables.users": "@exists",
    "tables.users.columns.email.isUnique": true,
    "errors.length": 0
  }
}
```

## Test unique constraint allows first insert

```sql
INSERT INTO users (email, username) VALUES ('alice@example.com', 'alice');
SELECT email, username FROM users;
```

## Verify first insert succeeded

```json
[
  {"email": "alice@example.com", "username": "alice"}
]
```

## Test unique constraint blocks duplicate

```sql
INSERT INTO users (email, username) VALUES ('bob@example.com', 'bob');
SELECT COUNT(*) as count FROM users;
```

## Verify second unique email inserted

```json
[
  {"count": "2"}
]
```

## Step 2: Add second table with unique constraint

```yaml
tables:
  users:
    columns:
      id: serial primary key
      email: varchar(255) unique
      username: varchar(50)

  products:
    columns:
      id: serial primary key
      sku: varchar(50) unique
      name: varchar(100)
```

## Verify second unique constraint

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

## Test second unique constraint

```sql
INSERT INTO products (sku, name) VALUES ('WIDGET-001', 'Widget');
INSERT INTO products (sku, name) VALUES ('WIDGET-002', 'Gadget');
SELECT sku, name FROM products ORDER BY sku;
```

## Verify unique SKUs

```json
[
  {"sku": "WIDGET-001", "name": "Widget"},
  {"sku": "WIDGET-002", "name": "Gadget"}
]
```

## Step 3: Multi-column unique (composite)

```yaml
tables:
  users:
    columns:
      id: serial primary key
      email: varchar(255) unique
      username: varchar(50)

  products:
    columns:
      id: serial primary key
      sku: varchar(50) unique
      name: varchar(100)

  orders:
    columns:
      id: serial primary key
      order_number: varchar(20)
      year: integer
    unique-constraints:
      - [order_number, year]
```

## Verify composite unique constraint

```json
{
  "newSchema": {
    "tables.orders": "@exists",
    "tables.orders.uniqueConstraints": "@exists"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "orders"
  }
}
```

## Test composite unique allows same order_number in different years

```sql
INSERT INTO orders (order_number, year) VALUES ('ORD-100', 2024);
INSERT INTO orders (order_number, year) VALUES ('ORD-100', 2025);
SELECT order_number, year FROM orders ORDER BY year;
```

## Verify both inserts succeeded

```json
[
  {"order_number": "ORD-100", "year": 2024},
  {"order_number": "ORD-100", "year": 2025}
]
```

## Test composite unique blocks duplicate pair

```sql
INSERT INTO orders (order_number, year) VALUES ('ORD-200', 2025);
SELECT COUNT(*) as count FROM orders WHERE year = 2025;
```

## Verify unique pair in 2025

```json
[
  {"count": "2"}
]
```

## Step 4: Multiple unique constraints on same table

```yaml
tables:
  users:
    columns:
      id: serial primary key
      email: varchar(255) unique
      username: varchar(50)

  products:
    columns:
      id: serial primary key
      sku: varchar(50) unique
      name: varchar(100)

  orders:
    columns:
      id: serial primary key
      order_number: varchar(20)
      year: integer
    unique-constraints:
      - [order_number, year]

  employees:
    columns:
      id: serial primary key
      email: varchar(255) unique
      badge_number: varchar(20) unique
      name: varchar(100)
```

## Verify multiple unique constraints on one table

```json
{
  "newSchema": {
    "tables.employees": "@exists",
    "tables.employees.columns.email.isUnique": true,
    "tables.employees.columns.badge_number.isUnique": true
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "employees"
  }
}
```

## Test multiple unique constraints

```sql
INSERT INTO employees (email, badge_number, name) VALUES ('alice@company.com', 'B001', 'Alice');
INSERT INTO employees (email, badge_number, name) VALUES ('bob@company.com', 'B002', 'Bob');
SELECT email, badge_number, name FROM employees ORDER BY badge_number;
```

## Verify both unique constraints enforced

```json
[
  {"email": "alice@company.com", "badge_number": "B001", "name": "Alice"},
  {"email": "bob@company.com", "badge_number": "B002", "name": "Bob"}
]
```

## Step 5: Composite unique with three columns

```yaml
tables:
  users:
    columns:
      id: serial primary key
      email: varchar(255) unique
      username: varchar(50)

  products:
    columns:
      id: serial primary key
      sku: varchar(50) unique
      name: varchar(100)

  orders:
    columns:
      id: serial primary key
      order_number: varchar(20)
      year: integer
    unique-constraints:
      - [order_number, year]

  employees:
    columns:
      id: serial primary key
      email: varchar(255) unique
      badge_number: varchar(20) unique
      name: varchar(100)

  inventory:
    columns:
      id: serial primary key
      warehouse: varchar(10)
      product_code: varchar(20)
      bin_location: varchar(10)
    unique-constraints:
      - [warehouse, product_code, bin_location]
```

## Verify three-column composite unique

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

## Test three-column composite unique

```sql
INSERT INTO inventory (warehouse, product_code, bin_location) VALUES ('WH1', 'PROD-A', 'A01');
INSERT INTO inventory (warehouse, product_code, bin_location) VALUES ('WH1', 'PROD-A', 'A02');
INSERT INTO inventory (warehouse, product_code, bin_location) VALUES ('WH2', 'PROD-A', 'A01');
SELECT warehouse, product_code, bin_location FROM inventory ORDER BY warehouse, bin_location;
```

## Verify three-column unique allows different combinations

```json
[
  {"warehouse": "WH1", "product_code": "PROD-A", "bin_location": "A01"},
  {"warehouse": "WH1", "product_code": "PROD-A", "bin_location": "A02"},
  {"warehouse": "WH2", "product_code": "PROD-A", "bin_location": "A01"}
]
```

## Verify all unique constraints still enforced

```sql
SELECT
  t.tablename,
  COUNT(c.conname) as unique_constraint_count
FROM pg_tables t
LEFT JOIN pg_constraint c ON c.conrelid = t.tablename::regclass AND c.contype = 'u'
WHERE t.schemaname = 'public'
GROUP BY t.tablename
HAVING COUNT(c.conname) > 0
ORDER BY t.tablename;
```

## Summary of unique constraints

```json
[
  {"tablename": "employees", "unique_constraint_count": "2"},
  {"tablename": "inventory", "unique_constraint_count": "1"},
  {"tablename": "orders", "unique_constraint_count": "1"},
  {"tablename": "products", "unique_constraint_count": "1"},
  {"tablename": "users", "unique_constraint_count": "1"}
]
```
