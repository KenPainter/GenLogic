Previous: [String Inheritance](../inheritance/string-inheritance.md) | Next: [Null Inheritance](../inheritance/null-inheritance.md)

# $ref Inheritance Pattern

## Overview

The `$ref` inheritance pattern is the most flexible inheritance mechanism in GenLogic. It allows you to inherit a reusable column definition while **adding new properties** or **overriding existing ones**. This pattern gives you complete control over how inherited properties are modified and extended.

## Key Concepts

- Property Extension: Add new properties to inherited definitions
- Property Override: Modify existing properties from the base definition
- Complete Flexibility: Can both extend and override in the same column
- Composition: Build complex column definitions from simple base types

## YAML Configuration

```yaml
# $ref Inheritance Pattern
# When table column uses $ref, it inherits the reusable column and can OVERRIDE properties

columns:
  id:
    type: integer

  name:
    type: varchar
    size: 50

  amount:
    type: numeric
    size: 10
    decimal: 2

  email:
    type: varchar
    size: 255

tables:
  users:
    columns:
      user_id:
        $ref: id
        sequence: true      # ADD sequence to inherited id
        primary_key: true   # ADD primary key to inherited id

      username:
        $ref: name
        unique: true        # ADD unique constraint to inherited name

      primary_email:
        $ref: email
        unique: true        # ADD unique constraint to inherited email
        not_null: true      # ADD not null constraint

  products:
    columns:
      product_id:
        $ref: id
        sequence: true
        primary_key: true

      large_amount:
        $ref: amount
        size: 15           # OVERRIDE size from 10 to 15
        decimal: 4         # OVERRIDE decimal from 2 to 4

      long_name:
        $ref: name
        size: 200          # OVERRIDE size from 50 to 200

  # Result:
  # users.user_id: integer with sequence and primary key
  # users.username: varchar(50) with unique constraint
  # users.primary_email: varchar(255) with unique and not null
  # products.product_id: integer with sequence and primary key
  # products.large_amount: numeric(15,4) instead of numeric(10,2)
  # products.long_name: varchar(200) instead of varchar(50)
```

## Generated SQL

The `$ref` inheritance pattern would generate SQL similar to:

```sql
CREATE TABLE users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) UNIQUE,
    primary_email VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE products (
    product_id INTEGER PRIMARY KEY AUTOINCREMENT,
    large_amount NUMERIC(15,4),
    long_name VARCHAR(200)
);
```

## Usage Examples

### Building Primary Keys
```yaml
columns:
  base_id:
    type: integer

tables:
  users:
    columns:
      id:
        $ref: base_id
        sequence: true
        primary_key: true

  products:
    columns:
      id:
        $ref: base_id
        sequence: true
        primary_key: true
        # Could add additional properties like specific sequence name
```

### Flexible String Fields
```yaml
columns:
  text_field:
    type: varchar
    size: 100

tables:
  users:
    columns:
      username:
        $ref: text_field
        size: 50          # Smaller size for usernames
        unique: true
        not_null: true

      bio:
        $ref: text_field
        size: 500         # Larger size for bio text

  posts:
    columns:
      title:
        $ref: text_field
        size: 255         # Different size for titles
        not_null: true

      slug:
        $ref: text_field
        size: 255
        unique: true      # Unique slugs
        index: true       # Add index for performance
```

### Progressive Enhancement Pattern
```yaml
columns:
  # Base money type
  money:
    type: numeric
    size: 10
    decimal: 2

  # Enhanced money type with constraints
  required_money:
    $ref: money
    not_null: true
    check: "value >= 0"

  # Large money type for enterprise
  enterprise_money:
    $ref: required_money
    size: 18
    decimal: 4

tables:
  small_business:
    columns:
      revenue: money              # Basic money type

  corporate:
    columns:
      revenue:
        $ref: required_money      # Enhanced with constraints

  enterprise:
    columns:
      revenue:
        $ref: enterprise_money    # Large scale with all constraints
        # Inherits: numeric(18,4), not_null, check >= 0
```

### Complex Inheritance Chains
```yaml
columns:
  # Base types
  identifier:
    type: varchar
    size: 50

  # First level enhancement
  unique_identifier:
    $ref: identifier
    unique: true
    not_null: true

  # Second level enhancement
  indexed_identifier:
    $ref: unique_identifier
    index: true

tables:
  users:
    columns:
      email:
        $ref: indexed_identifier
        size: 255         # Override size while keeping all other properties
        # Final result: varchar(255), unique, not_null, index
```

### Type Customization
```yaml
columns:
  base_text:
    type: text

  base_number:
    type: integer

tables:
  flexible_table:
    columns:
      # Convert text to specific varchar
      short_description:
        $ref: base_text
        type: varchar     # Override type from text to varchar
        size: 255

      # Add constraints to number
      positive_count:
        $ref: base_number
        check: "value > 0"
        default: 1

      # Add automation to inherited type
      auto_calculated:
        $ref: base_number
        automation:
          type: COUNT
          table: related_items
          foreign_key: parent_fk
```

## Advanced Features

### Combining with Automation
```yaml
columns:
  counter:
    type: integer
    default: 0

tables:
  orders:
    columns:
      item_count:
        $ref: counter
        automation:
          type: COUNT
          table: order_items
          foreign_key: order_fk
        # Inherits: integer, default: 0, plus automation
```

### Multiple Property Overrides
```yaml
columns:
  flexible_field:
    type: varchar
    size: 100
    not_null: false

tables:
  strict_table:
    columns:
      critical_field:
        $ref: flexible_field
        size: 200         # Override size
        not_null: true    # Override nullability
        unique: true      # Add uniqueness
        index: true       # Add index
        check: "LENGTH(critical_field) >= 5"  # Add validation
```

## Benefits

1. **Maximum Flexibility**: Can modify any aspect of inherited definitions
2. **Progressive Enhancement**: Build complex types from simple bases
3. **Consistency with Customization**: Maintain type consistency while allowing customization
4. **Reusability**: Create libraries of reusable, extensible column types
5. **Maintainability**: Change base types once, customizations remain intact

## When to Use

- When you need to inherit most properties but customize specific aspects
- Building complex column definitions from simple base types
- Creating extensible schema architectures
- When different tables need variations of the same basic column type
- Progressive enhancement of column definitions
- Building reusable component libraries for database schemas

## Best Practices

1. **Layer Inheritance**: Build simple base types, then enhance progressively
2. **Document Overrides**: Comment why specific properties are being overridden
3. **Consistent Naming**: Use clear names that indicate the level of enhancement
4. **Test Combinations**: Verify that property combinations work as expected

## Related Patterns

- Null Inheritance: Use for simple, exact replication
- String Inheritance: Use for renaming without modification
- Mixed Inheritance: Combine all patterns for maximum flexibility

---

Previous: [String Inheritance](../inheritance/string-inheritance.md) | Next: [Null Inheritance](../inheritance/null-inheritance.md)
