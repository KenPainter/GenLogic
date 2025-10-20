Previous: [Non-Subvertible Calculations](02-non-subvertible-calculations.md) | Next: [Numeric Integrity Protection](04-numeric-integrity.md)

# Additive Changes Only

GenLogic guarantees that it will never destroy data. All schema changes are **additive only** - GenLogic can create new tables, add new columns, and widen existing columns, but it cannot and will not delete or narrow anything.

## The Guarantee

**GenLogic can not, in any code path, destroy data.**

This means:
- No tables are ever dropped
- No columns are ever dropped
- No columns are ever narrowed (e.g., VARCHAR(100) → VARCHAR(50))
- No data type changes that could lose data
- No changes to column constraints that could reject existing data

## What GenLogic Will Do

### Create New Tables

```yaml
# Original schema
tables:
  users:
    columns:
      id: serial primary key

# Add new table - SAFE
tables:
  users:
    columns:
      id: serial primary key

  orders:  # NEW TABLE - will be created
    columns:
      id: serial primary key
```

GenLogic generates: `CREATE TABLE orders (...)`

### Add New Columns

```yaml
# Original
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)

# Add column - SAFE
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
      email: varchar(255)  # NEW COLUMN - will be added
```

GenLogic generates: `ALTER TABLE users ADD COLUMN email VARCHAR(255)`

### Widen Columns

GenLogic allows widening columns in safe ways:

#### VARCHAR Widening

```yaml
# Original
columns:
  name: varchar(100)

# Wider - SAFE
columns:
  name: varchar(200)  # Widening is safe
```

GenLogic generates: `ALTER TABLE users ALTER COLUMN name TYPE VARCHAR(200)`

#### NUMERIC Precision/Scale Expansion

```yaml
# Original
columns:
  price: numeric(10,2)

# More precision - SAFE
columns:
  price: numeric(12,4)  # Allows more digits, more decimal places
```

GenLogic generates: `ALTER TABLE products ALTER COLUMN price TYPE NUMERIC(12,4)`

## What GenLogic Will NOT Do

### Drop Tables

```yaml
# Original
tables:
  users:
    columns:
      id: serial primary key
  orders:
    columns:
      id: serial primary key

# Remove table from schema
tables:
  users:
    columns:
      id: serial primary key
  # orders removed from YAML
```

**Result**: GenLogic will NOT drop the `orders` table. The table remains in the database.

**Rationale**: Removing a table from the YAML might be accidental. Requiring explicit database operations for destructive changes prevents data loss from configuration errors.

### Drop Columns

```yaml
# Original
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
      email: varchar(255)

# Remove column from schema
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
      # email removed from YAML
```

**Result**: GenLogic will NOT drop the `email` column. The column remains in the database.

### Narrow Columns

```yaml
# Original
columns:
  name: varchar(200)

# Narrower - REJECTED
columns:
  name: varchar(100)  # Would truncate data!
```

**Result**: GenLogic will NOT alter the column. It remains VARCHAR(200).

**Rationale**: Narrowing VARCHAR(200) to VARCHAR(100) could truncate existing data. This is a destructive operation.

### Change Data Types

```yaml
# Original
columns:
  age: integer

# Change type - REJECTED
columns:
  age: varchar(10)  # Incompatible type change
```

**Result**: GenLogic will NOT alter the column type.

**Rationale**: Changing `integer` to `varchar` is not a simple widening operation and could fail or corrupt data.

### Remove Constraints

```yaml
# Original
columns:
  email: varchar(255) not null unique

# Remove constraints - NOT SUPPORTED
columns:
  email: varchar(255)  # Lost NOT NULL and UNIQUE
```

**Result**: Constraints remain on the column.

**Rationale**: GenLogic focuses on additive changes. Removing constraints is not currently supported.

## Manual Destructive Operations

If you need to perform destructive operations, do them manually outside of GenLogic:

```sql
-- Drop a column manually
ALTER TABLE users DROP COLUMN deprecated_field;

-- Drop a table manually
DROP TABLE old_table;

-- Narrow a column (after verifying data fits)
ALTER TABLE users ALTER COLUMN code TYPE VARCHAR(20);
```

After manual changes, re-run GenLogic to ensure automated columns and triggers are correctly regenerated.

## Benefits of Additive-Only

1. **Safety**: Schema changes cannot accidentally destroy data
2. **Confidence**: Run GenLogic in production without fear
3. **Rollback**: Keep old columns during migrations, drop later
4. **Auditing**: Old columns remain for historical queries
5. **Simplicity**: No complex migration coordination needed

## Workflow Recommendations

### Safe Schema Evolution

1. Start with minimal schema
2. Run GenLogic to create database
3. Add new tables/columns to YAML as needed
4. Re-run GenLogic - new elements are added
5. Old elements remain unchanged

### Removing Fields

If you want to remove a field:

1. Remove it from the YAML (GenLogic ignores it)
2. Application stops using the column
3. Wait for confidence period (days/weeks)
4. Manually drop the column when ready

### Renaming Fields

Renaming is seen as: delete old + create new

1. Add new column with new name
2. Run GenLogic (new column created, old column remains)
3. Application writes to both columns during transition
4. Application switches to reading from new column
5. Manually drop old column when ready

## Widening Rules

### Safe Widening

- VARCHAR(n) → VARCHAR(m) where m > n
- CHAR(n) → CHAR(m) where m > n
- NUMERIC(p1,s1) → NUMERIC(p2,s2) where p2 ≥ p1 and s2 ≥ s1

### Unsafe Changes (Rejected)

- VARCHAR(n) → VARCHAR(m) where m < n (narrowing)
- NUMERIC(p1,s1) → NUMERIC(p2,s2) where p2 < p1 or s2 < s1 (precision loss)
- integer → bigint (might be safe but not implemented)
- Any other type change

## Test Coverage

Additive changes are tested in the schema features and behavior test suites:

### Schema Features (Isolated Tests)

- [x] [New table added](../../tests/05-schema-features/additive-new-table) - New table added to existing database
- [x] [New column added](../../tests/05-schema-features/additive-new-column) - New column added to existing table
- [x] [Column widening](../../tests/05-schema-features/additive-widen-column) - Columns widened for CHAR, VARCHAR, NUMERIC

### Behavior (End-to-End Tests)

- [x] [VARCHAR size expansion](../../tests/06-behavior/column-expansion-varchar) - Widening VARCHAR columns
- [x] [NUMERIC precision expansion](../../tests/06-behavior/column-expansion-numeric) - Widening NUMERIC precision/scale
- [x] [Expansion via reusable columns](../../tests/06-behavior/column-expansion-reusable) - Column expansion through $ref

---

Previous: [Non-Subvertible Calculations](02-non-subvertible-calculations.md) | Next: [Numeric Integrity Protection](04-numeric-integrity.md)
