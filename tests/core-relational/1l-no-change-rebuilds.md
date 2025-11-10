# Test: 1L - No-Change Rebuilds

Tests idempotency: running the same schema twice should generate minimal or no DDL changes.

NOTE: GenLogic may generate trigger-related DDL even when the schema hasn't changed.
This test focuses on verifying that table/column/constraint DDL is not regenerated.

## Step 1: Initial schema build

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
      email: varchar(255)
```

## Verify initial build

```json
{
  "newSchema": {
    "tables.users": "@exists",
    "tables.users.pkColumn": "id",
    "tables.users.columns.name.type": "character varying",
    "tables.users.columns.email.type": "character varying",
    "errors.length": 0
  }
}
```

## Insert test data

```sql
INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com');
SELECT name, email FROM users;
```

## Verify data inserted

```json
[
  {"name": "Alice", "email": "alice@example.com"}
]
```

## Step 2: Rebuild with exact same schema

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
      email: varchar(255)
```

## Verify no structural changes

```json
{
  "diff": {
    "tablesToCreate.length": 0,
    "tablesToDrop.length": 0,
    "columnsToAdd.length": 0,
    "columnsToDrop.length": 0,
    "columnsToModify.length": 0
  }
}
```

## Verify data preserved

```sql
SELECT COUNT(*) as count FROM users WHERE email = 'alice@example.com';
```

## Data still intact

```json
[
  {"count": "1"}
]
```

## Step 3: Add second table, then rebuild both

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
      email: varchar(255)

  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price: numeric(10,2)
```

## Verify second table added

```json
{
  "newSchema": {
    "tables.products": "@exists"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "products",
    "tablesToDrop.length": 0,
    "columnsToAdd.length": 0,
    "columnsToDrop.length": 0,
    "columnsToModify.length": 0
  }
}
```

## Insert product data

```sql
INSERT INTO products (name, price) VALUES ('Widget', 19.99);
SELECT COUNT(*) as product_count FROM products;
```

## Verify product inserted

```json
[
  {"product_count": "1"}
]
```

## Step 4: Rebuild with both tables unchanged

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
      email: varchar(255)

  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price: numeric(10,2)
```

## Verify no changes to either table

```json
{
  "diff": {
    "tablesToCreate.length": 0,
    "tablesToDrop.length": 0,
    "columnsToAdd.length": 0,
    "columnsToDrop.length": 0,
    "columnsToModify.length": 0
  }
}
```

## Verify both tables' data preserved

```sql
SELECT
  (SELECT COUNT(*) FROM users) as user_count,
  (SELECT COUNT(*) FROM products) as product_count;
```

## Both tables intact

```json
[
  {"user_count": "1", "product_count": "1"}
]
```

## Step 5: Add FK relationship, then rebuild

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
      email: varchar(255)

  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price: numeric(10,2)

  orders:
    columns:
      id: serial primary key
      user_id: FK users
      product_id: FK products
      order_date: date
```

## Verify FK table added

```json
{
  "newSchema": {
    "tables.orders": "@exists",
    "tables.orders.foreignKeys.fk_orders_user_id": "@exists",
    "tables.orders.foreignKeys.fk_orders_product_id": "@exists"
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

## Insert order data

```sql
INSERT INTO orders (user_id, product_id, order_date) VALUES (100, 100, '2025-01-15');
SELECT COUNT(*) as order_count FROM orders;
```

## Verify order inserted

```json
[
  {"order_count": "1"}
]
```

## Step 6: Rebuild with all three tables unchanged

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
      email: varchar(255)

  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price: numeric(10,2)

  orders:
    columns:
      id: serial primary key
      user_id: FK users
      product_id: FK products
      order_date: date
```

## Verify complete idempotency

```json
{
  "diff": {
    "tablesToCreate.length": 0,
    "tablesToDrop.length": 0,
    "columnsToAdd.length": 0,
    "columnsToDrop.length": 0,
    "columnsToModify.length": 0
  }
}
```

## Verify all data preserved across rebuilds

```sql
SELECT
  u.name,
  p.name as product,
  o.order_date
FROM orders o
JOIN users u ON o.user_id = u.id
JOIN products p ON o.product_id = p.id;
```

## All relationships intact

```json
[
  {"name": "Alice", "product": "Widget", "order_date": "2025-01-15T00:00:00.000Z"}
]
```

## Step 7: Add constraints, then rebuild

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
      email: varchar(255) unique

  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price: numeric(10,2)
    constraints:
      - price > 0

  orders:
    columns:
      id: serial primary key
      user_id: FK users
      product_id: FK products
      order_date: date
```

## Verify constraints added

```json
{
  "newSchema": {
    "tables.users.columns.email.isUnique": true,
    "tables.products.constraints": "@exists"
  },
  "diff": {
    "tablesToCreate.length": 0,
    "tablesToDrop.length": 0,
    "columnsToAdd.length": 0,
    "columnsToDrop.length": 0,
    "constraintsToAdd.length": 1,
    "uniqueConstraintsToAdd.length": 1
  }
}
```

## Step 8: Rebuild with constraints unchanged

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
      email: varchar(255) unique

  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price: numeric(10,2)
    constraints:
      - price > 0

  orders:
    columns:
      id: serial primary key
      user_id: FK users
      product_id: FK products
      order_date: date
```

## Verify constraints idempotent

```json
{
  "diff": {
    "tablesToCreate.length": 0,
    "tablesToDrop.length": 0,
    "columnsToAdd.length": 0,
    "columnsToDrop.length": 0,
    "columnsToModify.length": 0,
    "constraintsToAdd.length": 0,
    "constraintsToDrop.length": 0
  }
}
```

## Final verification: all data still present

```sql
SELECT
  (SELECT COUNT(*) FROM users) as users,
  (SELECT COUNT(*) FROM products) as products,
  (SELECT COUNT(*) FROM orders) as orders;
```

## All data survived multiple rebuilds

```json
[
  {"users": "1", "products": "1", "orders": "1"}
]
```
