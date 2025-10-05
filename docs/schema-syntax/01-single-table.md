# Single Table Definition

A GenLogic schema defines one or more tables with their columns and data types.

## Basic Structure

```yaml
tables:
  table_name:
    columns:
      column_name: { type: data_type }
```

## Complete Example with All Column Types

```yaml
tables:
  products:
    columns:
      # Integer types
      id: { type: integer, primary_key: true, sequence: true }
      stock_count: { type: bigint }
      priority: { type: smallint }

      # Text types
      name: { type: varchar, size: 100 }
      code: { type: char, size: 10 }
      description: { type: text }

      # Numeric types with precision
      price: { type: numeric, size: 10, decimal: 2 }
      weight: { type: decimal, size: 8, decimal: 3 }
      unlimited_precision: { type: numeric }

      # Floating point
      ratio: { type: real }
      precise_ratio: { type: double precision }

      # Boolean
      active: { type: boolean }

      # Date and time
      manufacture_date: { type: date }
      created_at: { type: timestamp }
      updated_at: { type: timestamptz }

      # Other types
      external_id: { type: uuid }
      bit_flags: { type: bit, size: 8 }
      settings: { type: json }
      metadata: { type: jsonb }
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

## Column Properties

### type (required)
The PostgreSQL data type. See type reference below.

### size (conditional)
- Required for: varchar, char, bit
- Optional for: numeric, decimal
- Not allowed for: all other types

### decimal (optional)
Number of decimal places for numeric and decimal types. Requires size to be specified first.

### primary_key (optional)
Marks column as primary key. Default: false

### sequence (optional)
Auto-increment integer columns. Generates SERIAL, BIGSERIAL, or SMALLSERIAL based on type. Default: false

### unique (optional)
Adds UNIQUE constraint. Default: false

## Data Type Reference

### Integer Types
- integer - 4-byte integer
- bigint - 8-byte integer
- smallint - 2-byte integer

### Text Types
- varchar(n) - Variable-length text, size required
- char(n) - Fixed-length text, size required
- text - Unlimited length text

### Numeric Types
- numeric(p,s) - Exact decimal, size optional
- decimal(p,s) - Same as numeric
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
- bit(n) - Fixed-length bit string, size required
- json - JSON data
- jsonb - Binary JSON data (indexable)
