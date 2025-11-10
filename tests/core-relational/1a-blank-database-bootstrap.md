# Test: 1A - Blank Database Bootstrap

Tests creating tables from scratch in an empty database and verifies idempotency.

## Step 1: Create simple schema with two tables

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

## Verify tables were created

```json
{
  "newSchema": {
    "tables.users": "@exists",
    "tables.users.pkColumn": "id",
    "tables.users.columns.id.type": "integer",
    "tables.users.columns.name.type": "character varying",
    "tables.users.columns.name.character_maximum_length": 100,
    "tables.users.columns.email.type": "character varying",
    "tables.users.columns.email.character_maximum_length": 255,
    "tables.products": "@exists",
    "tables.products.pkColumn": "id",
    "tables.products.columns.id.type": "integer",
    "tables.products.columns.name.type": "character varying",
    "tables.products.columns.name.character_maximum_length": 100,
    "tables.products.columns.price.type": "numeric",
    "tables.products.columns.price.numeric_precision": 10,
    "tables.products.columns.price.numeric_scale": 2,
    "errors.length": 0
  }
}
```

## Insert test data

```sql
INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com');
INSERT INTO users (name, email) VALUES ('Bob', 'bob@example.com');
INSERT INTO products (name, price) VALUES ('Widget', 19.99);
INSERT INTO products (name, price) VALUES ('Gadget', 29.99);
SELECT COUNT(*) as user_count FROM users;
```

## Verify data was inserted

```json
[
  {"user_count": "2"}
]
```

## Query products

```sql
SELECT name, price FROM products ORDER BY name;
```

## Verify product data

```json
[
  {"name": "Gadget", "price": "29.99"},
  {"name": "Widget", "price": "19.99"}
]
```

## Step 2: Re-run same schema (idempotency test)

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

## Verify no changes were made

```json
{
  "newSchema": {
    "tables.users": "@exists",
    "tables.products": "@exists"
  },
  "diff": {
    "tablesToCreate.length": 0,
    "columnsToAdd.length": 0,
    "columnsToModify.length": 0
  }
}
```

## Verify existing data is still there

```sql
SELECT COUNT(*) as user_count FROM users;
```

## Data should be preserved

```json
[
  {"user_count": "2"}
]
```
