# Test: 1M - Schema Normalization

Tests that GenLogic recognizes equivalent type definitions as the same, ensuring idempotency
across different but equivalent SQL type specifications.

## Step 1: varchar vs character varying

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
      email: varchar(255)
```

## Verify varchar columns created

```json
{
  "newSchema": {
    "tables.users": "@exists",
    "tables.users.columns.name.type": "character varying",
    "tables.users.columns.name.character_maximum_length": 100,
    "tables.users.columns.email.type": "character varying",
    "tables.users.columns.email.character_maximum_length": 255,
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

## Step 2: Rebuild using character varying (equivalent)

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: character varying(100)
      email: character varying(255)
```

## Verify no changes detected

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

## Step 3: integer vs int vs int4

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: character varying(100)
      email: character varying(255)

  products:
    columns:
      id: serial primary key
      quantity: integer
      reorder_point: int
      stock_level: int4
```

## Verify all integer types created

```json
{
  "newSchema": {
    "tables.products": "@exists",
    "tables.products.columns.quantity": "@exists",
    "tables.products.columns.reorder_point": "@exists",
    "tables.products.columns.stock_level": "@exists"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "products"
  }
}
```

## Insert product data

```sql
INSERT INTO products (quantity, reorder_point, stock_level) VALUES (100, 50, 75);
SELECT quantity, reorder_point, stock_level FROM products;
```

## Verify all integer columns work

```json
[
  {"quantity": 100, "reorder_point": 50, "stock_level": 75}
]
```

## Step 4: Rebuild with different integer type aliases

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: character varying(100)
      email: character varying(255)

  products:
    columns:
      id: serial primary key
      quantity: int4
      reorder_point: integer
      stock_level: int
```

## Verify no changes for equivalent integer types

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

## Step 5: decimal vs numeric

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: character varying(100)
      email: character varying(255)

  products:
    columns:
      id: serial primary key
      quantity: int4
      reorder_point: integer
      stock_level: int

  prices:
    columns:
      id: serial primary key
      cost: decimal(10,2)
      retail: numeric(10,2)
```

## Verify decimal and numeric both normalized

```json
{
  "newSchema": {
    "tables.prices": "@exists",
    "tables.prices.columns.cost.type": "numeric",
    "tables.prices.columns.cost.numeric_precision": 10,
    "tables.prices.columns.cost.numeric_scale": 2,
    "tables.prices.columns.retail.type": "numeric",
    "tables.prices.columns.retail.numeric_precision": 10,
    "tables.prices.columns.retail.numeric_scale": 2
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "prices"
  }
}
```

## Insert price data

```sql
INSERT INTO prices (cost, retail) VALUES (10.50, 19.99);
SELECT cost, retail FROM prices;
```

## Verify both decimal types work

```json
[
  {"cost": "10.50", "retail": "19.99"}
]
```

## Step 6: Rebuild swapping decimal/numeric

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: character varying(100)
      email: character varying(255)

  products:
    columns:
      id: serial primary key
      quantity: int4
      reorder_point: integer
      stock_level: int

  prices:
    columns:
      id: serial primary key
      cost: numeric(10,2)
      retail: decimal(10,2)
```

## Verify swapped decimal/numeric types recognized as equivalent

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

## Step 7: Whitespace variations

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: character varying(100)
      email:   character   varying(255)

  products:
    columns:
      id:  serial   primary   key
      quantity: int4
      reorder_point:    integer
      stock_level: int

  prices:
    columns:
      id: serial primary key
      cost:   numeric(10,2)
      retail: decimal(10,2)
```

## Verify whitespace variations ignored

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

## Step 8: boolean vs bool

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: character varying(100)
      email: character varying(255)

  products:
    columns:
      id: serial primary key
      quantity: int4
      reorder_point: integer
      stock_level: int

  prices:
    columns:
      id: serial primary key
      cost: numeric(10,2)
      retail: decimal(10,2)

  flags:
    columns:
      id: serial primary key
      is_active: boolean
      is_featured: bool
```

## Verify boolean types normalized

```json
{
  "newSchema": {
    "tables.flags": "@exists",
    "tables.flags.columns.is_active.type": "boolean",
    "tables.flags.columns.is_featured.type": "boolean"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "flags"
  }
}
```

## Insert flag data

```sql
INSERT INTO flags (is_active, is_featured) VALUES (true, false);
SELECT is_active, is_featured FROM flags;
```

## Verify boolean columns work

```json
[
  {"is_active": true, "is_featured": false}
]
```

## Step 9: Rebuild swapping boolean/bool

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: character varying(100)
      email: character varying(255)

  products:
    columns:
      id: serial primary key
      quantity: int4
      reorder_point: integer
      stock_level: int

  prices:
    columns:
      id: serial primary key
      cost: numeric(10,2)
      retail: decimal(10,2)

  flags:
    columns:
      id: serial primary key
      is_active: bool
      is_featured: boolean
```

## Verify swapped boolean types equivalent

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

## Verify all data survived normalization tests

```sql
SELECT
  (SELECT COUNT(*) FROM users) as users,
  (SELECT COUNT(*) FROM products) as products,
  (SELECT COUNT(*) FROM prices) as prices,
  (SELECT COUNT(*) FROM flags) as flags;
```

## All tables and data intact

```json
[
  {"users": "1", "products": "1", "prices": "1", "flags": "1"}
]
```
