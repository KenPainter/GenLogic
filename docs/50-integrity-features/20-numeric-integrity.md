Previous: [Schema Validation](10-schema-validation.md) | Next: [Calculation Integrity](30-calculation-integrity.md)

# Numeric Integrity Protection

GenLogic automatically protects all numeric columns from NaN (Not a Number)
and Infinity values. These special numeric values corrupt calculations
and are not valid in the business application space that GenLogic serves.

## The Problem

PostgreSQL's numeric types accept special values that poison calculations:

```sql
-- NaN spreads virally through calculations
INSERT INTO transactions (amount) VALUES ('NaN'::numeric);
SELECT SUM(amount) FROM transactions;
-- Result: NaN (one NaN value corrupts the entire SUM)

-- Infinity corrupts aggregations
INSERT INTO transactions (amount) VALUES ('Infinity'::numeric);
SELECT SUM(amount) FROM transactions;
-- Result: Infinity (all meaningful values lost)
```

Once NaN or Infinity enters your database, it spreads through:
- SUM aggregations: SUM(100, 200, NaN) = NaN
- Formula columns: @price * @quantity where price is NaN = NaN
- Arithmetic: balance - withdrawal where withdrawal is Infinity = -Infinity

This corruption is difficult to detect and clean because NaN has inconsistent equality behavior across PostgreSQL numeric types.

## GenLogic's Solution

GenLogic automatically adds CHECK constraints to ALL floating-point numeric columns to reject NaN and Infinity:

```sql
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  balance NUMERIC(10,2)
    CHECK (balance IS NULL OR balance::text NOT IN ('NaN', 'Infinity', '-Infinity'))
);
```

This constraint blocks:
- NaN: The text representation check catches 'NaN'
- Infinity: The text representation check catches 'Infinity' and '-Infinity'
- NULL: Explicitly allowed (NULL is different from NaN)

## Technical Approach

GenLogic uses text representation (`::text NOT IN`) rather than mathematical equality checks because:

PostgreSQL's numeric types have inconsistent NaN behavior:
- For `numeric`/`decimal`: NaN = NaN returns TRUE (not IEEE 754 standard)
- For `real`/`double precision`: NaN = NaN returns FALSE (IEEE 754 standard)

A mathematical check like `value = value` would fail for `real`/`double precision` but pass for `numeric`. Text representation is consistent across all types.

The `::text` cast has negligible performance impact for business applications - constraints are evaluated only on INSERT/UPDATE, not on queries.

Constraint naming follows the pattern `{table_name}_{column_name}_check` for easy identification in PostgreSQL system catalogs.

## Protected Types

GenLogic adds this protection to floating-point numeric types:

- `numeric` / `numeric(p,s)` / `decimal`
- `real`
- `double precision` / `float`

Integer types (integer, bigint, smallint) are NOT protected because they cannot store NaN or Infinity.

## Examples

Valid values are allowed:

```sql
-- Normal numbers work
INSERT INTO test (amount) VALUES (100.50);

-- NULL is allowed
INSERT INTO test (amount) VALUES (NULL);

-- Negative numbers work
INSERT INTO test (amount) VALUES (-50.25);
```

Invalid values are rejected:

```sql
-- NaN is blocked
INSERT INTO test (amount) VALUES ('NaN'::numeric);
-- ERROR: new row violates check constraint

-- Infinity is blocked
INSERT INTO test (amount) VALUES ('Infinity'::numeric);
-- ERROR: new row violates check constraint

-- -Infinity is blocked
INSERT INTO test (amount) VALUES ('-Infinity'::numeric);
-- ERROR: new row violates check constraint
```

## Why This Matters

Business applications must guarantee data integrity. With NaN/Infinity protection:

1. SUM aggregations are reliable - one bad insert cannot corrupt entire account balances
2. Formula column calculations are safe - arithmetic always produces valid results
3. Reports are trustworthy - no mysterious "NaN" values appear in financial reports
4. Data migrations are clean - no special case handling needed for corrupt data

## Implementation

Protection is automatic for all numeric columns. No schema configuration needed.

GenLogic adds CHECK constraints:
- To all new numeric columns when tables are created
- To all new numeric columns when added to existing tables
- To all existing numeric columns that lack protection (retroactive)

The CHECK constraint is generated in `src/sql-generator.ts` during table creation and column addition.
Missing constraints on existing columns are detected in `src/diff-engine.ts` and added automatically.

## Test Coverage

This feature is verified by:

- [x] [Numeric NaN/Infinity Protection](../../tests/05-schema-features/numeric-nan-infinity-protection)
  - Valid numeric values allowed (positive, negative, zero)
  - NULL values allowed
  - NaN rejected with CHECK constraint violation
  - Infinity rejected with CHECK constraint violation
  - -Infinity rejected with CHECK constraint violation
  - All floating-point types tested: numeric, numeric(p,s), decimal, real, double precision

- [x] [Numeric Constraint Detection](../../tests/05-schema-features/numeric-constraint-detection)
  - CHECK constraints automatically created for all numeric columns
  - Constraint naming follows pattern: {table_name}_{column_name}_check
  - Correct count of constraints matches number of numeric columns
  - Text representation check verified in constraint definition

---

Previous: [Schema Validation](10-schema-validation.md) | Next: [Calculation Integrity](30-calculation-integrity.md)
