Previous: [Null Inheritance](null-inheritance.md) | Next: [Simple Foreign Key](../foreign-keys/simple-foreign-key.md)

# Mixed Inheritance Patterns

## Overview

Mixed inheritance demonstrates the true power of GenLogic's inheritance system by combining all three inheritance patterns in a single schema. This approach shows how null inheritance, string inheritance, and `$ref` inheritance can work together to create sophisticated, maintainable database schemas that balance consistency, flexibility, and reusability.

## Key Concepts

- Pattern Combination: Using multiple inheritance types within the same schema
- Layered Reusability: Building enhanced reusable columns from base types
- Flexible Architecture: Choosing the right inheritance pattern for each use case
- Progressive Enhancement: Creating hierarchies of column definitions

## YAML Configuration

```yaml
# Mixed Inheritance Patterns
# Demonstrates all three inheritance types in one schema

columns:
  # Base types
  id:
    type: integer
    sequence: true

  name:
    type: varchar
    size: 100

  amount:
    type: numeric
    size: 10
    decimal: 2

  timestamp:
    type: timestamp

  # Enhanced types (using $ref inheritance)
  primary_id:
    $ref: id
    primary_key: true

  unique_name:
    $ref: name
    unique: true

  currency_amount:
    $ref: amount
    size: 15
    decimal: 4

tables:
  companies:
    columns:
      # Using enhanced reusable column with $ref
      company_id:
        $ref: primary_id

      # Using string inheritance with renaming
      company_name: unique_name

      # Using null inheritance (same name)
      timestamp: null

      # Direct definition (no inheritance)
      industry:
        type: varchar
        size: 50

  employees:
    columns:
      # Using enhanced reusable column
      employee_id:
        $ref: primary_id

      # Using string inheritance
      full_name: name

      # Using $ref with additional override
      salary:
        $ref: currency_amount
        # Inherits numeric(15,4) from currency_amount

      # Using null inheritance
      timestamp: null

  transactions:
    foreign_keys:
      company_fk:
        table: companies

    columns:
      # Mixing inheritance types in one table
      transaction_id:
        $ref: id
        primary_key: true

      description: name    # String inheritance
      amount: null         # Null inheritance
      timestamp: null      # Null inheritance

      # Override with additional automation
      large_amount:
        $ref: currency_amount
        automation:
          type: SUM
          table: line_items
          foreign_key: transaction_fk
          column: amount

  line_items:
    foreign_keys:
      transaction_fk:
        table: transactions

    columns:
      line_id:
        $ref: primary_id

      item_name: name
      amount: null
      timestamp: null

# Result demonstrates flexibility:
# - companies: company_id (int, seq, pk), company_name (varchar(100), unique), timestamp, industry
# - employees: employee_id (int, seq, pk), full_name (varchar(100)), salary (numeric(15,4)), timestamp
# - transactions: transaction_id (int, seq, pk), description (varchar(100)), amount (numeric(10,2)), timestamp, large_amount (numeric(15,4) with automation)
# - line_items: line_id (int, seq, pk), item_name (varchar(100)), amount (numeric(10,2)), timestamp
```

## Generated SQL

The mixed inheritance pattern would generate SQL similar to:

```sql
CREATE TABLE companies (
    company_id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name VARCHAR(100) UNIQUE,
    timestamp TIMESTAMP,
    industry VARCHAR(50)
);

CREATE TABLE employees (
    employee_id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name VARCHAR(100),
    salary NUMERIC(15,4),
    timestamp TIMESTAMP
);

CREATE TABLE transactions (
    transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
    description VARCHAR(100),
    amount NUMERIC(10,2),
    timestamp TIMESTAMP,
    large_amount NUMERIC(15,4),
    company_id INTEGER,
    FOREIGN KEY (company_id) REFERENCES companies(company_id)
);

CREATE TABLE line_items (
    line_id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name VARCHAR(100),
    amount NUMERIC(10,2),
    timestamp TIMESTAMP,
    transaction_id INTEGER,
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id)
);
```

## Inheritance Pattern Analysis

### Layer 1: Base Types
```yaml
columns:
  id:                    # Basic integer with sequence
  name:                  # Standard varchar(100)
  amount:                # Standard numeric(10,2)
  timestamp:             # Basic timestamp
```

### Layer 2: Enhanced Types (using $ref)
```yaml
columns:
  primary_id:            # id + primary_key constraint
    $ref: id
    primary_key: true

  unique_name:           # name + unique constraint
    $ref: name
    unique: true

  currency_amount:       # amount with higher precision
    $ref: amount
    size: 15
    decimal: 4
```

### Layer 3: Table Implementation (mixed patterns)
```yaml
tables:
  companies:
    columns:
      company_id:        # $ref inheritance from enhanced type
        $ref: primary_id
      company_name: unique_name    # String inheritance
      timestamp: null              # Null inheritance
      industry: {...}              # Direct definition
```

## Usage Examples

### E-commerce Platform
```yaml
columns:
  # Base types
  id:
    type: integer
    sequence: true

  money:
    type: numeric
    size: 10
    decimal: 2

  text:
    type: varchar
    size: 255

  # Enhanced types
  primary_key_id:
    $ref: id
    primary_key: true

  required_text:
    $ref: text
    not_null: true

  large_money:
    $ref: money
    size: 15
    decimal: 4

tables:
  products:
    columns:
      product_id:
        $ref: primary_key_id    # Enhanced ID

      name: required_text       # String inheritance with renaming
      price: money             # String inheritance
      cost: money              # Same type, different purpose

  orders:
    columns:
      order_id:
        $ref: primary_key_id    # Same enhanced ID pattern

      customer_email: text      # String inheritance
      total:
        $ref: large_money       # $ref with higher precision
        automation:             # Additional automation
          type: SUM
          table: order_items
          foreign_key: order_fk
          column: price

  order_items:
    columns:
      item_id:
        $ref: primary_key_id    # Consistent ID pattern

      quantity:
        $ref: id                # Base type for quantities
        not_null: true          # Add constraint

      price: money              # String inheritance
      line_total: large_money   # String inheritance, different precision
```

### Multi-Tenant SaaS Application
```yaml
columns:
  # Base infrastructure
  uuid_field:
    type: varchar
    size: 36

  audit_timestamp:
    type: timestamp
    default: "CURRENT_TIMESTAMP"

  # Enhanced types
  tenant_key:
    $ref: uuid_field
    not_null: true
    index: true

  primary_uuid:
    $ref: uuid_field
    primary_key: true

tables:
  tenants:
    columns:
      tenant_id:
        $ref: primary_uuid      # Enhanced UUID as primary key

      # Null inheritance for audit fields
      created_at: audit_timestamp
      updated_at: audit_timestamp

  users:
    columns:
      user_id:
        $ref: primary_uuid      # Same UUID pattern

      tenant_id: tenant_key     # String inheritance with index

      # Null inheritance
      created_at: audit_timestamp
      updated_at: audit_timestamp

      # Custom field
      email:
        type: varchar
        size: 255
        unique: true

  projects:
    columns:
      project_id:
        $ref: primary_uuid

      tenant_id: tenant_key     # Consistent tenant reference

      # Mixed inheritance for different needs
      name:
        $ref: text
        size: 200               # Override size
        not_null: true

      created_at: audit_timestamp  # Null inheritance
      updated_at: audit_timestamp  # Null inheritance
```

## Best Practices for Mixed Inheritance

### 1. Hierarchical Design
```yaml
# Start with simple base types
columns:
  basic_id: { type: integer }
  basic_text: { type: varchar, size: 100 }

# Build enhanced versions
columns:
  primary_id:
    $ref: basic_id
    sequence: true
    primary_key: true

  indexed_text:
    $ref: basic_text
    index: true

# Use in tables with appropriate patterns
tables:
  my_table:
    columns:
      id: primary_id         # String inheritance for enhanced type
      name:
        $ref: indexed_text   # $ref for further customization
        size: 200
      timestamp: null        # Null inheritance for exact match
```

### 2. Consistent Naming Conventions
```yaml
columns:
  # Base types (simple names)
  id: { type: integer }
  name: { type: varchar, size: 100 }
  amount: { type: numeric, size: 10, decimal: 2 }

  # Enhanced types (descriptive names)
  primary_key_id:
    $ref: id
    sequence: true
    primary_key: true

  unique_name:
    $ref: name
    unique: true

  currency_amount:
    $ref: amount
    size: 15
    decimal: 4
```

### 3. Pattern Selection Guidelines

| Use Case | Pattern | Reason |
|----------|---------|---------|
| Exact reuse | Null inheritance | Simple, no changes needed |
| Semantic naming | String inheritance | Different name, same definition |
| Customization | `$ref` inheritance | Need to modify/extend properties |
| Enhanced reusable | `$ref` inheritance | Building component library |

## Benefits of Mixed Inheritance

1. **Flexibility**: Each column can use the most appropriate inheritance pattern
2. **Consistency**: Shared base types ensure consistent behavior
3. **Maintainability**: Changes to base types propagate appropriately
4. **Scalability**: Easy to add new tables following established patterns
5. **Expressiveness**: Schema clearly shows relationships and variations
6. **Reusability**: Components can be reused at multiple levels

## When to Use Mixed Inheritance

- Complex applications with multiple related entities
- When you need both consistency and flexibility
- Building schema libraries or frameworks
- Large applications with many tables and similar patterns
- When different tables have different requirements for similar column types
- Progressive enhancement architectures

## Common Anti-Patterns to Avoid

1. **Over-inheritance**: Don't inherit when a simple direct definition is clearer
2. **Deep nesting**: Avoid too many layers of inheritance (more than 3-4 levels)
3. **Inconsistent naming**: Use clear, consistent names for base and enhanced types
4. **Wrong pattern choice**: Choose the right inheritance type for each use case

## Related Patterns

- Null Inheritance: Foundation pattern for exact reuse
- String Inheritance: Flexible renaming pattern
- $ref Inheritance: Flexible customization pattern
- Progressive Enhancement: Building complexity incrementally

---

Previous: [Null Inheritance](null-inheritance.md) | Next: [Simple Foreign Key](../foreign-keys/simple-foreign-key.md)
