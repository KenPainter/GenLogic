Previous: [Schema Evolution](../edge-cases/schema-evolution.md) | Next: [Type Showcase](type-showcase.md)

# Minimal Schema Example

This is the simplest possible GenLogic schema, demonstrating the basic concepts of reusable column definitions and table creation. Suitable for getting started with GenLogic.

## Key Concepts

- Column Definitions: Define reusable column templates at the top level
- String Inheritance: Reference columns by name for simple inheritance
- Primary Keys: Use `sequence: true` and `primary_key: true` for auto-incrementing IDs

## Schema

```yaml
# Minimal GenLogic Schema
# This is the simplest possible GenLogic schema with reusable columns and a basic table

columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  name:
    type: varchar
    size: 100

tables:
  users:
    columns:
      user_id: id      # String reference - inherits 'id' as 'user_id'
      username: name   # String reference - inherits 'name' as 'username'
```

## Generated SQL

This schema generates a simple PostgreSQL table:

```sql
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(100)
);
```

## Usage

```sql
INSERT INTO users (username) VALUES ('john_doe');
INSERT INTO users (username) VALUES ('jane_smith');

SELECT * FROM users;
-- Returns:
-- user_id | username
-- --------|----------
--    1    | john_doe
--    2    | jane_smith
```

This example shows how GenLogic eliminates repetitive column definitions and provides a clean, maintainable schema format.

---

Previous: [Schema Evolution](../edge-cases/schema-evolution.md) | Next: [Type Showcase](type-showcase.md)
