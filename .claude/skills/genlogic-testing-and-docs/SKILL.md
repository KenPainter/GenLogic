---
name: genlogic-testing-and-docs
description: GenLogic testing patterns, test structure, database setup, and documentation standards. Use this when working on tests, running tests, or documenting GenLogic code.
---

# GenLogic Testing & Documentation Standards

## Database Driver: PostgreSQL with 'pg' Package

**CRITICAL**: GenLogic uses the standard npm `pg` package, NOT Bun's built-in SQL driver.

### pg API Reference

```typescript
import pkg from 'pg';
const { Pool } = pkg;
import type { Pool as PgPool } from 'pg';

// Create pool
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'dbname',
  user: 'username',
  password: 'password'
});

// Query without parameters
const result = await pool.query('SELECT * FROM users');
console.log(result.rows); // Array of row objects

// Query with parameters (use $1, $2, etc.)
const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
console.log(result.rows[0]);

// Transactions
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('INSERT INTO ...');
  await client.query('UPDATE ...');
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}

// Close pool
await pool.end();
```

**Key differences from Bun SQL:**
- Use `pool.query()` not tagged template literals
- Results are in `result.rows` not just `result`
- Parameterized queries use `$1, $2` syntax with array of values
- Transactions require explicit BEGIN/COMMIT/ROLLBACK

## Test Structure

### Test Organization

```
tests/
  01-cli/              # CLI interface tests
  02-schema-validation/    # Schema validation tests
  03-database-connection/  # Database connection tests
  04-validation/       # Schema validation rules
  05-schema-features/  # DDL generation features
  06-behavior/         # Runtime behavior (triggers, automations)
  run-cli-tests.ts     # Test runner
  TEST-COVERAGE.md     # Authoritative test registry
```

### Test Directory Structure

Each test is a directory containing:

```
test-name/
  schema.yaml              # Input schema (required)
  expect-exit-0.txt        # Success marker (required, mutually exclusive with exit-1)
  expect-exit-1.txt        # Failure marker (required, mutually exclusive with exit-0)
  expect-stdout.txt        # Expected stdout patterns (optional)
  expect-stderr.txt        # Expected stderr patterns (optional)
  verify-*.sql             # SQL queries to verify database state (optional)
  expect-*.txt             # Expected output for corresponding verify-*.sql (required if verify-*.sql exists)
  setup-data.sql           # SQL to run before verify queries (optional)
  args.txt                 # Extra CLI arguments (optional)
```

### Pattern Matching in expect-*.txt

```
# Lines starting with # are comments (ignored)

# Literal substring matching
This exact text must appear

# Regex matching (wrap in forward slashes)
/Table ".*" created/

# Multiple patterns (each on its own line)
First pattern
Second pattern
/Regex pattern/
```

### Running Tests

```bash
# Set password (required)
export GENLOGIC_TEST_PASSWORD=password123

# Run all tests
bun tests/run-cli-tests.ts

# Run specific suite
bun tests/run-cli-tests.ts 01-cli
bun tests/run-cli-tests.ts 05-schema-features

# Run single test by partial name
bun tests/run-cli-tests.ts automations-sum
```

### Test Database Setup

```bash
# Create test database
createdb genlogic_test_cli

# With specific user
createdb -U postgres genlogic_test_cli

# Using psql
psql -U postgres -c "CREATE DATABASE genlogic_test_cli;"
```

### Test Runner Behavior

**CRITICAL SAFETY**: Test 000-dry-run-safety must pass first. If it fails, ALL tests abort immediately.

The test runner:
1. Discovers tests by scanning for `expect-exit-0.txt` or `expect-exit-1.txt`
2. Cleans database before each test (`DROP SCHEMA public CASCADE; CREATE SCHEMA public`)
3. Runs CLI with test's schema.yaml and args
4. Verifies exit code, stdout, stderr patterns
5. Runs setup-data.sql if present
6. Runs all verify-*.sql queries and compares output

## Test-Driven Development Workflow

### Adding a New Feature

1. **Register** - Add feature to TEST-COVERAGE.md under appropriate section
2. **Design test** - Create test directory with schema.yaml and expected outputs
3. **Run test** - Verify test fails (red)
4. **Implement** - Write code to make test pass
5. **Verify** - Run test, verify it passes (green)
6. **Document** - Update code comments and link test in TEST-COVERAGE.md
7. **Mark complete** - Change status from `[ ]` to `[x]` in TEST-COVERAGE.md

### Fixing a Bug

1. **Register** - Add bug scenario to TEST-COVERAGE.md if not already covered
2. **Reproduce** - Create failing test that demonstrates the bug
3. **Run test** - Verify test fails (red)
4. **Fix** - Repair the code
5. **Verify** - Run test, verify it passes (green)
6. **Mark complete** - Update status in TEST-COVERAGE.md

### Refactoring

1. **Verify coverage** - All affected behaviors must have passing tests
2. **Refactor** - Change code structure without changing behavior
3. **Verify tests** - All tests must still pass
4. **No test updates** - If tests need changes, it's not a refactor (it's a behavior change)

## Documentation Standards

### Code Comments

```typescript
/**
 * Brief one-line description
 *
 * GENLOGIC APPROACH: Explain the architectural pattern or philosophy
 *
 * Detailed explanation of what this does and why
 */
```

### Inline Documentation

- Explain **why**, not what
- Document invariants and assumptions
- Call out GenLogic-specific patterns
- Reference test files when behavior is complex

### TEST-COVERAGE.md

**Single source of truth** for all features and test status.

Format:
```markdown
- [x] [Feature name](./path/to/test) - Brief description
- [!] [Feature name](./path/to/test) - Description (FAILING)
- [ ] Feature name - Not yet implemented
```

Linking rules:
- Link to test directory, not individual files
- Use relative paths from tests/ directory
- Mark failing tests with [!]
- Include brief description of what test verifies

## Feature Freeze Protocol

**Current Status**: FEATURE FREEZE - Stability and reliability phase

During feature freeze:
- ✅ Fix bugs
- ✅ Improve reliability
- ✅ Refactor for clarity
- ✅ Add defensive validation
- ✅ Improve infrastructure (database driver swap)
- ❌ Add new features
- ❌ Change user-facing behavior

Infrastructure improvements that increase AI-assisted development reliability are allowed and encouraged.

## AI Assistant Reminders

When working with GenLogic:

1. **Use pg package**: `pool.query('SELECT ...', [params])` not Bun SQL tagged templates
2. **Check result.rows**: Results are in `result.rows` array
3. **Run tests**: Always run relevant tests after code changes
4. **Update TEST-COVERAGE.md**: Register new tests immediately
5. **Feature freeze**: No new features, only fixes and refactoring
6. **Safety first**: Test 000-dry-run-safety guards against database corruption

## Common Test Patterns

### Testing Schema Generation

```yaml
# schema.yaml
tables:
  users:
    columns:
      user_id: serial primary key
      name: varchar(100)
```

```sql
-- verify-table-created.sql
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'users';
```

```json
// expect-table-created.txt
[{"table_name":"users"}]
```

### Testing Triggers and Automations

```yaml
# Use setup-data.sql to insert test data
# Use verify-*.sql to check automation results
```

```sql
-- setup-data.sql
INSERT INTO parent_table (name) VALUES ('Test');

-- verify-automation.sql
SELECT * FROM calculated_column ORDER BY id;
```

### Testing Error Cases

Create `expect-exit-1.txt` and `expect-stderr.txt`:

```
# expect-stderr.txt
/ERROR.*constraint violation/
```

## Quality Standards

### Every feature must have:
- [ ] Test in appropriate category
- [ ] Entry in TEST-COVERAGE.md
- [ ] Code comments explaining approach
- [ ] Passing status in test suite

### Every bug fix must have:
- [ ] Reproducing test case
- [ ] Test passes after fix
- [ ] Updated TEST-COVERAGE.md if new test added

### Every refactoring must:
- [ ] Keep all tests passing
- [ ] Not require test changes (if tests change, it's not a refactor)
