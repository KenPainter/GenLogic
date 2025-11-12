# Test: 1B - Schema Evolution

Tests adding tables and columns to an existing schema across multiple builds.

## Step 1: Start with single table

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100)
```

## Verify initial table created

```json
{
  "newSchema": {
    "tables.customers": "@exists",
    "tables.customers.pkColumn": "id",
    "tables.customers.columns.id.type": "integer",
    "tables.customers.columns.name.type": "character varying",
    "tables.customers.columns.name.character_maximum_length": 100,
    "errors.length": 0
  }
}
```

## Insert initial customer

```sql
INSERT INTO customers (name) VALUES ('Acme Corp');
SELECT id, name FROM customers;
```

## Verify customer inserted

```json
[
  {"id": 100, "name": "Acme Corp"}
]
```

## Step 2: Add new layer 0 table

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100)

  categories:
    columns:
      id: serial primary key
      name: varchar(50)
```

## Verify new table added

```json
{
  "newSchema": {
    "tables.categories": "@exists",
    "tables.categories.pkColumn": "id",
    "tables.categories.columns.id.type": "integer",
    "tables.categories.columns.name.type": "character varying",
    "tables.categories.columns.name.character_maximum_length": 50
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "categories",
    "tablesToDrop.length": 0,
    "columnsToAdd.length": 0,
    "columnsToDrop.length": 0,
    "columnsToModify.length": 0
  }
}
```

## Query database to verify both tables exist

```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

## Both tables should be in database

```json
[
  {"tablename": "categories"},
  {"tablename": "customers"}
]
```

## Verify old data preserved

```sql
SELECT COUNT(*) as count FROM customers;
```

## Customer still there

```json
[
  {"count": "1"}
]
```

## Step 3: Add table with FK(dependency)

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100)

  categories:
    columns:
      id: serial primary key
      name: varchar(50)

  orders:
    columns:
      id: serial primary key
      customer_id: FK(customers)
      order_date: date
```

## Verify FK(table) added in new layer

```json
{
  "newSchema": {
    "tables.orders": "@exists",
    "tables.orders.columns.customer_id.type": "integer",
    "tables.orders.columns.order_date.type": "date",
    "tables.orders.foreignKeys.fk_orders_customer_id.parentTable": "customers",
    "tables.orders.foreignKeys.fk_orders_customer_id.childColumn": "customer_id",
    "tables.orders.foreignKeys.fk_orders_customer_id.parentColumn": "id"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "orders",
    "tablesToDrop.length": 0,
    "columnsToAdd.length": 0,
    "columnsToDrop.length": 0,
    "columnsToModify.length": 0
  }
}
```

## Query database to verify all three tables exist

```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

## All three tables in database

```json
[
  {"tablename": "categories"},
  {"tablename": "customers"},
  {"tablename": "orders"}
]
```

## Test FK(constraint) works

```sql
INSERT INTO orders (customer_id, order_date) VALUES (100, '2025-01-01');
SELECT customer_id, order_date FROM orders;
```

## Verify FK(data)

```json
[
  {"customer_id": 100, "order_date": "2025-01-01T00:00:00.000Z"}
]
```

## Step 4: Add column to existing table

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100)
      email: varchar(255)

  categories:
    columns:
      id: serial primary key
      name: varchar(50)

  orders:
    columns:
      id: serial primary key
      customer_id: FK(customers)
      order_date: date
```

## Verify column added

```json
{
  "newSchema": {
    "tables.customers.columns.email": "@exists",
    "tables.customers.columns.email.type": "character varying",
    "tables.customers.columns.email.character_maximum_length": 255
  },
  "diff": {
    "tablesToCreate.length": 0,
    "tablesToDrop.length": 0,
    "columnsToAdd.length": 1,
    "columnsToAdd[0].table": "customers",
    "columnsToAdd[0].column": "email",
    "columnsToDrop.length": 0,
    "columnsToModify.length": 0
  }
}
```

## Verify new column exists (NULL for existing rows)

```sql
SELECT id, name, email FROM customers;
```

## Email is NULL for existing customer

```json
[
  {"id": 100, "name": "Acme Corp", "email": null}
]
```

## Update and verify new column

```sql
UPDATE customers SET email = 'contact@acme.com' WHERE id = 100;
SELECT email FROM customers WHERE id = 100;
```

## Email updated successfully

```json
[
  {"email": "contact@acme.com"}
]
```

## Step 5: Modify column type (varchar increase)

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(200)
      email: varchar(255)

  categories:
    columns:
      id: serial primary key
      name: varchar(50)

  orders:
    columns:
      id: serial primary key
      customer_id: FK(customers)
      order_date: date
```

## Verify column modified

```json
{
  "newSchema": {
    "tables.customers.columns.name.character_maximum_length": 200
  },
  "diff": {
    "tablesToCreate.length": 0,
    "tablesToDrop.length": 0,
    "columnsToAdd.length": 0,
    "columnsToDrop.length": 0,
    "columnsToModify.length": 1,
    "columnsToModify[0].table": "customers",
    "columnsToModify[0].column": "name"
  }
}
```

## Verify data still intact after column modification

```sql
SELECT COUNT(*) as count FROM customers WHERE email = 'contact@acme.com';
```

## Data preserved through schema change

```json
[
  {"count": "1"}
]
```
