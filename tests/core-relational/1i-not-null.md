# Test: 1I - NOT NULL

Tests NOT NULL constraints on various column types.

## Step 1: Basic NOT NULL constraint

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100) not null
      email: varchar(255)
```

## Verify NOT NULL constraint

```json
{
  "newSchema": {
    "tables.customers": "@exists",
    "tables.customers.columns.name.nullable": false,
    "tables.customers.columns.email.nullable": true,
    "errors.length": 0
  }
}
```

## Test NOT NULL allows non-null value

```sql
INSERT INTO customers (name, email) VALUES ('Alice', 'alice@example.com');
SELECT name, email FROM customers;
```

## Verify non-null insert succeeded

```json
[
  {"name": "Alice", "email": "alice@example.com"}
]
```

## Test NOT NULL allows null in nullable column

```sql
INSERT INTO customers (name, email) VALUES ('Bob', NULL);
SELECT name, email FROM customers WHERE name = 'Bob';
```

## Verify null email allowed

```json
[
  {"name": "Bob", "email": null}
]
```

## Step 2: PK columns are automatically NOT NULL

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100) not null
      email: varchar(255)

  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price: numeric(10,2)
```

## Verify PK is NOT NULL

```json
{
  "newSchema": {
    "tables.products": "@exists",
    "tables.products.pkColumn": "id",
    "tables.products.columns.id.nullable": false,
    "tables.products.columns.name.nullable": true,
    "tables.products.columns.price.nullable": true
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "products"
  }
}
```

## Test PK auto-assignment with NOT NULL

```sql
INSERT INTO products (name, price) VALUES ('Widget', 19.99);
INSERT INTO products (name, price) VALUES ('Gadget', NULL);
SELECT id, name, price FROM products ORDER BY id;
```

## Verify PK never null

```json
[
  {"id": 100, "name": "Widget", "price": "19.99"},
  {"id": 101, "name": "Gadget", "price": null}
]
```

## Step 3: FK columns with NOT NULL

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100) not null
      email: varchar(255)

  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price: numeric(10,2)

  orders:
    columns:
      id: serial primary key
      customer_id: FK customers not null
      order_date: date not null
      notes: text
```

## Verify FK with NOT NULL

```json
{
  "newSchema": {
    "tables.orders": "@exists",
    "tables.orders.columns.customer_id.nullable": false,
    "tables.orders.columns.order_date.nullable": false,
    "tables.orders.columns.notes.nullable": true
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "orders"
  }
}
```

## Test FK with NOT NULL requires value

```sql
INSERT INTO orders (customer_id, order_date, notes) VALUES (100, '2025-01-15', 'First order');
INSERT INTO orders (customer_id, order_date, notes) VALUES (101, '2025-01-16', NULL);
SELECT customer_id, order_date, notes FROM orders ORDER BY order_date;
```

## Verify NOT NULL FK and date

```json
[
  {"customer_id": 100, "order_date": "2025-01-15T00:00:00.000Z", "notes": "First order"},
  {"customer_id": 101, "order_date": "2025-01-16T00:00:00.000Z", "notes": null}
]
```

## Step 4: Multiple NOT NULL columns

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100) not null
      email: varchar(255)

  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price: numeric(10,2)

  orders:
    columns:
      id: serial primary key
      customer_id: FK customers not null
      order_date: date not null
      notes: text

  employees:
    columns:
      id: serial primary key
      first_name: varchar(50) not null
      last_name: varchar(50) not null
      email: varchar(255) not null
      phone: varchar(20)
      hire_date: date not null
```

## Verify multiple NOT NULL columns

```json
{
  "newSchema": {
    "tables.employees": "@exists",
    "tables.employees.columns.first_name.nullable": false,
    "tables.employees.columns.last_name.nullable": false,
    "tables.employees.columns.email.nullable": false,
    "tables.employees.columns.phone.nullable": true,
    "tables.employees.columns.hire_date.nullable": false
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "employees"
  }
}
```

## Test multiple NOT NULL columns require values

```sql
INSERT INTO employees (first_name, last_name, email, phone, hire_date)
VALUES ('Alice', 'Smith', 'alice@company.com', '555-1234', '2025-01-01');
INSERT INTO employees (first_name, last_name, email, phone, hire_date)
VALUES ('Bob', 'Jones', 'bob@company.com', NULL, '2025-01-02');
SELECT first_name, last_name, email, phone, hire_date FROM employees ORDER BY hire_date;
```

## Verify multiple NOT NULL enforced

```json
[
  {"first_name": "Alice", "last_name": "Smith", "email": "alice@company.com", "phone": "555-1234", "hire_date": "2025-01-01T00:00:00.000Z"},
  {"first_name": "Bob", "last_name": "Jones", "email": "bob@company.com", "phone": null, "hire_date": "2025-01-02T00:00:00.000Z"}
]
```

## Step 5: NOT NULL with default values

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100) not null
      email: varchar(255)

  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price: numeric(10,2)

  orders:
    columns:
      id: serial primary key
      customer_id: FK customers not null
      order_date: date not null
      notes: text

  employees:
    columns:
      id: serial primary key
      first_name: varchar(50) not null
      last_name: varchar(50) not null
      email: varchar(255) not null
      phone: varchar(20)
      hire_date: date not null

  settings:
    columns:
      id: serial primary key
      setting_key: varchar(50) not null
      setting_value: varchar(200) not null default 'default_value'
      is_active: boolean not null default true
```

## Verify NOT NULL with defaults

```json
{
  "newSchema": {
    "tables.settings": "@exists",
    "tables.settings.columns.setting_key.nullable": false,
    "tables.settings.columns.setting_value.nullable": false,
    "tables.settings.columns.setting_value.defaultValue": "default_value",
    "tables.settings.columns.is_active.nullable": false,
    "tables.settings.columns.is_active.defaultValue": "true"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "settings"
  }
}
```

## Test NOT NULL with defaults uses defaults

```sql
INSERT INTO settings (setting_key) VALUES ('api_timeout');
INSERT INTO settings (setting_key, setting_value) VALUES ('max_connections', '100');
INSERT INTO settings (setting_key, setting_value, is_active) VALUES ('debug_mode', 'enabled', false);
SELECT setting_key, setting_value, is_active FROM settings ORDER BY setting_key;
```

## Verify defaults applied for NOT NULL columns

```json
[
  {"setting_key": "api_timeout", "setting_value": "default_value", "is_active": true},
  {"setting_key": "debug_mode", "setting_value": "enabled", "is_active": false},
  {"setting_key": "max_connections", "setting_value": "100", "is_active": true}
]
```

## Query to count NOT NULL columns per table

```sql
SELECT
  t.tablename,
  COUNT(CASE WHEN c.is_nullable = 'NO' AND (t2.constraint_column_usage IS NULL OR c.column_name != t2.constraint_column_usage) THEN 1 END) as not_null_count
FROM pg_tables t
JOIN information_schema.columns c ON c.table_name = t.tablename AND c.table_schema = t.schemaname
LEFT JOIN (
  SELECT kcu.table_name, kcu.column_name as constraint_column_usage
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  WHERE tc.constraint_type = 'PRIMARY KEY'
) t2 ON t2.table_name = t.tablename AND t2.constraint_column_usage = c.column_name
WHERE t.schemaname = 'public'
GROUP BY t.tablename
HAVING COUNT(CASE WHEN c.is_nullable = 'NO' THEN 1 END) > 0
ORDER BY t.tablename;
```

## Summary of NOT NULL constraints

```json
[
  {"tablename": "customers", "not_null_count": "1"},
  {"tablename": "employees", "not_null_count": "4"},
  {"tablename": "orders", "not_null_count": "2"},
  {"tablename": "products", "not_null_count": "0"},
  {"tablename": "settings", "not_null_count": "3"}
]
```
