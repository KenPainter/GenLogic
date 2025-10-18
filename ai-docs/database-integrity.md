# Database Integrity

GenLogic builds Postgres database using standard integrity
mechanisms like primary keys and foreign keys.

However, because GenLogic expands on what is normally found
in a database, GenLogic itself must provide additional
mechanisms to gaurantee the integrity of the values we
are responsible for.

A user must be able to rely on the integrity of all of
our additional features with the same confidence that they
rely on the most basic Postgres features like primary
key and unique key enforcement.

## Additive Changes Only

Our system of additive changes only (documented elsewhere) ensures
that GenLogic can not, in any code path, destroy data.  


## Non-subvertible Calculated Columns

It must not be possible for a client to corrupt calculated
values (automated and generated) by directly inserting or
updating those values.  Calculated values must alway reflect
the formulas that define them.

Protection is enforced through a combination of database permissions
and trigger guards. This requires GenLogic to run as a privileged
setup user with CREATEROLE privilege. See [database-connections.md](database-connections.md)
for the two-user model.

INSERT operations: BEFORE INSERT triggers reset all automated columns
to NULL, preventing external insertion of calculated values. See
[trigger-generator.ts](../src/trigger-generator.ts) method
`generateAutomatedColumnProtection`.

UPDATE operations: Column-level UPDATE permissions are revoked for
automated columns. Users cannot execute UPDATE statements that modify
these columns. See [permissions-generator.ts](../src/permissions-generator.ts)
method `generateColumnPermissions`.

GenLogic's own triggers execute as SECURITY DEFINER with elevated
privileges, allowing automation to update protected columns. The
privileged role is named `<database_name>_genlogic_admin` to prevent
cross-database spillover. See [trigger-generator.ts](../src/trigger-generator.ts)
for SECURITY DEFINER implementation.

Automated columns are identified by presence of `automation` or
`generated` properties in the processed schema. See
[trigger-generator.ts](../src/trigger-generator.ts) method
`getAutomatedColumns`.

## Input Data Integrity

Client applications can innocently send garbage data that corrupts calculated values. Even with perfect protection of automated columns, bad INPUT values corrupt the calculations that depend on them.

### Critical: Numeric Pollution

**NaN Propagation** - PostgreSQL numeric type accepts NaN (Not a Number). One NaN value permanently poisons all calculations:
```sql
INSERT INTO transactions (amount) VALUES ('NaN'::numeric);
-- Result: SUM(NaN, 100, 200) = NaN
-- Parent account balance becomes NaN forever
```
NaN spreads virally: any arithmetic operation with NaN produces NaN. This corrupts SUM, MAX, MIN, and generated column calculations permanently.

**Infinity Pollution** - PostgreSQL numeric accepts Infinity and -Infinity:
```sql
INSERT INTO transactions (amount) VALUES ('Infinity'::numeric);
-- Result: SUM becomes Infinity, all meaningful values lost
```
Infinity corrupts aggregations the same way as NaN.

**Protection Implemented**: GenLogic automatically adds CHECK constraints to ALL floating-point numeric columns:
```sql
CHECK (column_name IS NULL OR (column_name = column_name AND abs(column_name) < 'Infinity'::numeric))
```
This constraint blocks NaN (because NaN != NaN) and blocks Infinity/- Infinity (because their absolute value is not less than Infinity).

### Critical: SPREAD Operation Bombs

**Extreme Date Ranges** - SPREAD generates one row per interval between dates:
```sql
INSERT INTO template (start_date, end_date, interval)
VALUES ('2000-01-01', '9999-12-31', '1 day');
-- Attempts to generate 2.9 MILLION rows
-- Result: Database lockup, out of memory
```

**Negative or Zero Intervals** - SPREAD uses WHILE loop:
```sql
INSERT INTO template (interval) VALUES ('-1 day');
-- Result: WHILE v_current_date <= end_date loops forever
-- Trigger hangs, blocks all writes to table
```

**NULL Intervals**:
```sql
INSERT INTO template (interval) VALUES (NULL);
-- Result: v_current_date := v_current_date + NULL → NULL
-- NULL + interval = NULL forever, infinite loop
```

**Protection Required**:
- Validate end_date > start_date
- Validate interval > 0
- Reject NULL in interval
- Consider maximum row generation limit (e.g. 10,000 rows)

### High Risk: NULL Propagation

**NULL in Aggregations** - NULL foreign keys cause data to disappear:
```sql
-- Parent has: SUM @transactions.amount
INSERT INTO transactions (account_id, amount) VALUES (NULL, 100.00);
-- Result: WHERE account_id = NULL never matches
-- $100 disappears, not counted in any parent
```

**NULL in Generated Column Arithmetic**:
```sql
-- Generated column: @debits - @credits
INSERT INTO ledger (debits, credits) VALUES (100, NULL);
-- Result: 100 - NULL = NULL (entire balance nullified)
```

**NULL in String Concatenation**:
```sql
-- Generated column: @first_name || ' ' || @last_name
INSERT INTO users (first_name, last_name) VALUES ('John', NULL);
-- Result: 'John' || ' ' || NULL = NULL (entire name nullified)
```

**Protection Strategies**:
- Use COALESCE in generated columns: `COALESCE(@debits, 0) - COALESCE(@credits, 0)`
- Use COALESCE in string concat: `@first_name || ' ' || COALESCE(@last_name, '')`
- Consider NOT NULL constraints on columns used in calculations
- Document that NULL FKs are excluded from aggregations (this is PostgreSQL behavior)

### Medium Risk: Division by Zero

**Generated Column Division**:
```sql
-- Generated column: @total / @count
INSERT INTO stats (total, count) VALUES (100, 0);
-- Result: ERROR - division by zero, INSERT fails
```

**Protection Required**: Use NULLIF to protect divisions:
```sql
generated: "@total / NULLIF(@count, 0)"
-- Returns NULL instead of error when count = 0
```

### Medium Risk: Date/Time Edge Cases

**Timezone DST Transitions**:
- Spring forward: 2:30 AM doesn't exist
- Fall back: 2:30 AM exists twice
- Result: SPREAD operations may generate duplicate or missing rows

**Invalid Date Ranges** (end before start):
```sql
INSERT INTO template (start_date, end_date)
VALUES ('2024-12-31', '2024-01-01');
-- Result: SPREAD generates zero rows (WHILE never executes)
```

**Protection**: Validate start_date < end_date for SPREAD operations.

### Low Risk: String Corruption

**Truncation in Generated Columns**:
```sql
-- Generated column: @first_name || ' ' || @last_name
-- Column is varchar(50)
INSERT INTO users (first_name, last_name)
VALUES ('Wolfeschlegelsteinhausen...', 'Wolfeschlegelsteinhausen...');
-- Result: Generated value truncated or error (depends on SQL mode)
```

**Control Characters / Invalid UTF-8**:
```sql
INSERT INTO products (name) VALUES (E'\x00\x01\x02');
-- Result: Name contains unprintable characters
-- Breaks JSON serialization, corrupts concatenated generated columns
```

**Protection**: Application-level validation of string content and length.

### Low Risk: Numeric Overflow

**Precision Limits**:
```sql
-- Column: numeric(10,2) with SUM automation
-- Repeatedly insert 999999999999999
-- Result: Sum exceeds precision, overflow error or wraparound
```

**Protection**: Choose appropriate precision for numeric columns. Consider unbounded numeric type for aggregations.

## Implementation Status

**Currently Implemented**:
- Automated columns protected from direct modification (BEFORE INSERT/UPDATE triggers)
- Column-level permissions prevent UPDATE of automated columns
- Aggregation columns initialized to 0 (not NULL) on INSERT
- NaN/Infinity CHECK constraints on all floating-point numeric columns (automatic)

**Not Yet Implemented** (future work):
- SPREAD operation limits (max rows, validate intervals)
- Division by zero protection in generated column expressions
- NULL-safe operations in generated column expressions (COALESCE)
- Date range validation for SPREAD operations

These protections should be added at schema validation time or as automatic CHECK constraints/trigger guards.

