Previous: [Single Table Basics](01-single-table.md) | Next: [Foreign Keys](03-foreign-keys.md)

# Reusable Column Definitions

Column definitions can be declared once and reused across multiple tables.

## Basic Structure

```yaml
columns:
  template_name:
    type: *any valid PostgreSQL type*
    comment: *description*

tables:
  table_name:
    columns:
      column_name: template_name
```

## Simple Example

```yaml
columns:
  id:
    type: serial primary key
    comment: Auto-incrementing primary key

  name:
    type: varchar(100)
    comment: Name field

  email:
    type: varchar(255)
    comment: Email address

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
    comment: Timestamp with timezone

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
    type: serial primary key
    comment: Auto-incrementing primary key

tables:
  products:
    columns:
      id: null  # Creates column 'id' with properties from 'id' template
  customers:
    columns:
      id:       # Same as id: null
```

### Reference Inheritance with Overrides
Use $ref to inherit and override specific properties:

```yaml
columns:
  id:
    type: serial primary key
    comment: Primary key

  text_column:
    type: varchar(100)
    comment: Text field

tables:
  articles:
    columns:
      article_id:
        $ref: id  # Inherit from 'id' template

      title:
        $ref: text_column
        type: varchar(200)  # Override: increase size to 200

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
    type: serial primary key
    comment: Auto-incrementing primary key

  name:
    type: varchar(100)
    comment: Name field

  description:
    type: text
    comment: Description field

  price:
    type: numeric(10,2)
    comment: Price amount

  timestamp:
    type: timestamptz
    comment: Timestamp with timezone

  active:
    type: boolean
    comment: Active status

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
    type: serial primary key
    comment: Auto-incrementing primary key

  # Standard timestamps
  created_at:
    type: timestamptz
    comment: Creation timestamp

  updated_at:
    type: timestamptz
    comment: Last update timestamp

  # Standard text fields
  short_text:
    type: varchar(100)
    comment: Short text field

  medium_text:
    type: varchar(255)
    comment: Medium text field

  long_text:
    type: text
    comment: Long text field

  # Money
  currency:
    type: numeric(15,2)
    comment: Currency amount

  # Boolean flags
  flag:
    type: boolean
    comment: Boolean flag
```

---

Previous: [Single Table Basics](01-single-table.md) | Next: [Foreign Keys](03-foreign-keys.md)
