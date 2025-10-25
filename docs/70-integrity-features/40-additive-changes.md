Previous: [Calculation Integrity](30-calculation-integrity.md) | Next: [IDE Support](../90-application/10-ide-support.md)

# Additive Changes Only

GenLogic guarantees that it will never destroy data. All schema changes are additive only - GenLogic can create new tables, add new columns, and widen existing columns, but it cannot and will not delete or narrow anything.

## The Guarantee

GenLogic cannot, in any code path, destroy data.

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

#### Aggregation Columns with Backfill

When adding aggregation columns (SUM, COUNT, MAX, MIN) to existing tables with data:

```yaml
# Add aggregation to existing table with data
tables:
  accounts:
    columns:
      id: serial primary key
      name: varchar(100)
      balance:                              # NEW aggregation column
        definition: numeric(10,2)
        automation: SUM @transactions.amount

  transactions:
    foreign_keys:
      account_fk: accounts
    columns:
      transaction_id: serial primary key
      account_fk: integer
      amount: numeric(10,2)
```

GenLogic generates:
```sql
ALTER TABLE accounts ADD COLUMN balance NUMERIC(10,2) DEFAULT 0;

-- BACKFILL: Calculate correct values for existing rows
UPDATE accounts SET balance = (
  SELECT COALESCE(SUM(amount), 0)
  FROM transactions
  WHERE transactions.account_fk = accounts.id
);
```

The backfill ensures existing data has correct aggregation values immediately, not just the default value.

**Note**: LAST_VALUE aggregations are NOT backfilled because GenLogic cannot determine which child row is "last" without an ordering column.

See [Moving Values from Child to Parent](../30-column-automation/30-child-to-parent.md#backfilling-aggregations) for details.

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

Result: GenLogic will NOT drop the `orders` table. The table remains in the database.

Rationale: Removing a table from the YAML might be accidental. Requiring explicit database operations for destructive changes prevents data loss from configuration errors.

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

Result: GenLogic will NOT drop the `email` column. The column remains in the database.

### Narrow Columns

```yaml
# Original
columns:
  name: varchar(200)

# Narrower - REJECTED
columns:
  name: varchar(100)  # Would truncate data!
```

Result: GenLogic throws an error and refuses to proceed.

Error message:
```
Cannot narrow column users.name: database has VARCHAR(200), schema specifies VARCHAR(100).
Narrowing columns would truncate data. Use manual ALTER TABLE if needed.
```

Rationale: Narrowing VARCHAR(200) to VARCHAR(100) could truncate existing data. GenLogic fails fast to prevent silent data loss risks.

### Change Data Types

```yaml
# Original
columns:
  age: integer

# Change type - REJECTED
columns:
  age: varchar(10)  # Incompatible type change
```

Result: GenLogic throws an error and refuses to proceed.

Error message:
```
Cannot change column type for users.age: database has integer, schema specifies varchar(10).
Type changes are not supported. Use manual ALTER TABLE if needed.
```

Rationale: Changing `integer` to `varchar` is not a simple widening operation and could fail or corrupt data. GenLogic fails fast to prevent accidental schema mismatches.

### Remove Constraints

```yaml
# Original
columns:
  email: varchar(255) not null unique

# Remove constraints - NOT SUPPORTED
columns:
  email: varchar(255)  # Lost NOT NULL and UNIQUE
```

Result: Constraints remain on the column.

Rationale: GenLogic focuses on additive changes. Removing constraints is not currently supported.

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

## Technical Approach

GenLogic enforces additive-only changes through design - there is no code path that can generate destructive operations.

The diff engine (`src/diff-engine.ts`) only generates these operation types:
- `tablesToCreate` - Create new tables
- `columnsToAdd` - Add new columns to existing tables
- `columnsToModify` - Widen existing columns (safe expansions only)
- `foreignKeysToAdd` - Add new foreign key constraints
- `indexesToCreate` - Create new indexes
- `checkConstraintsToAdd` - Add new CHECK constraints

There are NO corresponding "drop" or "delete" operations:
- No `tablesToDrop`
- No `columnsToDrop`
- No `DROP TABLE` statements anywhere in codebase
- No `DROP COLUMN` statements anywhere in codebase

Column modifications are actively validated in `detectSafeColumnModification()`:
- Throws error if base types differ (type change not supported)
- Throws error if narrowing is detected (e.g., VARCHAR size decrease)
- Throws error if NUMERIC precision or scale would decrease
- Only returns a modification for proven-safe expansions

This means:
- Removed tables/columns in YAML are simply ignored (no error)
- Type changes throw errors (prevents schema mismatches)
- Narrowing operations throw errors (prevents data loss)
- Only explicitly safe widening operations are generated

## Benefits of Additive-Only

1. Safety: Schema changes cannot accidentally destroy data
2. Confidence: Run GenLogic in production without fear
3. Rollback: Keep old columns during migrations, drop later
4. Auditing: Old columns remain for historical queries
5. Simplicity: No complex migration coordination needed

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

### Safe Widening (Implemented)

GenLogic will automatically generate ALTER TABLE statements for these safe expansions:

- VARCHAR(n) → VARCHAR(m) where m > n
- CHAR(n) → CHAR(m) where m > n
- NUMERIC(p1,s1) → NUMERIC(p2,s2) where p2 ≥ p1 and s2 ≥ s1

### Unsafe Changes (Rejected with Error)

GenLogic throws an error and refuses to proceed for these unsafe changes:

- VARCHAR(n) → VARCHAR(m) where m < n (narrowing - would truncate data)
- CHAR(n) → CHAR(m) where m < n (narrowing - would truncate data)
- NUMERIC(p1,s1) → NUMERIC(p2,s2) where p2 < p1 or s2 < s1 (precision/scale loss)
- Any type change (e.g., integer → varchar, integer → bigint)

Not yet implemented (silently ignored):
- Adding/removing NOT NULL, UNIQUE, or other constraints

## Test Coverage

Additive-only behavior is verified by these tests:

### Schema Features

- [x] [Empty Database](../../tests/05-schema-features/additive-empty-database)
  - GenLogic creates initial schema safely
  - No pre-existing tables affected

- [x] [New Table Added](../../tests/05-schema-features/additive-new-table)
  - New table added to existing database
  - Existing tables remain unchanged
  - No data loss from existing tables

- [x] [New Column Added](../../tests/05-schema-features/additive-new-column)
  - New column added to existing table
  - Existing columns remain unchanged
  - Existing data preserved

- [x] [Aggregation Column Backfill](../../tests/05-schema-features/additive-aggregation-backfill)
  - New SUM and COUNT columns added to existing table with data
  - Existing parent rows automatically backfilled with correct values
  - Triggers maintain values for future changes

- [x] [All Aggregation Types Backfill](../../tests/05-schema-features/additive-aggregation-backfill-all-types)
  - Tests SUM, COUNT, MAX, and MIN backfilling
  - Verifies NULL handling for MAX/MIN with no child rows
  - Ensures triggers work correctly after backfill

- [x] [Column Widening](../../tests/05-schema-features/additive-widen-column)
  - VARCHAR, CHAR, and NUMERIC columns safely widened
  - Existing data fits in widened columns
  - ALTER TABLE TYPE generated correctly

- [x] [Never Drops Tables](../../tests/05-schema-features/additive-never-drops-tables)
  - Table removed from YAML schema
  - GenLogic does NOT drop the table
  - Table and all data remain in database

- [x] [Never Drops Columns](../../tests/05-schema-features/additive-never-drops-columns)
  - Column removed from YAML schema
  - GenLogic does NOT drop the column
  - Column and all data remain in table

- [x] [Never Shrinks Columns](../../tests/05-schema-features/additive-never-shrinks-columns)
  - Schema specifies narrower VARCHAR, CHAR, and NUMERIC
  - GenLogic throws error refusing to narrow columns
  - Error message indicates narrowing would lose data

### Behavior Tests

- [x] [VARCHAR Size Expansion](../../tests/06-behavior/column-expansion-varchar)
  - End-to-end test of VARCHAR widening
  - Data preserved after expansion
  - Application can use wider column

- [x] [NUMERIC Precision Expansion](../../tests/06-behavior/column-expansion-numeric)
  - End-to-end test of NUMERIC precision/scale expansion
  - Existing values remain valid
  - Wider precision/scale available

- [x] [Expansion via Reusable Columns](../../tests/06-behavior/column-expansion-reusable)
  - Column expansion through $ref mechanism
  - Reusable column definition widened
  - All tables using $ref get widened columns

---

Previous: [Calculation Integrity](30-calculation-integrity.md) | Next: [IDE Support](../90-application/10-ide-support.md)
