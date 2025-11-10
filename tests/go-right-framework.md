# GenLogic Go-Right Test Framework Design

## Core Principle

**A test is a sequence of operations in any order, any number of times.**

Each markdown file describes a complete test scenario as a series of steps:
- Build schema (YAML) → runs processor
- Run SQL → executes against database
- Assert → checks outputs/state
- Repeat in any combination

---

## Markdown Test File Format

### Simple Structure
```markdown
# Test: Progressive Schema Evolution

Tests adding tables and columns across multiple builds.

## Step 1: Initial schema

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
```

## Verify first build created table

```json
{
  "newSchema": {
    "tables.users": true
  },
  "diff": {
    "tablesToAdd.length": 1
  }
}
```

## Step 2: Add accounts table

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)

  accounts:
    columns:
      id: serial primary key
      user_id: FK users
      balance: numeric(10,2)
```

## Test foreign key works

```sql
INSERT INTO users (name) VALUES ('Alice');
INSERT INTO accounts (user_id, balance) VALUES (1, 100.00);
SELECT name, balance FROM users
  JOIN accounts ON users.id = accounts.user_id;
```

## Verify query results

```json
[
  {"name": "Alice", "balance": "100.00"}
]
```

## Verify second build only added new table

```json
{
  "diff": {
    "tablesToAdd": ["accounts"],
    "tablesToModify": []
  }
}
```

## Step 3: Run same schema - expect no changes

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)

  accounts:
    columns:
      id: serial primary key
      user_id: FK users
      balance: numeric(10,2)
```

## Verify idempotency

NOTE: this will not work because we will always have
      triggers commands.  Will probably have to detail
      which keys are empty in the diff, or maybe
      we need to add stats and what kind of statements
      were created so we see zero for everything except
      triggers

```json
{
  "sql": {
    "statements.length": 0
  }
}
```

---

## Code Block Recognition

The test runner examines **every code block** in order and determines what to do based on the language tag:

### 1. ` ```yaml ` → Build Schema
**Action**: Run GenLogic processor
- Write YAML to temp file
- Execute `processor.process(schemaPath)`
- Generate dumps: `.newSchema.json`, `.live.json`, `.diff.json`, `.sql.json`, etc.
- If not dry-run: Execute DDL against database

### 2. ` ```sql ` → Execute SQL
**Action**: Run SQL against database
- Execute statements in order
- If final statement is SELECT: capture results for next assertion
- Store last SELECT results in test context

### 3. ` ```json ` → Assert
**Action**: Verify expectations
- Could be assertions about dumps (from most recent build)
- Could be expected SQL results (from most recent SELECT)
- Could be database state queries

**Detection logic**:
- If JSON is an array of objects → Expected SQL results
- If JSON is an object with dump file keys → Dump assertions
- Both can coexist in same JSON block

---

## Test Execution Flow

```typescript
interface TestStep {
  type: 'build' | 'sql' | 'assert';
  content: string;
  lineNumber: number;
}

async function runTest(steps: TestStep[]) {
  const TEST_DATABASE = 'genlogic_tests';

  // CRITICAL: Always drop and recreate the ENTIRE test database
  // NEVER drop schemas - databases are shared across PostgreSQL
  await dropAndRecreateDatabase(TEST_DATABASE);

  const db = await connectDatabase(TEST_DATABASE);

  let lastBuildDumps = {};
  let lastSelectResults = null;

  try {
    for (const step of steps) {
      switch (step.type) {
        case 'build':
          // Process YAML - GenLogic will create tables in the database
          lastBuildDumps = await processSchema(step.content, TEST_DATABASE);
          lastSelectResults = null; // Clear SQL context
          break;

        case 'sql':
          const results = await db.query(step.content);
          // If last statement was SELECT, store results
          if (isSelect(step.content)) {
            lastSelectResults = results.rows;
          }
          break;

        case 'assert':
          const assertions = JSON.parse(step.content);

          // Check if it's SQL result assertions (array)
          if (Array.isArray(assertions)) {
            assertSQLResults(lastSelectResults, assertions);
          }
          // Check if it's dump file assertions (object)
          else {
            assertDumps(lastBuildDumps, assertions);
          }
          break;
      }
    }
  } finally {
    await db.disconnect();

    // CRITICAL: Always cleanup - drop entire test database
    await dropDatabase(TEST_DATABASE);
  }
}

/**
 * CRITICAL SAFETY FUNCTION
 *
 * NEVER drop schemas (public, etc.) - they are shared across databases.
 * ALWAYS drop the entire test database instead.
 */
async function dropAndRecreateDatabase(dbName: string) {
  // Connect to 'postgres' database to issue DROP DATABASE
  const adminDb = await connectDatabase('postgres');

  try {
    // Terminate any existing connections to test database
    await adminDb.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid()
    `, [dbName]);

    // Drop test database if exists
    await adminDb.query(`DROP DATABASE IF EXISTS ${dbName}`);

    // Create fresh test database
    await adminDb.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await adminDb.disconnect();
  }
}

async function dropDatabase(dbName: string) {
  const adminDb = await connectDatabase('postgres');

  try {
    // Terminate connections
    await adminDb.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid()
    `, [dbName]);

    // Drop database
    await adminDb.query(`DROP DATABASE IF EXISTS ${dbName}`);
  } finally {
    await adminDb.disconnect();
  }
}
```

---

## Database Safety - CRITICAL

### ⚠️ NEVER DO THIS ⚠️
```sql
-- DANGEROUS - DO NOT DO THIS
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

**Why**: The `public` schema is **shared across all databases** in PostgreSQL. Dropping it affects other databases and can cause catastrophic data loss.

### ✅ ALWAYS DO THIS ✅
```sql
-- SAFE - Drop the entire test database
DROP DATABASE IF EXISTS genlogic_tests;
CREATE DATABASE genlogic_tests;
```

**Why**: Each database has its own isolated storage. Dropping `genlogic_tests` only affects test data, never production or other databases.

### Test Database Lifecycle

**Before test suite:**
```sql
DROP DATABASE IF EXISTS genlogic_tests;
CREATE DATABASE genlogic_tests;
```

**During test (for each YAML build):**
- Connect to `genlogic_tests`
- GenLogic creates/modifies tables
- No manual schema dropping

**After test suite:**
```sql
DROP DATABASE IF EXISTS genlogic_tests;
```

---

## Assertion Contexts

### Context 1: Most Recent Build
When you see ````json` after a ````yaml`:
```json
{
  "newSchema": { ... },
  "live": { ... },
  "diff": { ... },
  "sql": { ... }
}
```

### Context 2: Most Recent SELECT
When you see ````json` after a ````sql` ending in SELECT:
```json
[
  {"id": 1, "name": "Alice"},
  {"id": 2, "name": "Bob"}
]
```

### Combined Assertions
```json
{
  "sqlResults": [
    {"balance": "100.00"}
  ],
  "diff": {
    "tablesToAdd": []
  }
}
```

---

## Multi-Build Test Example

```markdown
# Test: Schema Evolution and Idempotency

## Build 1: Create base schema

```yaml
tables:
  products:
    columns:
      id: serial primary key
      name: varchar(100)
```

## Assert initial build

```json
{
  "diff": {
    "tablesToAdd": ["products"]
  }
}
```

## Insert test data

```sql
INSERT INTO products (name) VALUES ('Widget'), ('Gadget');
SELECT COUNT(*) as count FROM products;
```

## Verify data inserted

```json
[
  {"count": "2"}
]
```

## Build 2: Add column

```yaml
tables:
  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price: numeric(10,2)
```

## Assert column added

```json
{
  "diff": {
    "tablesToAdd": [],
    "columnsToAdd": [
      {"table": "products", "column": "price"}
    ]
  }
}
```

## Verify existing data preserved

```sql
SELECT COUNT(*) as count FROM products WHERE name IN ('Widget', 'Gadget');
```

## Check data still there

```json
[
  {"count": "2"}
]
```

## Build 3: Same schema again

```yaml
tables:
  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price: numeric(10,2)
```

## Assert no changes (idempotency)

```json
{
  "sql": {
    "statements": []
  },
  "diff": {
    "tablesToAdd": [],
    "columnsToAdd": []
  }
}
```
```

---

## Assertion Types

### 1. Dump File Assertions
Check generated JSON files from most recent build:

```json
{
  "newSchema": {
    "tables.accounts.columns.balance.type": "numeric",
    "tables.accounts.columns.balance.numeric_precision": 10,
    "errors.length": 0
  },
  "live": {
    "tables.accounts": true,
    "tables.accounts.columns.balance.type": "numeric"
  },
  "diff": {
    "tablesToAdd": ["accounts"],
    "tablesToDrop": [],
    "columnsToAdd.length": 3
  },
  "sql": {
    "statements.length": 5,
    "statements[0]": "CREATE TABLE \"accounts\""
  }
}
```

**Path notation:**
- Dotted paths: `tables.accounts.pkColumn`
- Array indices: `statements[0]`
- Array lengths: `statements.length`
- Existence check: `"tables.accounts": true`

### 2. SQL Result Assertions
Check results from most recent SELECT query:

```json
[
  {"id": 1, "name": "Alice", "balance": "100.00"},
  {"id": 2, "name": "Bob", "balance": "200.00"}
]
```

**Exact match**: Deep equality of entire result set.

### 3. Partial SQL Result Assertions
Check specific aspects of results:

```json
{
  "sqlResults": {
    "rowCount": 2,
    "rows[0].name": "Alice",
    "rows[1].balance": "200.00"
  }
}
```

### 4. Database State Assertions
Query database directly to verify triggers/constraints worked:

```json
{
  "database": {
    "query": "SELECT COUNT(*) as count FROM accounts",
    "expected": [{"count": "5"}]
  }
}
```

---

## Special Test Scenarios

### Testing Constraints
```markdown
## Test NaN protection

```sql
-- Should fail due to CHECK constraint
INSERT INTO accounts (balance) VALUES ('NaN');
```

## Expect constraint violation

```json
{
  "expectError": "violates check constraint",
  "errorPattern": "accounts_balance_check"
}
```
```

### Testing Triggers
```markdown
## Test SYNC automation

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100)

  orders:
    columns:
      id: serial primary key
      customer_id: FK customers
      customer_name: SYNC @customers.name
```

## Insert data and verify SYNC

```sql
INSERT INTO customers (name) VALUES ('Alice');
INSERT INTO orders (customer_id) VALUES (1);
SELECT customer_name FROM orders WHERE id = 1;
```

## Verify SYNC pulled value

```json
[
  {"customer_name": "Alice"}
]
```

## Update parent and verify SYNC updates child

```sql
UPDATE customers SET name = 'Alice Updated' WHERE id = 1;
SELECT customer_name FROM orders WHERE id = 1;
```

## Verify child was updated by trigger

```json
[
  {"customer_name": "Alice Updated"}
]
```
```

### Testing Idempotency
```markdown
## Build 1

```yaml
tables:
  users:
    columns:
      id: serial primary key
```

## Build 2: Same schema

```yaml
tables:
  users:
    columns:
      id: serial primary key
```

## Verify no SQL generated

```json
{
  "sql": {
    "statements.length": 0
  },
  "diff": {
    "tablesToAdd": [],
    "tablesToModify": [],
    "columnsToAdd": []
  }
}
```
```

---

## Key Design Decisions

### 1. Order Matters
Test steps execute sequentially. This allows:
- Build → Assert → SQL → Assert → Build → Assert
- Progressive schema changes
- Testing evolution paths

### 2. Database Drops Between Tests
Each test gets a completely fresh database. This is **intentional** because:
- Perfect isolation between tests
- No pollution from previous test
- Can run tests in any order
- Cleanup is automatic

### 3. Multiple Builds Per Test
Each YAML block in a test rebuilds from the live database state. If you want cumulative changes:
- **Option A**: Repeat full schema in each YAML block
- **Option B**: GenLogic processes diff and migrates existing tables

**Option B is the GenLogic way** - the processor detects what exists and only applies changes.

### 4. Flexible Assertion Timing
Assert whenever you want:
- After build (verify DDL generation)
- After SQL (verify results)
- After both (verify consistency)

### 5. Context is Local
Each assertion only knows about:
- The most recent build (dump files)
- The most recent SELECT (if any)
- Nothing from previous builds (unless you query the database)

---

## Error Handling

### Test Failure Scenarios

**1. Schema processing fails**
```
❌ Test Failed: 01-minimal-table.md
Line 15: Build step

Error: Schema validation failed:
  users.balance: Invalid SQL definition: bad_type
```

**2. SQL execution fails**
```
❌ Test Failed: 02-constraints.md
Line 42: SQL step

Statement:
  INSERT INTO accounts (balance) VALUES ('NaN');

Error: new row violates check constraint "accounts_balance_check"
Detail: Failing row contains (1, NaN).
```

**3. Assertion fails**
```
❌ Test Failed: 03-idempotency.md
Line 58: Assertion step

Path: sql.statements.length
Expected: 0
Actual: 3

Generated SQL:
  ALTER TABLE "users" ADD COLUMN "email" character varying(255);
```

**4. Expected error didn't occur**
```
❌ Test Failed: 04-error-expected.md
Line 35: SQL step

Expected error matching: "violates check constraint"
Actual: Statement succeeded (inserted 1 row)
```

---

## File Organization

```
tests/
  go-right/
    group1/
      01-minimal-table.md
      02-serial-primary-key.md
      03-idempotency.md
    group2/
      01-simple-fk.md
      02-multi-level-hierarchy.md
      03-fk-delete-cascade.md
    group3/
      01-sync-automation.md
      02-snapshot-automation.md
    ...
  go-right-out/        # Dump files
  go-right.test.ts     # Test runner
  go-right-helpers.ts  # Assertion helpers
```

---

## Implementation Phases

### Phase 1: Minimal Runner
- Parse markdown (extract YAML, SQL, JSON blocks)
- Database setup/teardown (DROP/CREATE database)
- Run processor in live mode (not dry-run)
- Basic dump file assertions

### Phase 2: SQL Execution & Results
- Execute SQL blocks
- Capture SELECT results
- Match against expected results arrays

### Phase 3: Advanced Assertions
- JSON path navigation
- Partial result matching
- Database state queries

### Phase 4: Error Expectations
- `expectError` assertion type
- Pattern matching on errors
- Verify constraints/triggers reject bad data

### Phase 5: Parallel Execution
- Multiple test databases
- Run groups in parallel
- Faster CI

---

## Environment Variables

```bash
# Database connection
PGHOST=localhost
PGUSER=postgres
PGPASSWORD=secret

# Test behavior
GENLOGIC_KEEP_TEST_DB=1    # Don't drop database after tests (for debugging)
GENLOGIC_TEST_DB=genlogic_tests  # Override test database name
GENLOGIC_VERBOSE=1         # Show processor output during tests
```

---

## Safety Checklist

Before running tests:

- [ ] Tests connect to `genlogic_tests` database (NEVER production)
- [ ] Tests DROP DATABASE, not DROP SCHEMA
- [ ] Tests have proper cleanup in finally blocks
- [ ] Connection pooling disabled (each test gets fresh connection)
- [ ] Test database name is clearly marked as test-only

Before merging test code:

- [ ] No hardcoded passwords
- [ ] No connections to production databases
- [ ] All database operations wrapped in try/finally
- [ ] Database drops use parameterized queries (prevent SQL injection)

---

## Safety Improvement: Database Name Protection

### Problem
If someone has a personal database named `genlogic_tests` and runs the test suite, it will be **destroyed without warning**.

### Proposed Solutions

**Option 1: Require database does not exist**
```typescript
async function ensureSafeTestDatabase(dbName: string) {
  const adminDb = await connectDatabase('postgres');

  try {
    // Check if database exists
    const result = await adminDb.query(`
      SELECT 1 FROM pg_database WHERE datname = $1
    `, [dbName]);

    if (result.rows.length > 0) {
      throw new Error(
        `SAFETY ERROR: Database '${dbName}' already exists!\n` +
        `The test suite will DROP this database.\n` +
        `If this is your personal database, please:\n` +
        `  1. Rename your database, OR\n` +
        `  2. Set GENLOGIC_TEST_DB to a different name\n\n` +
        `To proceed anyway: GENLOGIC_FORCE_TEST_DB=1`
      );
    }
  } finally {
    await adminDb.disconnect();
  }
}
```

**Option 2: Configurable test database name**
```bash
# Default: genlogic_tests
# Override with environment variable
export GENLOGIC_TEST_DB=my_custom_test_db_12345

# Force mode (skip existence check)
export GENLOGIC_FORCE_TEST_DB=1
```

**Option 3: Random suffix on database name**
```typescript
const TEST_DB_BASE = 'genlogic_tests';
const TEST_DB_SUFFIX = Math.random().toString(36).substring(7);
const TEST_DATABASE = `${TEST_DB_BASE}_${TEST_DB_SUFFIX}`;

// Creates: genlogic_tests_a7x9k2
// Always unique, always safe
```

### Recommendation
Implement **Option 1 + Option 2**:
1. Default to `genlogic_tests`
2. Check if database exists before starting
3. Error with helpful message if it exists
4. Allow override via `GENLOGIC_TEST_DB` environment variable
5. Allow force mode via `GENLOGIC_FORCE_TEST_DB=1` (for CI environments)

This provides safety while maintaining flexibility.

---

## Summary

The go-right test framework:
- ✅ Uses markdown for readable test scenarios
- ✅ Supports any sequence of builds/SQL/assertions
- ✅ Tests real database behavior (triggers, constraints, automations)
- ✅ Locks down implementation details (JSON dumps)
- ✅ Safe database isolation (separate test database)
- ✅ Automatic cleanup
- ✅ Clear error reporting
- ✅ Extensible for future needs
