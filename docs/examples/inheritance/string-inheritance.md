# String Inheritance Pattern

## Overview

The string inheritance pattern allows you to inherit a reusable column definition while giving it a **new name** in your table. When a table column is set to a string value, GenLogic looks for a reusable column with that name and inherits all its properties, but assigns them to the new column name.

## Key Concepts

- **Column Renaming**: The new column gets a different name than the reusable column
- **Complete Definition Inheritance**: All properties (type, size, constraints) are inherited
- **Semantic Mapping**: Maps generic reusable columns to domain-specific names
- **Flexibility**: Same base definition can be reused with contextually appropriate names

## YAML Configuration

```yaml
# String Inheritance Pattern
# When table column is a string, it inherits the named reusable column with a NEW NAME

columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  name:
    type: varchar
    size: 100

  amount:
    type: numeric
    size: 10
    decimal: 2

  timestamp:
    type: timestamp

tables:
  products:
    columns:
      product_id: id        # Inherits 'id' definition as 'product_id'
      product_name: name    # Inherits 'name' definition as 'product_name'
      price: amount         # Inherits 'amount' definition as 'price'
      created_at: timestamp # Inherits 'timestamp' definition as 'created_at'

  orders:
    columns:
      order_id: id          # Inherits 'id' definition as 'order_id'
      customer_name: name   # Inherits 'name' definition as 'customer_name'
      total: amount         # Inherits 'amount' definition as 'total'
      order_date: timestamp # Inherits 'timestamp' definition as 'order_date'

  # Result:
  # products: product_id, product_name, price, created_at
  # orders: order_id, customer_name, total, order_date
  # All with appropriate types from the reusable columns
```

## Generated SQL

The string inheritance pattern would generate SQL similar to:

```sql
CREATE TABLE products (
    product_id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name VARCHAR(100),
    price NUMERIC(10,2),
    created_at TIMESTAMP
);

CREATE TABLE orders (
    order_id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name VARCHAR(100),
    total NUMERIC(10,2),
    order_date TIMESTAMP
);
```

## Usage Examples

### E-commerce Schema
```yaml
columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  name:
    type: varchar
    size: 100

  money:
    type: numeric
    size: 15
    decimal: 2

  description:
    type: text

tables:
  categories:
    columns:
      category_id: id           # integer, sequence, primary_key
      category_name: name       # varchar(100)
      category_desc: description # text

  products:
    columns:
      product_id: id            # Same id pattern
      product_name: name        # Same name pattern
      product_desc: description # Same description pattern
      price: money              # numeric(15,2)
      cost: money               # Same money type for different purpose

  discounts:
    columns:
      discount_id: id           # Consistent ID pattern
      discount_name: name       # Consistent naming
      amount: money             # Same money type for discount amount
      percentage: money         # Reusing money type for percentage (flexible)
```

### Multi-Entity System
```yaml
columns:
  identifier:
    type: varchar
    size: 50
    unique: true

  full_name:
    type: varchar
    size: 200

  contact_info:
    type: varchar
    size: 255

tables:
  users:
    columns:
      username: identifier      # varchar(50) unique as 'username'
      display_name: full_name   # varchar(200) as 'display_name'
      email: contact_info       # varchar(255) as 'email'

  companies:
    columns:
      company_code: identifier  # varchar(50) unique as 'company_code'
      company_name: full_name   # varchar(200) as 'company_name'
      website: contact_info     # varchar(255) as 'website'

  suppliers:
    columns:
      supplier_code: identifier # Same pattern, different context
      business_name: full_name  # Different name, same structure
      phone: contact_info       # Same field type, different purpose
```

## Benefits

1. **Semantic Clarity**: Column names match their domain context
2. **Type Consistency**: Ensures consistent data types across related columns
3. **Maintenance**: Update base types once, affects all derived columns
4. **Flexibility**: Same base type can serve multiple purposes with appropriate names
5. **Domain Modeling**: Better representation of business concepts

## Common Use Cases

### Standard Patterns
- **IDs**: `id` → `user_id`, `product_id`, `order_id`
- **Names**: `name` → `first_name`, `last_name`, `company_name`
- **Amounts**: `amount` → `price`, `cost`, `discount`, `tax`
- **Timestamps**: `timestamp` → `created_at`, `updated_at`, `deleted_at`

### Financial Systems
```yaml
columns:
  currency:
    type: numeric
    size: 15
    decimal: 2

tables:
  transactions:
    columns:
      debit_amount: currency    # Same precision for debits
      credit_amount: currency   # Same precision for credits
      fee_amount: currency      # Same precision for fees
      tax_amount: currency      # Consistent monetary values
```

## When to Use

- When you need consistent types but contextually appropriate names
- Building domain-specific schemas from generic base types
- Creating multiple tables with similar column patterns
- When semantic clarity is important for developers and users
- Database designs where column names should reflect business terminology

## Related Patterns

- **Null Inheritance**: Use when column names should match exactly
- **$ref Inheritance**: Use when you need to modify properties while inheriting