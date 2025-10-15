# GenLogic Test Coverage

Authoritative Source: This document is the single source of truth for GenLogic test coverage.

This document catalogs all testable behavior in GenLogic. It serves as:
- At-a-glance reference - Overview of tested and missing features
- Coverage tracker - Live status of all tests with links to test directories
- Feature registry - All features must be registered here before implementation
- Release readiness - View of what must be completed before release

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

```bash
export GENLOGIC_TEST_PASSWORD=your_password
bun tests/run-cli-tests.ts
```

To run only one suite:

```bash
export GENLOGIC_TEST_PASSWORD=your_password
bun tests/run-cli-tests.ts 02-schema
```


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
8. Run `bun ./tests/find-mismatches.mjs` to ensure all tests are registered here

### Fixing a Bug
1. Register - Add bug scenario to this document if not already covered
2. Reproduce - Create failing test that demonstrates the bug
3. Run test - Verify test fails (red)
4. Fix - Repair the code
5. Verify - Run test, verify it passes (green)
6. Mark complete - Update status in this document
7. Run `bun ./tests/find-mismatches.mjs` to ensure all tests are registered here

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

Scope: This phase tests that schema elements (tables, columns, constraints, indexes) are created correctly in PostgreSQL. Each test verifies that GenLogic generates the correct DDL statements and that the resulting database schema matches expectations. Tests use verify-*.sql queries to inspect the actual database schema structure.

**Coverage: 56 tests implemented, all passing (100%)**

**Not implemented (5 features) - parser gaps:**
- Array types - SQL parser doesn't recognize `[]` array syntax
- BIT VARYING - SQL parser doesn't recognize `varying` modifier for BIT type
- TIME type - Parser treats `time` as reusable column reference instead of SQL type keyword
- Composite FK - JSON Schema/parser doesn't support `columns: [...]` array syntax (2 tests planned)

#### 5.1 Core Schema Elements
- [x] [Column types](./05-schema-features/column-types) - All PostgreSQL data types (serial, integer, varchar, numeric, timestamp, boolean, uuid, json, etc.)
- [x] [Column inheritance](./05-schema-features/column-inheritance) - Null inheritance from reusable columns
- [x] [Ref inheritance](./05-schema-features/ref-inheritance) - $ref inheritance with type reuse from reusable columns
- [x] [Foreign keys](./05-schema-features/foreign-keys) - Basic FK generation with constraint creation
- [x] [Indexes and constraints](./05-schema-features/indexes-and-constraints) - Single/multi-column indexes and unique constraints
- [x] [Label and format](./05-schema-features/label-and-format) - Label/format metadata propagation
- [x] [Pattern matching tables](./05-schema-features/pattern-matching-tables) - Pattern matching table structure creation
- [x] [Generated columns](./05-schema-features/calculated-columns) - Generated columns with @ reference expressions

#### 5.2 Column Types
- [x] [SERIAL, BIGSERIAL, SMALLSERIAL](./05-schema-features/column-types-serial) - Serial types create sequences
- [x] [INTEGER, BIGINT, SMALLINT](./05-schema-features/column-types-integer) - Integer types
- [x] [NUMERIC(p,s), DECIMAL(p,s)](./05-schema-features/column-types-numeric) - Fixed precision numeric types
- [x] [REAL, DOUBLE PRECISION](./05-schema-features/column-types-float) - Floating point types
- [x] [VARCHAR(n), CHAR(n), TEXT](./05-schema-features/column-types-text) - Text types
- [ ] DATE, TIME, TIMESTAMP, TIMESTAMPTZ - Not implemented: parser treats `time` as reusable column reference
- [x] [BOOLEAN](./05-schema-features/column-types-boolean) - Boolean type
- [x] [UUID](./05-schema-features/column-types-uuid) - UUID type
- [ ] BIT(n), BIT VARYING(n) - Not implemented: parser doesn't recognize `varying` modifier
- [x] [JSON, JSONB](./05-schema-features/column-types-json) - JSON types
- [ ] ARRAY types - Not implemented: parser doesn't recognize `[]` array syntax

#### 5.3 Foreign Key Features
- [x] [Simple FK](./05-schema-features/fk-simple) - No prefix/suffix, single column
- [x] [FK with prefix](./05-schema-features/fk-with-prefix) - FK column named with prefix
- [x] [FK with suffix](./05-schema-features/fk-with-suffix) - FK column named with suffix
- [x] [FK with prefix and suffix](./05-schema-features/fk-with-prefix-and-suffix) - FK column with both prefix and suffix
- [ ] Composite FK - Not implemented: JSON Schema doesn't support `columns: [col1, col2]` array syntax
- [x] [Nullable FK](./05-schema-features/fk-nullable) - FK with not_null: false
- [x] [Required FK](./05-schema-features/fk-required) - FK with not_null: true
- [x] [FK delete: restrict](./05-schema-features/fk-delete-restrict) - ON DELETE RESTRICT
- [x] [FK delete: cascade](./05-schema-features/fk-delete-cascade) - ON DELETE CASCADE
- [x] [FK to SERIAL PK](./05-schema-features/fk-to-serial) - FK from child table to parent with SERIAL PK
- [ ] FK to composite PK - Not implemented: JSON Schema doesn't support `columns: [col1, col2]` array syntax

#### 5.4 Column Inheritance Patterns
- [x] [Null inheritance](./05-schema-features/column-inheritance) - Inherit from reusable columns (already tested in 5.1)
- [x] [$ref inheritance](./05-schema-features/ref-inheritance) - $ref from reusable columns (already tested in 5.1)
- [x] [$ref with type override](./05-schema-features/ref-type-override) - Override type when using $ref
- [x] [$ref with automation override](./05-schema-features/ref-automation-override) - Override automation when using $ref
- [x] [$ref with label/format override](./05-schema-features/ref-label-format-override) - Override label/format in $ref
- [x] [SQL type string in reusable column](./05-schema-features/sql-type-string-reusable) - Reusable columns with SQL type strings
- [x] [SQL type string in table column](./05-schema-features/sql-type-string-table) - Table columns with SQL type strings
- [x] [SQL type with modifiers](./05-schema-features/sql-type-with-modifiers) - VARCHAR(50) PRIMARY KEY syntax

#### 5.5 Indexes
- [x] [Single column index](./05-schema-features/indexes-and-constraints) - Single column index (tested in 5.1)
- [x] [Multi-column index](./05-schema-features/index-multi-column) - Index on multiple columns
- [x] [Unique index](./05-schema-features/index-unique) - Unique constraint on column
- [x] [Index on FK column](./05-schema-features/index-on-fk) - FK columns auto-indexed
- [x] [Multiple indexes](./05-schema-features/indexes-multiple) - Multiple indexes on same table

#### 5.6 Unique Constraints
- [x] [Multi-column unique](./05-schema-features/indexes-and-constraints) - Multi-column unique constraint (tested in 5.1)
- [x] [Single column unique](./05-schema-features/unique-single-column) - Single column unique constraint
- [x] [Multiple unique constraints](./05-schema-features/unique-multiple-constraints) - Multiple unique constraints on same table
- [x] [Unique on nullable column](./05-schema-features/unique-on-nullable) - Unique constraint with nullable column

#### 5.7 Metadata (label and format)
- [x] [Label/format on reusable column](./05-schema-features/label-format-reusable) - Label/format inheritance from reusable column
- [x] [Label/format through FK](./05-schema-features/label-format-fk) - Label/format inheritance through FK
- [x] [Label/format override in $ref](./05-schema-features/ref-label-format-override) - Override label/format in $ref

#### 5.8 Comments
- [x] [Comment on table](./05-schema-features/comment-table) - Table-level comments
- [x] [Comment on column](./05-schema-features/comment-column) - Column-level comments
- [x] [Comment on FK](./05-schema-features/comment-fk) - Foreign key comments

#### 5.9 Generated Columns
- [x] [Basic generated column](./05-schema-features/calculated-columns) - Generated columns (tested in 5.1)
- [x] [Arithmetic expression](./05-schema-features/generated-arithmetic) - Generated column with arithmetic (@a * @b)
- [x] [String concatenation](./05-schema-features/generated-string-concat) - Generated column with string ops (@first || ' ' || @last)
- [x] [CASE expression](./05-schema-features/generated-case) - Generated column with CASE WHEN
- [x] [NULL handling](./05-schema-features/generated-null-handling) - Generated column with COALESCE
- [x] [Dependent generated columns](./05-schema-features/generated-dependent) - Generated column referencing another generated column
- [x] [Function call](./05-schema-features/generated-function-call) - Generated column with function (UPPER(@name))

#### 5.10 Pattern Matching Tables
- [x] [Pattern matching table](./05-schema-features/pattern-matching-tables) - Pattern matching table creation (tested in 5.1)
- [x] [Fixed structure](./05-schema-features/pattern-fixed-structure) - Fixed structure (id, string_match, result_column, range_low_bound, range_high_bound)
- [x] [Custom result_column_name](./05-schema-features/pattern-result-column-name) - Custom result column name
- [x] [match_best function](./05-schema-features/pattern-match-best) - match_best function generation
- [x] [match_all function](./05-schema-features/pattern-match-all) - match_all function generation

#### 5.11 Additive Changes
- [x] [New table added](./05-schema-features/additive-new-table) - New table added to existing database
- [x] [New column added](./05-schema-features/additive-new-column) - New column added to existing table
- [x] [Column widening](./05-schema-features/additive-widen-column) - Columns widened for CHAR, VARCHAR, NUMERIC

### Phase 06: Behavior (End-to-End Data Flow)

**Coverage: 23 tests implemented, all passing (100%)**

Scope: This phase tests end-to-end data flow through triggers, automations, and calculated columns. Each test verifies that GenLogic's trigger generation correctly maintains data integrity and propagates changes through the database. Tests use setup-data.sql to create initial state, then verify-*.sql queries to inspect results after trigger execution.

#### 6.1 Aggregation Automations

- [x] [SUM automation](./06-behavior/automations-sum) - Basic SUM aggregation
  - Initial SUM calculation on child INSERT
  - Parent balance correctly aggregates child amounts

- [x] [COUNT automation](./06-behavior/automations-count) - Row counting automation
  - Initial COUNT calculation on child INSERT
  - Parent counts child rows via FK relationship

- [x] [MAX automation](./06-behavior/automations-max) - Maximum value tracking
  - Initial MAX calculation on child INSERT
  - Parent tracks maximum child value

- [x] [MIN automation](./06-behavior/automations-min) - Minimum value tracking
  - Initial MIN calculation on child INSERT
  - Parent tracks minimum child value

- [x] [LAST_VALUE automation](./06-behavior/automations-last-value) - Most recent value capture
  - Initial LAST_VALUE on child INSERT
  - Parent captures last inserted child value

- [x] [Incremental SUM](./06-behavior/automations-incremental) - SUM with INSERT/UPDATE/DELETE
  - SUM recalculates on child INSERT
  - SUM recalculates on child UPDATE (value change)
  - SUM recalculates on child DELETE

- [x] [Multiple automations](./06-behavior/automations-multiple) - Multiple automations on same FK
  - SUM + COUNT + MAX all working on same parent-child relationship
  - All three automations update independently and correctly

- [x] [SNAPSHOT automation](./06-behavior/automations-snapshot) - Point-in-time value capture
  - SNAPSHOT copies parent value on child INSERT
  - SNAPSHOT does NOT update when parent value changes (frozen at insertion time)
  - Verifies immutability after parent UPDATE

- [x] [SPREAD automation](./06-behavior/automations-spread) - Date range expansion with auto_create
  - SPREAD generates multiple child rows based on date range
  - auto_create with spread.start, spread.end, spread.interval
  - Generated rows populate spread_date column correctly

- [x] [SYNC automation](./06-behavior/automations-sync) - Synchronized value tracking
  - SYNC copies parent value on child INSERT
  - SYNC updates child when parent value changes (stays in sync)
  - Verifies dynamic updates after parent UPDATE

#### 6.2 Generated Columns (Calculated Columns)

- [x] [CASE WHEN expressions](./06-behavior/calculated-columns-case) - Conditional logic in generated columns
  - CASE WHEN @amount > 0 THEN 'credit' WHEN @amount < 0 THEN 'debit' ELSE 'zero' END
  - Generated column with conditional branching based on another column

- [x] [Dependent generated columns](./06-behavior/calculated-columns-dependent) - Generated column referencing another generated column
  - subtotal = @quantity * @unit_price (first level)
  - tax = @subtotal * 0.08 (depends on subtotal)
  - total = @subtotal + @tax (depends on both)
  - Three-level chained dependency resolution

- [x] [NULL handling](./06-behavior/calculated-columns-null) - COALESCE for NULL safety
  - COALESCE(@price, 0) - COALESCE(@discount, 0)
  - Generated column handles NULL inputs without errors

- [x] [String operations](./06-behavior/calculated-columns-string) - String concatenation
  - @first_name || ' ' || @last_name
  - Generated column with string concatenation operator

- [x] [UPDATE triggers recalculation](./06-behavior/calculated-columns-update) - Generated columns recalculate on UPDATE
  - Generated column recalculates when source column (@base_price) changes
  - Verifies UPDATE trigger fires and recomputes value

#### 6.3 Foreign Keys

- [x] [Composite FKs](./06-behavior/foreign-keys-composite) - Composite primary key support
  - Multiple columns in primary key (order_id, order_year)
  - FK correctly references composite PK
  - Child table successfully links to parent via composite key

- [x] [Nullable FKs](./06-behavior/foreign-keys-nullable) - Optional foreign key relationships
  - FK column can be NULL (not_null: false)
  - No constraint violation when FK is NULL
  - Allows orphan child rows

#### 6.4 Column Expansion (Additive Schema Changes)

- [x] [VARCHAR size expansion](./06-behavior/column-expansion-varchar) - Widening VARCHAR columns
  - VARCHAR(30) expanded to VARCHAR(60)
  - Existing data preserved after expansion
  - No data loss on column widening

- [x] [NUMERIC precision expansion](./06-behavior/column-expansion-numeric) - Widening NUMERIC precision/scale
  - NUMERIC(10,2) expanded to NUMERIC(12,4)
  - Existing data preserved with original precision
  - More precision available for new values

- [x] [Expansion via reusable columns](./06-behavior/column-expansion-reusable) - Column expansion through $ref
  - Reusable column type changes propagate to all referencing tables
  - Multiple tables using same reusable column all expand together

#### 6.5 Pattern Matching

- [x] [match_best function](./06-behavior/pattern-matching-best) - Highest specificity match
  - Returns single best match based on specificity score
  - String match + range bounds contribute to scoring
  - Most specific rule wins (e.g., 'CA' + range beats 'CA' alone)

- [x] [match_all function](./06-behavior/pattern-matching-all) - All matching rules
  - Returns array of all matching rules
  - String match + range bounds for filtering
  - All applicable rules returned in result set

#### 6.6 Seed Data

- [x] [Basic seed data insertion](./06-behavior/content-seed-data) - seed-rows with static data
  - seed-rows array inserts static reference data
  - ON CONFLICT DO UPDATE for idempotency
  - Data loaded at schema creation time

---

#### Planned Behavior Tests (Not Yet Implemented):

#### 6.7 SUM Aggregation - Edge Cases
- [ ] SUM on UPDATE with FK change to different parent
- [ ] SUM on UPDATE with FK change from NULL to value
- [ ] SUM on UPDATE with FK change from value to NULL
- [ ] SUM with NULL child values (should treat as 0)
- [ ] SUM with NULL parent value (should initialize to 0)
- [ ] SUM on composite FK
- [ ] SUM with multiple FKs to same parent table (explicit FK name)

#### 6.8 COUNT Aggregation - Edge Cases
- [ ] COUNT on UPDATE with FK change
- [ ] COUNT with NULL child values (should count regardless)
- [ ] COUNT on composite FK
- [ ] COUNT going to zero (ensure never negative)

#### 6.9 MAX Aggregation - Edge Cases
- [ ] MAX on UPDATE (new max value)
- [ ] MAX on UPDATE with FK change
- [ ] MAX on DELETE (when max row deleted, should recalculate)
- [ ] MAX with NULL child values (should ignore NULLs)
- [ ] MAX with all NULL values (should be NULL)

#### 6.10 MIN Aggregation - Edge Cases
- [ ] MIN on UPDATE (new min value)
- [ ] MIN on UPDATE with FK change
- [ ] MIN on DELETE (when min row deleted, should recalculate)
- [ ] MIN with NULL child values (should ignore NULLs)
- [ ] MIN with all NULL values (should be NULL)

#### 6.11 LAST_VALUE Automation - Edge Cases
- [ ] LAST_VALUE on UPDATE (value change)
- [ ] LAST_VALUE on UPDATE with FK change
- [ ] LAST_VALUE on DELETE (should do nothing or recalculate?)
- [ ] LAST_VALUE with NULL child value

#### 6.12 SNAPSHOT Automation - Edge Cases
- [ ] SNAPSHOT with NULL parent value
- [ ] SNAPSHOT updates on child FK change (should fetch from new parent)
- [ ] SNAPSHOT with composite FK

#### 6.13 SYNC Automation - Edge Cases
- [ ] SYNC on UPDATE (child FK changes, fetches from new parent)
- [ ] SYNC with NULL parent value
- [ ] SYNC with composite FK

#### 6.14 SPREAD Automation - Edge Cases
- [ ] SPREAD with different intervals (weekly, monthly)
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
- [ ] seed-rows with $lookup
- [ ] seed-rows with $lookup and multi-condition where
- [ ] seed-rows with nested $lookup
- [ ] seed-rows with NULL values
- [ ] seed-rows idempotency (run twice, same result)
- [ ] seed-rows with FK to parent seed row (insertion order)

#### 6.19 Complex Scenarios
- [ ] Automation chains (A → B → C)
- [ ] Diamond dependencies (A → B, A → C, B → D, C → D)
- [ ] Self-referential FK with aggregation (org chart)
- [ ] Composite FK with aggregation
- [ ] NULL FK with aggregation (should handle gracefully)

#### 6.20 Pattern Matching Advanced
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

