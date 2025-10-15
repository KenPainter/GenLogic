# GenLogic Test Coverage

Authoritative Source: This document is the single source of truth for GenLogic test coverage.

This document catalogs all testable behavior in GenLogic. It serves as:
- At-a-glance reference - Overview of tested and missing features
- Coverage tracker - Live status of all tests with links to test directories
- Feature registry - All features must be registered here before implementation
- Release readiness - View of what must be completed before release

## Test-Driven Development Workflow

GenLogic follows strict test-first development. All features and bug fixes follow this workflow:

### Adding a New Feature
1. Register - Add feature to this document under appropriate phase/section
2. Design test - Create test directory with `schema.yaml` and expected outputs
3. Run test - Verify test fails (red)
4. Implement - Write code to make test pass
5. Verify - Run test, verify it passes (green)
6. Document - Update code comments and link test in this document
7. Mark complete - Change status from [ ] to [x] in this document

### Fixing a Bug
1. Register - Add bug scenario to this document if not already covered
2. Reproduce - Create failing test that demonstrates the bug
3. Run test - Verify test fails (red)
4. Fix - Repair the code
5. Verify - Run test, verify it passes (green)
6. Mark complete - Update status in this document

### Refactoring
1. Verify coverage - All affected behaviors must have passing tests
2. Refactor - Change code structure without changing behavior
3. Verify tests - All tests must still pass
4. No test updates - If tests need changes, it's not a refactor (it's a behavior change)

## Why This Document Exists

The Two Sources of Truth Problem:
Having documentation separate from tests can lead to drift - the docs say one thing, the tests do another. However, this document serves a different purpose than the tests themselves:

- Tests are truth - Self-contained, executable specifications
- This document is a map - At-a-glance overview and navigation

How We Avoid Drift:
1. Direct links - Every test is linked, so documentation and implementation are connected
2. Status tracking - Checkboxes show real-time test status
3. Mandatory updates - Adding/changing tests requires updating this document
4. Dead link detection - Broken links immediately reveal drift

The Value:
- Browse all features without exploring 100+ directories
- See coverage gaps at a glance
- Understand validation architecture (third-party JSON Schema [3] vs internal validators)
- Plan work with priority levels (P0, P1, P2, P3)
- Track release readiness

## Linking Tests

Each item in this document should link to its test directory when the test exists:

Format: `- [x] [Feature name](./path/to/test) - Brief description`

Examples:
- [x] [SUM automation](./06-behavior/automations-sum) - Sum aggregation with INSERT/UPDATE/DELETE
- [!] [Calculated columns](./05-schema-features/calculated-columns) - Basic calculated columns (FAILING)
- [ ] SUM with NULL values - Not yet implemented

This creates a direct link between the coverage document and the actual tests, eliminating scattered information.

## Test Status Notation

- `[x]` - Test exists and passes
- `[!]` - Test exists but fails
- `[~]` - Test exists but inactive/disabled
- `[3]` - Validated by third party tool (JSON Schema validator with AJV)
- `[ ]` - Test does not exist yet

## Organization Principle

Tests are organized by phase of execution, mirroring the GenLogic pipeline:
1. Phase 01: CLI - Command-line interface and argument parsing
2. Phase 02: Database Connection - Connect and verify database access
3. Phase 03: Schema Loading - YAML parsing and schema structure
4. Phase 04: Validation - Error detection before database operations
5. Phase 05: Schema Features - Individual features in isolation
6. Phase 06: Behavior - End-to-end data flow and trigger behavior

Test Discovery:
Tests are discovered dynamically by the test runner. Any directory containing `expect-exit-0.txt` or `expect-exit-1.txt` is automatically recognized as a test. This document is the source of truth for planning and tracking coverage. The filesystem is the source of truth for what tests are executed.

Each test directory contains:
- `schema.yaml` - The schema to test
- `expect-exit-N.txt` - Expected exit code (0 or 1)
- `expect-stderr.txt` - Expected error message (for failures)
- `setup-data.sql` - Test data insertion (Phase 5 only)
- `verify-*.sql` - Queries to verify behavior
- `expect-*.txt` - Expected query results (JSON format)

## Coverage Status

### Phase 01: CLI (Command-Line Interface)

Scope: This phase tests only cli.ts behavior - argument parsing, validation of 
required options, and error messages. 

- [x] [--help flag](./01-cli/help) - Displays usage information and exits 0
- [x] [--version flag](./01-cli/version) - Displays version in semver format and exits 0
- [x] [Missing --database](./01-cli/missing-database) - Error: "Database name is required"
- [x] [Missing --user](./01-cli/missing-username) - Error: "Username is required"
- [x] [Missing --password](./01-cli/missing-password) - Error: "Password is required"
- [x] [Missing --schema](./01-cli/missing-schema) - Error: "Schema file path is required"
- [x] [--dry-run flag](./01-cli/000-dry-run-safety) - Flag passes through correctly, no DB changes made
- [x] [Custom --host and --port](./01-cli/custom-host-port) - Non-default host/port values accepted
- [x] [Custom schema path](./01-cli/schema-file-path) - Schema loaded from custom path
- [x] [Non-existent schema file](./01-cli/nonexistent-schema-file) - Error: "no such file or directory"

### Phase 02: Schema Validation

Scope: This phase tests YAML parsing and JSON Schema validation. Validates that our
genlogic-schema.json correctly defines the schema structure and rejects invalid input.
**NO DATABASE CONNECTION** - these tests run before connecting to the database.

- [x] [Valid minimal schema](./02-schema-validation/valid-minimal-schema) - Basic valid schema accepted
- [x] [Invalid YAML syntax](./02-schema-validation/invalid-yaml) - Malformed YAML rejected
- [3] [Unknown top-level key](./02-schema-validation/unknown-top-level-key) - JSON Schema rejects invalid properties
- [3] [Invalid table name pattern](./02-schema-validation/invalid-table-name-pattern) - Table name must match pattern
- [3] [Invalid column name pattern](./02-schema-validation/invalid-column-name-pattern) - Column name must match pattern
- [3] [Table name exceeds 63 chars](./02-schema-validation/table-name-exceeds-63-chars) - PostgreSQL identifier length limit
- [3] [Column name exceeds 63 chars](./02-schema-validation/column-name-exceeds-63-chars) - PostgreSQL identifier length limit
- [3] [Reusable column name exceeds 63 chars](./02-schema-validation/reusable-column-name-exceeds-63-chars) - PostgreSQL identifier length limit
- [3] [Invalid automation format](./02-schema-validation/invalid-automation-format) - Automation must match pattern
- [3] [Missing required field](./02-schema-validation/missing-required-field-matching-table) - matching_table requires result_column_name

### Phase 03: Database Connection

Scope: This phase tests database connectivity before any schema processing. Test a
sucessful connection and have a couple of tests to confirm user will get the
error if connection fails.

- [x] [Successful connection](./03-database-connection/successful-connection) - Database connects and disconnects cleanly
- [x] [Authentication failure](./03-database-connection/authentication-failure) - Wrong password error reported
- [x] [Database doesn't exist](./03-database-connection/database-does-not-exist) - Non-existent database error reported



### Phase 04: Validation

Scope: This phase tests validation logic that runs after schema parsing but before database operations.

Validation itself happens at various stages during the topological processing of tables
and columns.  There is no specific validation stage in the code.

#### 4.1 Basic Schema Validation
- [x] [Simple valid schema](./04-validation/simple-schema) - Valid basic schema passes validation
- [x] [Invalid table names](./04-validation/invalid-table-name) - Malformed table names rejected
- [x] [Invalid column names](./04-validation/invalid-column-name) - Malformed column names rejected
- [x] [Invalid column references](./04-validation/invalid-column-reference) - Non-existent column references in automations

#### 4.2 Reserved Words Validation
- [x] [Table name reserved word](./04-validation/table-name-reserved-word) - PostgreSQL reserved words rejected in table names
- [x] [Column name reserved word](./04-validation/column-name-reserved-word) - PostgreSQL reserved words rejected in column names

#### 4.3 Foreign Key Validation
- [x] [Circular FK dependencies](./04-validation/circular-foreign-keys) - Cycle detection in foreign key graph
- [x] [FK to non-existent table](./04-validation/fk-to-nonexistent-table) - Error when FK references non-existent table
- [x] [FK to table without primary key](./04-validation/fk-to-table-without-pk) - Error when FK references table with no PK
- [x] [Multiple FKs without explicit name](./04-validation/fk-multiple-without-name) - Error when multiple FKs create naming conflict
- [x] [Self-referential FK](./04-validation/fk-self-referential) - Self-referential FKs are valid (should pass)

#### 4.4 Generated Column Validation
- [x] [No @ references](./04-validation/generated-column-no-at-reference) - Error when generated column has no @ references
- [x] [Non-existent column reference](./04-validation/generated-column-nonexistent-ref) - Error when @column doesn't exist
- [x] [Bare column reference](./04-validation/generated-column-bare-reference) - Error when column referenced without @ sigil
- [x] [Circular dependency](./04-validation/generated-column-circular) - Error when generated columns form cycle
- [x] [No type specified](./04-validation/generated-column-no-type) - Error when generated column has no type or $ref

#### 4.5 Index and Constraint Validation
- [x] [Index on non-existent column](./04-validation/invalid-index-columns) - Error when index references non-existent column
- [x] [Unique constraint on non-existent column](./04-validation/invalid-unique-constraint-columns) - Error when unique constraint references non-existent column
- [x] [Index on generated column](./04-validation/index-on-generated-column) - Indexes on generated columns are valid (should pass)
- [x] [Unique on nullable FK](./04-validation/unique-on-nullable-fk) - Unique constraints on nullable FKs are valid (should pass)

#### 4.6 Seed Data Validation
- [x] [Non-existent column](./04-validation/seed-data-nonexistent-column) - Error when seed data references non-existent column
- [x] [$lookup to non-existent table](./04-validation/seed-data-lookup-nonexistent-table) - Error when $lookup references non-existent table
- [x] [$lookup to non-existent column](./04-validation/seed-data-lookup-nonexistent-column) - Error when $lookup where clause references non-existent column
- [x] [Missing required PK](./04-validation/seed-data-missing-pk) - Error when seed data missing required non-serial PK value

#### 4.7 Auto-Create Validation
- [x] [Spread bad start column](./04-validation/auto-create-spread-bad-start) - Error when spread.start column doesn't exist in parent
- [x] [Spread bad end column](./04-validation/auto-create-spread-bad-end) - Error when spread.end column doesn't exist in parent
- [x] [Copy_columns bad parent](./04-validation/auto-create-copy-bad-parent) - Error when copy_columns parent column doesn't exist
- [x] [Copy_columns bad child](./04-validation/auto-create-copy-bad-child) - Error when copy_columns child column doesn't exist
- [x] [Literals bad column](./04-validation/auto-create-literals-bad-column) - Error when literals references non-existent child column

#### 4.8 Pattern Matching Validation
- [3] matching_table without result_column_name (covered by JSON Schema - required field)
- [3] matching_table with invalid result_column_name pattern (covered by JSON Schema pattern)

### Phase 05: Schema Features (Isolated Feature Tests)

Tested:
- [x] Column types (all PostgreSQL types)
- [x] Column inheritance (null, string, $ref)
- [x] Ref inheritance (with overrides)
- [x] Foreign keys (basic generation)
- [x] Pattern matching tables
- [!] Calculated columns (failing - table creation issue)
- [~] Indexes (inactive)
- [~] Label and format (inactive)

Missing Feature Tests:

#### 6.1 Column Types (expand existing test)
- [ ] SERIAL, BIGSERIAL, SMALLSERIAL
- [ ] INTEGER, BIGINT, SMALLINT
- [ ] NUMERIC(p,s), DECIMAL(p,s)
- [ ] REAL, DOUBLE PRECISION
- [ ] VARCHAR(n), CHAR(n), TEXT
- [ ] DATE, TIME, TIMESTAMP, TIMESTAMPTZ
- [ ] BOOLEAN
- [ ] UUID
- [ ] BIT(n), BIT VARYING(n)
- [ ] JSON, JSONB
- [ ] ARRAY types
- [ ] Custom types (ENUM)

#### 6.2 Column Modifiers
- [ ] PRIMARY KEY
- [ ] UNIQUE
- [ ] NOT NULL
- [ ] DEFAULT values
- [ ] DEFAULT with expressions (CURRENT_TIMESTAMP)
- [ ] CHECK constraints

#### 6.3 Foreign Key Features
- [x] Basic FK generation (tested)
- [ ] Simple FK (no prefix/suffix, single column)
- [ ] FK with prefix
- [ ] FK with suffix
- [ ] FK with prefix and suffix
- [ ] Composite FK (multi-column primary key)
- [ ] Nullable FK (not_null: false)
- [ ] Required FK (not_null: true)
- [ ] FK delete: restrict
- [ ] FK delete: cascade
- [ ] FK from child table to parent with SERIAL PK
- [ ] FK from child table to parent with composite PK

#### 6.4 Column Inheritance Patterns
- [x] Null inheritance (tested)
- [x] String inheritance (tested)
- [x] $ref inheritance (tested)
- [ ] $ref with type override
- [ ] $ref with automation override
- [ ] $ref with label/format override
- [ ] SQL type string in reusable column
- [ ] SQL type string in table column
- [ ] SQL type string with modifiers (VARCHAR(50) PRIMARY KEY)

#### 6.5 Indexes
- [~] Single column index (inactive test exists)
- [ ] Multi-column index
- [ ] Unique index
- [ ] Index on FK column (should auto-create)
- [ ] Multiple indexes on same table

#### 6.6 Unique Constraints
- [~] Single column unique (inactive test exists)
- [ ] Multi-column unique constraint
- [ ] Multiple unique constraints on same table
- [ ] Unique constraint with nullable column

#### 6.7 Metadata (label and format)
- [~] Label on column (inactive test exists)
- [~] Format on column (inactive test exists)
- [ ] Label/format inheritance from reusable column
- [ ] Label/format inheritance through FK
- [ ] Label/format override in $ref

#### 6.8 Comments
- [ ] Comment on table
- [ ] Comment on column
- [ ] Comment on foreign key

#### 6.9 Calculated Columns
- [!] Basic calculated column (test failing)
- [ ] Calculated column with arithmetic (@a + @b)
- [ ] Calculated column with string ops (@first || ' ' || @last)
- [ ] Calculated column with CASE expression
- [ ] Calculated column with NULL handling (COALESCE)
- [ ] Calculated column referencing another calculated column (dependency order)
- [ ] Calculated column with function call (UPPER(@name))

#### 6.10 Pattern Matching Tables
- [x] Pattern matching table creation (tested)
- [ ] Fixed structure (id, string_match, result_column, range_low_bound, range_high_bound)
- [ ] match_best function generation
- [ ] match_all function generation
- [ ] Custom result_column_name

### Phase 06: Behavior (End-to-End Data Flow)
Coverage: 24 behavior tests, 19 passing, 5 failing

Tested:

#### 6.1 Aggregation Automations (9 tests)
- [x] [SUM automation](./06-behavior/automations-sum) - Sum aggregation with INSERT/UPDATE/DELETE
- [x] [COUNT automation](./06-behavior/automations-count) - Row counting with FK changes
- [x] [MAX automation](./06-behavior/automations-max) - Maximum value tracking
- [x] [MIN automation](./06-behavior/automations-min) - Minimum value tracking
- [x] [LAST_VALUE automation](./06-behavior/automations-last-value) - Most recent value capture
- [x] [Incremental updates](./06-behavior/automations-incremental) - Delta mode for SUM
- [x] [Multiple automations](./06-behavior/automations-multiple) - Multiple automations on same table
- [!] [SNAPSHOT automation](./06-behavior/automations-snapshot) - Point-in-time copy (FAILING)
- [!] [SPREAD automation](./06-behavior/automations-spread) - Date range expansion (FAILING)

#### 6.2 Calculated Columns (5 tests)
- [!] All calculated column tests failing with "relation does not exist"
- [ ] CASE WHEN expressions
- [ ] Dependent calculated columns
- [ ] NULL handling
- [ ] String operations
- [ ] UPDATE triggers recalculation

#### 6.3 Foreign Keys (2 tests)
- [x] Composite FKs
- [x] Nullable FKs

#### 6.4 Column Expansion (3 tests)
- [x] VARCHAR size expansion
- [x] NUMERIC precision expansion
- [x] Expansion via reusable columns

#### 6.5 Pattern Matching (2 tests)
- [x] Pattern matching ALL mode
- [x] Pattern matching BEST mode

#### 6.6 Seed Data (1 test)
- [x] Basic seed data insertion

Missing Behavior Tests:

#### 6.7 SUM Aggregation (comprehensive)
- [x] SUM on INSERT (tested in automations-sum)
- [x] SUM on UPDATE (value change)
- [x] SUM on UPDATE (FK change to different parent)
- [x] SUM on UPDATE (FK change from NULL to value)
- [x] SUM on UPDATE (FK change from value to NULL)
- [x] SUM on DELETE
- [ ] SUM with NULL child values (should treat as 0)
- [ ] SUM with NULL parent value (should initialize to 0)
- [ ] SUM on composite FK
- [ ] SUM with multiple FKs to same parent table (explicit FK name)

#### 6.8 COUNT Aggregation
- [x] COUNT on INSERT (tested in automations-count)
- [x] COUNT on UPDATE (FK change)
- [x] COUNT on DELETE
- [ ] COUNT with NULL child values (should count regardless)
- [ ] COUNT on composite FK
- [ ] COUNT going to zero (ensure never negative)

#### 6.9 MAX Aggregation
- [x] MAX on INSERT (tested in automations-max)
- [ ] MAX on UPDATE (new max value)
- [ ] MAX on UPDATE (FK change)
- [ ] MAX on DELETE (when max row deleted, should recalculate)
- [ ] MAX with NULL child values (should ignore NULLs)
- [ ] MAX with all NULL values (should be NULL)

#### 6.10 MIN Aggregation
- [x] MIN on INSERT (tested in automations-min)
- [ ] MIN on UPDATE (new min value)
- [ ] MIN on UPDATE (FK change)
- [ ] MIN on DELETE (when min row deleted, should recalculate)
- [ ] MIN with NULL child values (should ignore NULLs)
- [ ] MIN with all NULL values (should be NULL)

#### 6.11 LAST_VALUE Automation
- [x] LAST_VALUE on INSERT (tested in automations-last-value)
- [ ] LAST_VALUE on UPDATE (value change)
- [ ] LAST_VALUE on UPDATE (FK change)
- [ ] LAST_VALUE on DELETE (should do nothing or recalculate?)
- [ ] LAST_VALUE with NULL child value

#### 6.12 SNAPSHOT Automation
- [!] SNAPSHOT on INSERT (test exists but failing)
- [ ] SNAPSHOT with NULL parent value
- [ ] SNAPSHOT doesn't update on parent UPDATE
- [ ] SNAPSHOT updates on child FK change
- [ ] SNAPSHOT with composite FK

#### 6.13 SYNC Automation
- [x] SYNC on INSERT (tested in automations-sync)
- [ ] SYNC on UPDATE (parent changes, child updates)
- [ ] SYNC on UPDATE (child FK changes, fetches from new parent)
- [ ] SYNC with NULL parent value
- [ ] SYNC with composite FK

#### 6.14 SPREAD Automation (auto_create with spread)
- [!] SPREAD on INSERT (test exists but failing)
- [ ] SPREAD generates multiple child rows based on date range
- [ ] SPREAD with interval (daily, weekly, monthly)
- [ ] SPREAD on UPDATE (dates change, regenerate children)
- [ ] SPREAD on DELETE (delete all generated children)
- [ ] SPREAD with copy_columns
- [ ] SPREAD with literals
- [ ] SPREAD with filter condition

#### 6.15 SYNC Auto-Create (auto_create without spread)
- [ ] SYNC auto_create on INSERT (create matching child row)
- [ ] SYNC auto_create on UPDATE (update matching child row)
- [ ] SYNC auto_create on DELETE (delete matching child row)
- [ ] SYNC auto_create with copy_columns
- [ ] SYNC auto_create with literals
- [ ] SYNC auto_create with filter condition

#### 6.16 FK Cascading Behaviors
- [ ] FK delete: restrict (prevents parent deletion if children exist)
- [ ] FK delete: cascade (deletes children when parent deleted)
- [ ] FK with NOT NULL (cannot set FK to NULL)
- [ ] FK without NOT NULL (can set FK to NULL)

#### 6.17 Trigger Execution Order
- [ ] BEFORE INSERT trigger execution
- [ ] AFTER INSERT trigger execution
- [ ] BEFORE UPDATE trigger execution
- [ ] AFTER UPDATE trigger execution
- [ ] BEFORE DELETE trigger execution
- [ ] Multiple triggers on same table (execution order)
- [ ] Trigger prevents infinite loops (change detection)

#### 6.18 Seed Data Advanced
- [x] seed-rows with ON CONFLICT (tested in content-seed-data)
- [ ] seed-rows with $lookup
- [ ] seed-rows with $lookup and multi-condition where
- [ ] seed-rows with nested $lookup
- [ ] seed-rows with NULL values
- [ ] seed-rows idempotency (run twice, same result)
- [ ] seed-rows with FK to parent seed row (insertion order)

#### 6.19 Complex Scenarios
- [ ] Multiple automations on same FK (SUM + COUNT + MAX on same relationship)
- [ ] Automation chains (A → B → C)
- [ ] Diamond dependencies (A → B, A → C, B → D, C → D)
- [ ] Self-referential FK with aggregation (org chart)
- [ ] Composite FK with aggregation
- [ ] NULL FK with aggregation (should handle gracefully)

#### 6.20 Pattern Matching Advanced
- [x] Pattern matching BEST mode (tested)
- [x] Pattern matching ALL mode (tested)
- [ ] Pattern matching with no matches (returns empty)
- [ ] Pattern matching with ties (same specificity)
- [ ] Pattern matching with NULL inputs
- [ ] Pattern matching with only string_match
- [ ] Pattern matching with only range bounds
- [ ] Pattern matching with both string and range
- [ ] Pattern matching priority ordering

#### 6.21 Data Type Behaviors
- [ ] SERIAL generates unique IDs
- [ ] NUMERIC precision preservation
- [ ] VARCHAR truncation prevention
- [ ] DATE/TIMESTAMP operations
- [ ] BOOLEAN TRUE/FALSE handling
- [ ] JSON/JSONB operations
- [ ] NULL vs empty string
- [ ] Zero vs NULL in numeric columns

#### 6.22 Constraint Enforcement
- [ ] PRIMARY KEY prevents duplicates
- [ ] UNIQUE constraint prevents duplicates
- [ ] NOT NULL prevents NULLs
- [ ] CHECK constraint enforcement
- [ ] FK constraint prevents orphans
- [ ] ON DELETE CASCADE behavior
- [ ] ON DELETE RESTRICT behavior

## Test Naming Convention

Tests should be named descriptively to indicate what they test:

```
tests/
  03-validation/
    {error-type}-{specific-case}/
      schema.yaml
      expect-exit-1.txt
      expect-stderr.txt

  04-schema-features/
    {feature-name}-{variation}/
      schema.yaml
      expect-exit-0.txt
      verify-schema.sql
      expect-schema.txt

  05-behavior/
    {feature-name}-{scenario}/
      schema.yaml
      expect-exit-0.txt
      setup-data.sql
      verify-{aspect}.sql
      expect-{aspect}.txt
```

Examples:
- `03-validation/invalid-table-name-with-spaces/`
- `04-schema-features/foreign-key-composite-pk/`
- `05-behavior/sum-automation-fk-change/`

## Test Creation Checklist

When adding a new test:

1. [ ] Create test directory with descriptive name
2. [ ] Add `schema.yaml` with minimal example
3. [ ] Add `expect-exit-0.txt` or `expect-exit-1.txt`
4. [ ] For failures: Add `expect-stderr.txt` with exact error message
5. [ ] For features: Add `verify-*.sql` queries
6. [ ] For features: Add `expect-*.txt` with expected results
7. [ ] For behaviors: Add `setup-data.sql` for test data
8. [ ] Verify test passes/fails as expected
9. [ ] Update this document with test location
