# Reusable Column Definitions

Column definitions can be declared once and reused across multiple tables.

## Basic Structure

```yaml
columns:
  column_template_name:
    type: data_type
    # ... other properties

tables:
  table_name:
    columns:
      actual_column_name: column_template_name
```

## Simple Example

```yaml
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

tables:
  users:
    columns:
      user_id: id
      username: name
      user_email: email

  customers:
    columns:
      customer_id: id
      customer_name: name
      contact_email: email
```

## Generated SQL

```sql
CREATE TABLE users (
  user_id SERIAL PRIMARY KEY,
  username VARCHAR(100),
  user_email VARCHAR(255)
);

CREATE TABLE customers (
  customer_id SERIAL PRIMARY KEY,
  customer_name VARCHAR(100),
  contact_email VARCHAR(255)
);
```

## Inheritance Methods

### String Inheritance
Reference a column template by name:

```yaml
columns:
  timestamp:
    type: timestamptz

tables:
  orders:
    columns:
      created_at: timestamp  # Inherits all properties from 'timestamp'
```

### Null Inheritance
Use null to inherit with the same column name:

```yaml
columns:
  id:
    type: integer
    primary_key: true
    sequence: true

tables:
  products:
    columns:
      id: null  # Creates column 'id' with properties from 'id' template
```

### Reference Inheritance with Overrides
Use $ref to inherit and override specific properties:

```yaml
columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  text_column:
    type: varchar
    size: 100

tables:
  articles:
    columns:
      article_id:
        $ref: id  # Inherit from 'id' template

      title:
        $ref: text_column
        size: 200  # Override: increase size to 200

      summary:
        $ref: text_column  # Use default size of 100
```

Generated SQL:

```sql
CREATE TABLE articles (
  article_id SERIAL PRIMARY KEY,
  title VARCHAR(200),
  summary VARCHAR(100)
);
```

## Complete Example

```yaml
columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  name:
    type: varchar
    size: 100

  description:
    type: text

  price:
    type: numeric
    size: 10
    decimal: 2

  timestamp:
    type: timestamptz

  active:
    type: boolean

tables:
  categories:
    columns:
      category_id: id
      category_name: name
      details: description

  products:
    columns:
      product_id: id
      product_name: name
      product_description: description
      unit_price: price
      is_active: active
      created_at: timestamp
      updated_at: timestamp

  vendors:
    columns:
      vendor_id: id
      vendor_name: name
      contact_info: description
      registered_at: timestamp
```

## How Column References Work

When a table column references a template:

1. Template properties are copied to the column
2. Column gets the name specified in the table
3. If using $ref, additional properties override template values
4. The template itself does not become a column

## Common Reusable Patterns

```yaml
columns:
  # Auto-incrementing primary key
  id:
    type: integer
    sequence: true
    primary_key: true

  # Standard timestamps
  created_at:
    type: timestamptz

  updated_at:
    type: timestamptz

  # Standard text fields
  short_text:
    type: varchar
    size: 100

  medium_text:
    type: varchar
    size: 255

  long_text:
    type: text

  # Money
  currency:
    type: numeric
    size: 15
    decimal: 2

  # Boolean flags
  flag:
    type: boolean
```
