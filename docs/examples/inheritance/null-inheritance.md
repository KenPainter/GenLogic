Previous: [Ref Inheritance](ref-inheritance.md) | Next: [Mixed Inheritance](mixed-inheritance.md)

# Null Inheritance Pattern

## Overview

The null inheritance pattern is the simplest form of column inheritance in GenLogic. When a table column is set to `null`, it inherits the reusable column definition with the **same name**. This pattern is ideal when you want to use standard column definitions across multiple tables without renaming.

## Key Concepts

- Exact Name Matching: The column name in the table must match exactly with a reusable column name
- Complete Inheritance: All properties (type, size, constraints) are inherited without modification
- Simplicity: No additional syntax required - just set the value to `null`

## YAML Configuration

```yaml
# Null Inheritance Pattern
# When table column is null, it inherits the reusable column with the SAME NAME

columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  name:
    type: varchar
    size: 100

  email:
    type: varchar
    size: 255

  created_at:
    type: timestamp

tables:
  users:
    columns:
      id: null           # Inherits 'id' column definition as 'id'
      name: null         # Inherits 'name' column definition as 'name'
      email: null        # Inherits 'email' column definition as 'email'
      created_at: null   # Inherits 'created_at' column definition as 'created_at'

  # Result: users table has columns: id, name, email, created_at
  # with exact same types and constraints as defined in reusable columns
```

## Generated SQL

The null inheritance pattern would generate SQL similar to:

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100),
    email VARCHAR(255),
    created_at TIMESTAMP
);
```

## Usage Examples

### Basic User Table
```yaml
columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  name:
    type: varchar
    size: 50

  email:
    type: varchar
    size: 255
    unique: true

tables:
  users:
    columns:
      id: null       # Gets integer, sequence, primary_key
      name: null     # Gets varchar(50)
      email: null    # Gets varchar(255) with unique constraint
```

### Audit Fields Pattern
```yaml
columns:
  created_at:
    type: timestamp
    default: "CURRENT_TIMESTAMP"

  updated_at:
    type: timestamp
    default: "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"

tables:
  products:
    columns:
      product_name:
        type: varchar
        size: 100
      created_at: null    # Inherits timestamp with default
      updated_at: null    # Inherits timestamp with update trigger

  orders:
    columns:
      order_number:
        type: varchar
        size: 20
      created_at: null    # Same audit fields
      updated_at: null    # Consistent across tables
```

## Benefits

1. **Consistency**: Ensures identical column definitions across tables
2. **Maintainability**: Change the reusable column definition once, affects all tables
3. **Simplicity**: Clean, minimal syntax
4. **Type Safety**: Guaranteed consistent data types and constraints

## When to Use

- Standard columns that appear in multiple tables (id, timestamps, common fields)
- When you want identical column names and definitions
- Building consistent schemas with repeated patterns
- Rapid prototyping where consistency matters more than customization

## Related Patterns

- String Inheritance: Use when you need to rename columns while inheriting definitions
- $ref Inheritance: Use when you need to inherit and modify/extend column properties

---

Previous: [Ref Inheritance](ref-inheritance.md) | Next: [Mixed Inheritance](mixed-inheritance.md)
