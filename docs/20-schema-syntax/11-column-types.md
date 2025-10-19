Previous: [Tables and Columns](10-tables-and-columns.md) | Next: [Reusable Columns](12-reusable-columns.md)

# Column Types

GenLogic supports standard PostgreSQL data types in column definitions.
Types can be specified as SQL strings or in object format for advanced features.

## Example

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

## Data Type Support and Limitations

### Integer Types
- integer - 4-byte integer
- bigint - 8-byte integer
- smallint - 2-byte integer
- serial - Auto-incrementing integer
- bigserial - Auto-incrementing bigint
- smallserial - Auto-incrementing smallint

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

## Test Coverage

### Integer Types

- [x] [SERIAL, BIGSERIAL, SMALLSERIAL](../../tests/05-schema-features/column-types-serial)
- [x] [INTEGER, BIGINT, SMALLINT](../../tests/05-schema-features/column-types-integer)

### Text Types

- [x] [VARCHAR, CHAR, TEXT](../../tests/05-schema-features/column-types-text)

### Numeric Types

- [x] [NUMERIC with precision and scale](../../tests/05-schema-features/column-types-numeric)
- [x] [REAL, DOUBLE PRECISION](../../tests/05-schema-features/column-types-float)

### Boolean Type

- [x] [BOOLEAN](../../tests/05-schema-features/column-types-boolean)

### Date and Time Types

- [x] [DATE, TIMESTAMP, TIMESTAMPTZ](../../tests/05-schema-features/column-types)

### Other Types

- [x] [UUID](../../tests/05-schema-features/column-types-uuid)
- [x] [JSON, JSONB](../../tests/05-schema-features/column-types-json)
- [x] [BIT](../../tests/05-schema-features/column-types)

### All Types Combined

- [x] [All PostgreSQL data types in one schema](../../tests/05-schema-features/column-types)

---

Previous: [Tables and Columns](10-tables-and-columns.md) | Next: [Reusable Columns](12-reusable-columns.md)
