Previous: [Documentation Navigation Links](01-navigation-links.md) | Next: [Test Coverage Matrix](03-test-coverage-matrix.md)

# GenLogic Testing Guide

This document outlines the comprehensive testing framework for GenLogic.

## Test Architecture

GenLogic uses **black box testing** - all tests interact with GenLogic exclusively through its CLI interface. Tests have zero coupling to internal code, no shared connections, no direct processor calls, and no internal API usage.

## Test Structure

Tests are organized into data-driven directories under `tests/`:

```
tests/
├── 000-dry-run-safety/          # MUST RUN FIRST - verifies --dry-run safety
├── validation/                  # Validation errors (exit 1, no DB changes)
├── cli-options/                 # CLI flag behavior tests
├── error-handling/              # Error condition tests
├── schema-features/             # Schema generation verification
└── behavior/                    # Runtime behavior tests with data
```

### Test File Structure

Each test directory contains:
- `schema.yaml` - Input schema (optional for --help, --version tests)
- `expect-exit-0.txt` or `expect-exit-1.txt` - Expected exit code marker (required)
- `expect-stdout.txt` - Patterns that must appear in stdout (optional)
- `expect-stderr.txt` - Patterns that must appear in stderr (optional)
- `verify-*.sql` - SQL queries to verify database state (optional)
- `expect-*.txt` - Expected output for corresponding verify-*.sql (optional)
- `setup-data.sql` - SQL to INSERT test data (optional, for behavior tests)
- `args.txt` - Extra CLI arguments (optional)

## Running Tests

### Prerequisites

1. **PostgreSQL database**: Tests require a test database
2. **Database creation**: Create `genlogic_test_cli` database
3. **Authentication**: Configure password OR pg_hba.conf for passwordless auth

```bash
# Create test database
createdb genlogic_test_cli

# Or using psql
psql -U postgres -c "CREATE DATABASE genlogic_test_cli;"
```

### Password Configuration

**Option 1: Password Authentication** (default)
```bash
export GENLOGIC_TEST_PASSWORD=your_password
bun tests/run-cli-tests.ts
```

**Option 2: Passwordless Authentication** (recommended for local development)

Configure PostgreSQL's `pg_hba.conf` for trust authentication:

1. Find your `pg_hba.conf` location:
```bash
sudo -u postgres psql -c "SHOW hba_file;"
```

2. Add trust authentication lines for your user (replace `ken` with your username):
```
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             ken                                     trust
host    all             ken             127.0.0.1/32            trust
```

3. Reload PostgreSQL:
```bash
sudo systemctl reload postgresql
```

4. Run tests without password:
```bash
bun tests/run-cli-tests.ts
```

### Environment Variables

- `GENLOGIC_TEST_PASSWORD` - PostgreSQL password (optional if using trust auth)
- `GENLOGIC_TEST_USER` - PostgreSQL username (default: current user)
- `GENLOGIC_TEST_DB` - Test database name (default: `genlogic_test_cli`)

## Test Execution

The test runner:
1. **Discovers tests**: Finds all directories with `expect-exit-*.txt` markers
2. **Runs Test 0 first**: `000-dry-run-safety/` - aborts if it fails
3. **For each test**:
   - Drops and recreates public schema (clean slate)
   - Runs CLI with schema and args
   - Verifies exit code matches marker file
   - Checks stdout/stderr patterns if specified
   - Runs setup-data.sql if present
   - Runs verify-*.sql queries and compares output

## Test Categories

### Test 0: Dry Run Safety (CRITICAL)
Verifies that `--dry-run` prevents database modification. If this fails, the entire test suite aborts.

**Example**: `tests/000-dry-run-safety/`

### Validation Tests
Tests that **validation fails BEFORE touching the database**. These run WITHOUT `--dry-run` and verify the database remains unchanged after validation failure.

**Examples**:
- `validation/circular-foreign-keys` - Detects FK cycles
- `validation/invalid-column-name` - Rejects invalid names
- `validation/invalid-table-name` - Rejects table names with hyphens/spaces

### CLI Options Tests
Tests for command-line flags and options.

**Examples**:
- `cli-options/help` - Tests `--help` flag
- `cli-options/version` - Tests `--version` flag
- `cli-options/custom-host-port` - Tests `-h` and `-p` flags
- `cli-options/schema-file-path` - Tests `-s` flag with custom paths

### Error Handling Tests
Tests for missing required arguments and invalid inputs.

**Examples**:
- `error-handling/missing-database` - Tests missing `-d` flag
- `error-handling/missing-username` - Tests missing `-u` flag
- `error-handling/invalid-yaml` - Tests malformed YAML

### Schema Features Tests
Tests that verify correct database objects are created.

**Examples**:
- `schema-features/foreign-keys` - Verifies FK constraints created
- `schema-features/calculated-columns` - Verifies generated columns
- `schema-features/pattern-matching-tables` - Verifies matching functions

### Behavior Tests
Tests that verify runtime behavior with actual data operations.

**Examples**:
- `behavior/calculated-columns-case` - Tests CASE expressions
- `behavior/foreign-keys-nullable` - Tests nullable FK columns
- `behavior/automations-sum` - Tests SUM automation with INSERT/UPDATE

## Writing New Tests

### 1. Create Test Directory
```bash
mkdir -p tests/category/test-name
```

### 2. Create Schema
```yaml
# tests/category/test-name/schema.yaml
tables:
  my_table:
    columns:
      id: integer primary key
      name: varchar(50)
```

### 3. Create Exit Code Marker
```bash
touch tests/category/test-name/expect-exit-0.txt  # For success
# OR
touch tests/category/test-name/expect-exit-1.txt  # For failure
```

### 4. Add Verification (Optional)

For schema verification:
```sql
-- tests/category/test-name/verify-schema.sql
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'my_table';
```

```
-- tests/category/test-name/expect-schema.txt
[{"count":"1"}]
```

For behavior verification:
```sql
-- tests/category/test-name/setup-data.sql
INSERT INTO my_table (id, name) VALUES (1, 'Alice');
```

```sql
-- tests/category/test-name/verify-behavior.sql
SELECT id, name FROM my_table ORDER BY id;
```

```
-- tests/category/test-name/expect-behavior.txt
[{"id":1,"name":"Alice"}]
```

### 5. Add Custom Arguments (Optional)
```
# tests/category/test-name/args.txt
--dry-run
# OR for complete control:
--skip-common -d testdb -u testuser -s custom.yaml
```

## Test Coverage

### ✅ Complete
- All error conditions (invalid YAML, invalid names, circular FKs, missing args)
- All CLI flags (--help, --version, -d, -u, -w, -h, -p, -s, --dry-run)
- Basic foreign keys
- Calculated columns (arithmetic, CASE expressions)
- Automations (SUM)
- Pattern matching tables
- Column inheritance

### 🔄 Partial
- Calculated columns (CASE ✅, dependent calculations ❌, NULL handling ❌, string concat ❌)
- Automations (SUM ✅, COUNT ❌, MAX ❌, MIN ❌, LAST_VALUE ❌)
- Foreign keys (basic ✅, nullable ✅, multi-column ❌)
- Pattern matching (structure ✅, match_best ❌, match_all ❌)

### ❌ Not Yet Tested
- $ref references to shared column definitions
- Sync definitions
- Content sections

## Known Limitations

1. **Bun.SQL and Trust Authentication**: Bun.SQL doesn't support PostgreSQL trust authentication. Password must be provided even when pg_hba.conf is configured for trust auth.

2. **Relative Schema Paths**: When using `-s` flag in `args.txt`, paths must be relative to project root, not test directory.

## Troubleshooting

### Tests fail with "password authentication failed"
- Set `GENLOGIC_TEST_PASSWORD` environment variable
- Or configure pg_hba.conf for trust authentication (may still require password due to Bun.SQL limitation)

### Tests fail with "database does not exist"
- Create `genlogic_test_cli` database: `createdb genlogic_test_cli`

### Test fails with "Expected exit 0, got 1"
- Run the CLI command manually to see the actual error:
  ```bash
  bun run src/cli.ts -s tests/path/to/test/schema.yaml -d genlogic_test_cli -u your_user -w your_password
  ```

### SQL verification fails with whitespace differences
- The test runner normalizes whitespace before comparison
- Ensure expected output matches JSON format: `[{"column":"value"}]`

## Development Workflow

1. **Create test**: Add directory with schema.yaml and expect-exit markers
2. **Run specific test**: Use grep to filter: `bun tests/run-cli-tests.ts 2>&1 | grep test-name`
3. **Verify behavior**: Check exit codes, stdout/stderr, and SQL query results
4. **Update checklist**: Mark items complete in `/debug/new-tests.md`

## CI/CD Integration

All tests run via a single command with no additional infrastructure:

```bash
GENLOGIC_TEST_PASSWORD=password123 bun tests/run-cli-tests.ts
```

Exit code 0 = all tests passed, non-zero = failures occurred.

---

Previous: [Documentation Navigation Links](01-navigation-links.md) | Next: [Test Coverage Matrix](03-test-coverage-matrix.md)
