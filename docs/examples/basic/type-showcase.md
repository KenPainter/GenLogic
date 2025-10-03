Previous: [Minimal Schema](minimal-schema.md) | Next: [String Inheritance](../inheritance/string-inheritance.md)

# PostgreSQL Type Showcase

A comprehensive example demonstrating all supported PostgreSQL data types and their size requirements in GenLogic. This reference helps you choose the right data type for your columns.

## Key Concepts

- Required Size Types: varchar, char, bit must specify size
- Optional Size Types: numeric, decimal can optionally specify precision/scale
- No Size Types: Most other types don't accept size parameters
- Size Validation: GenLogic validates that size parameters are used correctly

## Type Categories

### Types That REQUIRE Size
- `varchar(n)` - Variable-length character string
- `char(n)` - Fixed-length character string
- `bit(n)` - Fixed-length bit string

### Types That ALLOW Size (Optional)
- `numeric(precision, scale)` - Exact numeric with optional precision/scale
- `decimal(precision, scale)` - Alias for numeric

### Types That PROHIBIT Size
All other types (integer, bigint, text, timestamp, etc.) don't accept size parameters.

## Schema

```yaml
# PostgreSQL Type Showcase
# Demonstrates all supported PostgreSQL types and size requirements

columns:
  # Types that REQUIRE size
  short_text:
    type: varchar
    size: 50

  fixed_text:
    type: char
    size: 10

  bit_flags:
    type: bit
    size: 8

  # Types that ALLOW size (optional)
  currency:
    type: numeric
    size: 15
    decimal: 2

  percentage:
    type: numeric
    size: 5
    decimal: 2

  simple_decimal:
    type: decimal
    size: 10
    decimal: 3

  unlimited_numeric:
    type: numeric  # No size - unlimited precision

  # Types that PROHIBIT size
  unique_id:
    type: integer
    sequence: true
    primary_key: true

  big_number:
    type: bigint

  small_number:
    type: smallint

  floating_point:
    type: real

  double_precision:
    type: double precision

  is_active:
    type: boolean

  event_date:
    type: date

  created_at:
    type: timestamp

  created_with_tz:
    type: timestamptz

  long_content:
    type: text

  unique_identifier:
    type: uuid

  metadata:
    type: json

  structured_data:
    type: jsonb

tables:
  type_examples:
    columns:
      id: unique_id
      name: short_text
      code: fixed_text
      flags: bit_flags
      price: currency
      rate: percentage
      score: simple_decimal
      unlimited: unlimited_numeric
      count: big_number
      priority: small_number
      ratio: floating_point
      precise_ratio: double_precision
      active: is_active
      birthday: event_date
      created: created_at
      created_tz: created_with_tz
      description: long_content
      uuid: unique_identifier
      settings: metadata
      data: structured_data
```

## Generated SQL

```sql
CREATE TABLE type_examples (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50),
    code CHAR(10),
    flags BIT(8),
    price NUMERIC(15,2),
    rate NUMERIC(5,2),
    score DECIMAL(10,3),
    unlimited NUMERIC,
    count BIGINT,
    priority SMALLINT,
    ratio REAL,
    precise_ratio DOUBLE PRECISION,
    active BOOLEAN,
    birthday DATE,
    created TIMESTAMP,
    created_tz TIMESTAMPTZ,
    description TEXT,
    uuid UUID,
    settings JSON,
    data JSONB
);
```

## Type Selection Guide

| Use Case | Recommended Type | Example |
|----------|------------------|---------|
| Auto-incrementing ID | `integer` with `sequence: true` | User IDs, Order numbers |
| Short text | `varchar(n)` | Names, titles, codes |
| Long text | `text` | Descriptions, content |
| Money/Currency | `numeric(15,2)` | Prices, balances |
| Percentages | `numeric(5,2)` | Rates, ratios |
| True/False | `boolean` | Flags, status |
| Dates | `date` | Birthdays, due dates |
| Date + Time | `timestamp` | Created/updated times |
| Date + Time + Timezone | `timestamptz` | User activity, logs |
| Unique identifier | `uuid` | External system IDs |
| Structured data | `jsonb` | Settings, metadata |

This comprehensive type showcase ensures you choose the most appropriate PostgreSQL data type for your GenLogic schemas.

---

Previous: [Minimal Schema](minimal-schema.md) | Next: [String Inheritance](../inheritance/string-inheritance.md)
