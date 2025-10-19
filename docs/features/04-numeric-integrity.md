Previous: [Additive Changes Only](03-additive-changes.md)

# Numeric Integrity Protection

GenLogic automatically protects all numeric columns from NaN (Not a Number) and Infinity values. These special numeric values corrupt calculations and have no place in business applications.

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
- Generated columns: @price * @quantity where price is NaN = NaN
- Arithmetic: balance - withdrawal where withdrawal is Infinity = -Infinity

This corruption is permanent - you cannot "filter out" NaN values since NaN != NaN in SQL comparisons.

## GenLogic's Solution

GenLogic automatically adds CHECK constraints to ALL floating-point numeric columns to reject NaN and Infinity:

```sql
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  balance NUMERIC(10,2)
    CHECK (balance IS NULL OR (balance = balance AND abs(balance) < 'Infinity'::numeric))
);
```

This constraint blocks:
- NaN: The check `balance = balance` fails because NaN != NaN
- Infinity: The check `abs(balance) < 'Infinity'` fails for both Infinity and -Infinity
- NULL: Explicitly allowed (NULL is different from NaN)

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
2. Generated column calculations are safe - arithmetic always produces valid results
3. Reports are trustworthy - no mysterious "NaN" values appear in financial reports
4. Data migrations are clean - no special case handling needed for corrupt data

## Implementation

Protection is automatic for all numeric columns. No schema configuration needed.

The CHECK constraint is generated in `src/sql-generator.ts` during table creation and column addition.

## Test Coverage

This feature is verified by:

- [x] [Numeric NaN/Infinity Protection](../../tests/05-schema-features/numeric-nan-infinity-protection) - Valid numbers allowed, NaN/Infinity blocked

---

Previous: [Additive Changes Only](03-additive-changes.md)
