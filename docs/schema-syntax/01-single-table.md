Previous: [What GenLogic Does](../building-database/20-what-genlogic-does.md) | Next: [Reusable Columns](02-reusable-columns.md)

# Single Table Definition

A GenLogic schema defines one or more tables with their columns and data types.

## Basic Structure

```yaml
tables:
  table_name:
    columns:
      column_name: *any valid PostgreSQL type*
```

## Complete Example with All Column Types

```yaml
tables:
  products:
    columns:
      # Integer types
      id: serial primary key
      stock_count: bigint
      priority: smallint

      # Text types
      name: varchar(100)
      code: char(10)
      description: text

      # Numeric types with precision
      price: numeric(10,2)
      weight: decimal(8,3)
      unlimited_precision: numeric

      # Floating point
      ratio: real
      precise_ratio: double precision

      # Boolean
      active: boolean

      # Date and time
      manufacture_date: date
      created_at: timestamp
      updated_at: timestamptz

      # Other types
      external_id: uuid
      bit_flags: bit(8)
      settings: json
      metadata: jsonb
```

## Generated SQL

```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  stock_count BIGINT,
  priority SMALLINT,
  name VARCHAR(100),
  code CHAR(10),
  description TEXT,
  price NUMERIC(10,2),
  weight DECIMAL(8,3),
  unlimited_precision NUMERIC,
  ratio REAL,
  precise_ratio DOUBLE PRECISION,
  active BOOLEAN,
  manufacture_date DATE,
  created_at TIMESTAMP,
  updated_at TIMESTAMPTZ,
  external_id UUID,
  bit_flags BIT(8),
  settings JSON,
  metadata JSONB
);
```

## Column Definition Formats

### SQL String (Simple)
The simplest format uses SQL type strings directly:

```yaml
columns:
  id: serial primary key
  name: varchar(100) not null unique
  balance: numeric(15,2) default 0
  created_at: timestamp default NOW()
```

### Object Format (For GenLogic Features)
Use object format when you need GenLogic-specific features like automation or generated columns:

```yaml
columns:
  total_sales:
    type: numeric(12,2)
    automation: SUM @orders.amount
    comment: Total from all orders

  net_balance:
    type: numeric(15,2)
    # use quotes if the first symbol is @ in the string
    generated: "@debits - @credits"
    comment: Calculated balance
```

## Data Type Reference

### Integer Types
- integer - 4-byte integer
- bigint - 8-byte integer
- smallint - 2-byte integer
- serial - Auto-incrementing integer
- bigserial - Auto-incrementing bigint

### Text Types
- varchar(n) - Variable-length text, size required
- char(n) - Fixed-length text, size required
- text - Unlimited length text

### Numeric Types
- numeric(p,s) - Exact decimal with precision and scale
- decimal(p,s) - Same as numeric
- numeric - Unlimited precision
- real - 4-byte floating point
- double precision - 8-byte floating point

### Boolean
- boolean - true/false values

### Date and Time
- date - Calendar date
- timestamp - Date and time without timezone
- timestamptz - Date and time with timezone

### Other Types
- uuid - Universally unique identifier
- bit(n) - Fixed-length bit string
- json - JSON data
- jsonb - Binary JSON data (indexable)

### SQL Constraints
You can combine types with constraints:
- not null - Prevents NULL values
- unique - Ensures unique values
- default value - Sets default value
- primary key - Marks as primary key

---

Previous: [What GenLogic Does](../building-database/20-what-genlogic-does.md) | Next: [Reusable Columns](02-reusable-columns.md)
