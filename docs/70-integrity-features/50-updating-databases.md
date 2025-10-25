Previous: [Additive Changes Only](40-additive-changes.md) | Next: [IDE Support](../90-application/10-ide-support.md)

# Updating Databases Safely

When you modify your schema and re-run GenLogic, how does it update your database without breaking existing data or foreign key constraints? This document explains GenLogic's layer-by-layer execution model.

## Why Execution Order Matters

Consider adding a new aggregation table to track global sales totals in a system that already has thousands of sales records:

```yaml
tables:
  global_totals:     # NEW TABLE
    columns:
      id: integer primary key
      total_sales:
        definition: numeric(10,2)
        automation: SUM @sales.amount
    seed-rows:
      - id: 1  # Singleton row

  sales:             # EXISTING TABLE with 5000 rows
    columns:
      id: serial primary key
      global_totals_id: integer default 1  # NEW COLUMN
      amount: numeric(10,2)
      sale_date: date
    foreign_keys:
      global_totals_fk: global_totals  # NEW FK
```

Operations must happen in a specific order:

- Can't add FK constraint before global_totals row exists
- Can't backfill aggregation before sales.global_totals_id column exists
- Can't insert seed data before global_totals table exists
- Can't trust DEFAULT value if we run orphan cleanup on new column

GenLogic solves this through topological layer processing - operations happen in dependency order, ensuring parents exist before children reference them.

## Layer-by-Layer Processing

GenLogic organizes tables into layers based on foreign key dependencies.

Layer assignment rules:

- Layer 0: Tables with no foreign keys (or only self-references)
- Layer 1: Tables that reference only Layer 0 tables
- Layer 2: Tables that reference Layer 0 or Layer 1 tables
- Layer N: Tables that reference only layers 0 through N-1

Example schema layers:

```
Layer 0: global_totals (no dependencies)
Layer 1: sales (references global_totals)
Layer 2: sale_items (references sales)
```

GenLogic processes each layer completely before moving to the next, ensuring all parent data exists before children try to reference it.

## Per-Layer Execution Order

For each layer (0, 1, 2, ...), GenLogic executes operations in this order:

### 1. CREATE TABLE Statements

New tables in this layer are created first.

```sql
-- Layer 0
CREATE TABLE global_totals (
  id INTEGER PRIMARY KEY,
  total_sales NUMERIC(10,2) DEFAULT 0,
  sale_count INTEGER DEFAULT 0
);
```

### 2. ALTER TABLE ADD COLUMN Statements

New columns are added to existing tables in this layer.

```sql
-- Layer 1
ALTER TABLE sales ADD COLUMN global_totals_id INTEGER DEFAULT 1;
```

PostgreSQL 11+ automatically backfills existing rows with DEFAULT values. All 5000 existing sales rows immediately get `global_totals_id = 1`.

### 3. ALTER TABLE ALTER COLUMN (Safe Widening)

Existing columns are widened if the schema specifies larger sizes.

```sql
ALTER TABLE users ALTER COLUMN name TYPE VARCHAR(200);
```

### 4. INSERT Seed Data

Seed data for tables in this layer is inserted.

```sql
-- Layer 0
INSERT INTO global_totals (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
```

This happens AFTER table creation but BEFORE foreign keys are added. Parent rows exist before children try to reference them.

### 5. Cleanup Orphaned FK Values (Skipped for New Columns)

For existing FK columns only, set NULL where parent rows don't exist.

```sql
-- Only runs if sales.global_totals_id already existed in database
UPDATE sales SET global_totals_id = NULL
WHERE global_totals_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM global_totals
  WHERE global_totals.id = sales.global_totals_id
);
```

This step is skipped for newly added FK columns because:

- New columns can't have orphaned data - they were just created
- The DEFAULT value should be trusted (user specified it for a reason)
- If DEFAULT references non-existent parent, FK constraint will fail (fail fast)

This enables patterns like `integer default 1` pointing to a singleton parent row.

### 6. ADD CONSTRAINT Foreign Keys

Foreign key constraints are added for tables in this layer.

```sql
-- Layer 1
ALTER TABLE sales
  ADD CONSTRAINT fk_sales_global_totals
  FOREIGN KEY (global_totals_id)
  REFERENCES global_totals(id)
  ON DELETE RESTRICT;
```

This is safe because:

- Parent table (global_totals) was created in Layer 0
- Parent row (id=1) was seeded in Layer 0
- All sales rows have global_totals_id=1 (from DEFAULT)

### 7. ADD CONSTRAINT Check Constraints

Check constraints are added (e.g., numeric NaN/Infinity protection).

```sql
ALTER TABLE sales
  ADD CONSTRAINT sales_amount_check
  CHECK (amount IS NULL OR amount::text NOT IN ('NaN', 'Infinity', '-Infinity'));
```

### 8. UPDATE Backfill Aggregations

Backfills happen when the child table is in this layer, updating parent tables from earlier layers.

```sql
-- Runs in Layer 1 (when processing sales)
-- Updates Layer 0 (global_totals)
UPDATE global_totals SET total_sales = (
  SELECT COALESCE(SUM(amount), 0)
  FROM sales
  WHERE sales.global_totals_id = global_totals.id
);

UPDATE global_totals SET sale_count = (
  SELECT COUNT(*)
  FROM sales
  WHERE sales.global_totals_id = global_totals.id
);
```

This is safe because:

- global_totals row exists (seeded in Layer 0)
- sales.global_totals_id column exists (added in step 2)
- All sales rows have global_totals_id=1 (from DEFAULT backfill)
- FK constraint exists (added in step 6)

Result: global_totals.total_sales and sale_count are correct immediately.

### 9. CREATE INDEX Statements

Indexes are created for tables in this layer.

```sql
CREATE INDEX idx_sales_global_totals_id ON sales(global_totals_id);
CREATE INDEX idx_sales_sale_date ON sales(sale_date);
```

### 10. COMMENT ON Statements

Table and column comments are added.

```sql
COMMENT ON TABLE global_totals IS 'Singleton table for company-wide totals';
COMMENT ON COLUMN global_totals.total_sales IS 'Sum of all sales amounts';
```

## Global Operations (After All Layers)

Once all layers are processed, GenLogic runs global operations:

1. DROP and CREATE ALL Triggers
   - All GenLogic triggers are dropped first (clean slate)
   - Then recreated fresh from the schema
   - Ensures trigger logic matches current schema

2. CREATE Pattern Matching Functions
   - Stored procedures for pattern matching tables
   - Only created after all tables exist

3. GRANT Permissions
   - Database ownership and permissions set
   - Protects integrity features from accidental modification

## Complete Example: Adding Singleton Aggregation

This section walks through the complete execution when adding the global_totals example to a database with 5000 existing sales.

### Initial State (Before GenLogic Runs)

```
sales table: 5000 rows
  id | amount | sale_date
  ---|--------|----------
  1  | 100.00 | 2024-01-01
  2  | 250.50 | 2024-01-02
  ...
  5000 | 99.99 | 2024-12-31
```

### Layer 0 Processing (global_totals)

```sql
-- Step 1: Create table
CREATE TABLE global_totals (
  id INTEGER PRIMARY KEY,
  total_sales NUMERIC(10,2) DEFAULT 0,
  sale_count INTEGER DEFAULT 0
);

-- Step 4: Insert seed data
INSERT INTO global_totals (id) VALUES (1);

-- Result: global_totals has 1 row with total_sales=0, sale_count=0
```

### Layer 1 Processing (sales)

```sql
-- Step 2: Add column with DEFAULT
ALTER TABLE sales ADD COLUMN global_totals_id INTEGER DEFAULT 1;

-- PostgreSQL automatically backfills all 5000 rows with value 1
-- Result: All sales now have global_totals_id = 1

-- Step 5: Cleanup orphaned FKs
-- SKIPPED: global_totals_id is a new column

-- Step 6: Add FK constraint
ALTER TABLE sales
  ADD CONSTRAINT fk_sales_global_totals
  FOREIGN KEY (global_totals_id)
  REFERENCES global_totals(id);

-- All 5000 sales rows have global_totals_id=1, and that row exists

-- Step 8: Backfill aggregations
UPDATE global_totals SET total_sales = (
  SELECT COALESCE(SUM(amount), 0)
  FROM sales
  WHERE sales.global_totals_id = global_totals.id
);

UPDATE global_totals SET sale_count = (
  SELECT COUNT(*)
  FROM sales
  WHERE sales.global_totals_id = global_totals.id
);

-- Result: global_totals.total_sales = 1,025,374.50 (sum of all 5000 sales)
--         global_totals.sale_count = 5000
```

### Final State (After GenLogic Completes)

```
global_totals:
  id | total_sales  | sale_count
  ---|--------------|------------
  1  | 1,025,374.50 | 5000

sales: 5000 rows
  id | global_totals_id | amount | sale_date
  ---|------------------|--------|----------
  1  | 1                | 100.00 | 2024-01-01
  2  | 1                | 250.50 | 2024-01-02
  ...
  5000 | 1              | 99.99  | 2024-12-31
```

All existing data is preserved, foreign keys are valid, and aggregations are correct.

### Future Inserts

After this setup, new sales automatically maintain the totals:

```sql
INSERT INTO sales (amount, sale_date) VALUES (500.00, '2025-01-01');

-- Triggers automatically update:
-- global_totals.total_sales = 1,025,874.50
-- global_totals.sale_count = 5001
```

## Why This Works

The layer-by-layer model ensures:

1. Parents exist before children - Foreign key constraints never fail
2. Seed data loads before constraints - Parent rows exist for FK validation
3. Columns exist before backfills - Aggregation queries don't fail
4. DEFAULT values are trusted - New FK columns use intended values
5. Triggers come last - Schema is complete before automation activates

## When Order Doesn't Matter

Some operations are naturally dependency-free and happen in any order:

- Creating multiple tables at the same layer (no dependencies between them)
- Adding indexes (don't affect data or constraints)
- Adding comments (pure metadata)

GenLogic processes these in whatever order is convenient - only dependency relationships are strictly ordered.

## Test Coverage

Layer-by-layer execution and dependency-safe updates are verified by these tests:

### Singleton Pattern

- [x] [Singleton Aggregation](../../tests/06-behavior/singleton-aggregation)
  - Adds global_totals table to existing sales data
  - Verifies DEFAULT value backfill works correctly
  - Confirms FK constraint succeeds despite new column
  - Validates aggregation backfill calculates correct totals

### Aggregation Backfilling

- [x] [Aggregation Backfill](../../tests/05-schema-features/additive-aggregation-backfill)
  - Adds SUM and COUNT columns to existing parent table
  - Existing child data already present
  - Verifies parent rows get correct aggregated values
  - Confirms triggers maintain values after backfill

- [x] [All Aggregation Types Backfill](../../tests/05-schema-features/additive-aggregation-backfill-all-types)
  - Tests SUM, COUNT, MAX, MIN backfilling
  - Verifies NULL handling for MAX/MIN with no child rows
  - Ensures correct values for all aggregation types

### Seed Data Dependency Order

- [x] [Seed Data with Lookups](../../tests/06-behavior/seed-data-lookup)
  - Parent table seeded in Layer 0
  - Child table uses $lookup to reference parent in Layer 1
  - Verifies $lookup finds parent row seeded in earlier layer

- [x] [Seed Data Idempotent](../../tests/06-behavior/seed-data-idempotent)
  - Re-running GenLogic doesn't duplicate seed data
  - ON CONFLICT DO NOTHING ensures idempotency

### Additive Changes

- [x] [New Table Added](../../tests/05-schema-features/additive-new-table)
  - New table added to existing database
  - Existing tables remain unchanged
  - Layer-by-layer ensures dependencies respected

- [x] [New Column Added](../../tests/05-schema-features/additive-new-column)
  - New column added to existing table
  - Existing columns and data preserved
  - Column available for use in same layer

## Benefits of Layer-by-Layer Processing

1. Safety: Impossible to create invalid foreign key references
2. Predictability: Operations always happen in dependency order
3. Simplicity: No manual migration coordination needed
4. Confidence: Run GenLogic in production without breaking constraints
5. Correctness: Aggregations and seed data always reflect actual state

## Comparison to Traditional Migrations

Traditional migration tools:

- Require manually ordering migration files
- Risk FK constraint violations if order is wrong
- Often need complex rollback logic
- Each migration is a separate transaction

GenLogic:

- Automatically computes correct execution order
- Impossible to violate FK constraints (operations are dependency-ordered)
- Additive-only means rollback is usually unnecessary
- Single transaction for all changes (atomic updates)

---

Previous: [Additive Changes Only](40-additive-changes.md) | Next: [IDE Support](../90-application/10-ide-support.md)
