# Phase 5: Behavior Tests

## What This Phase Does

Behavior tests validate end-to-end functionality with actual data. These tests verify that features work correctly in realistic scenarios with data insertion, updates, and deletions.

Code Location: Entire stack:
- Schema processing → SQL generation → Trigger generation → Execution → Data operations

Execution Flow:
```
Create schema → Insert seed data → Run test SQL → Verify behavior → Check database state
```

## Inputs

- Complete GenLogic schema with features (automations, FKs, etc.)
- Seed data (from seed-rows or setup-data.sql)
- Test SQL operations (INSERT/UPDATE/DELETE)

## Outputs

Success Path:
- Database behaves as expected
- Triggers fire correctly
- Aggregations update properly
- Constraints enforced correctly
- Exit code 0

Error Path:
- Unexpected behavior
- Trigger failures
- Data inconsistencies
- Exit code 1

## Test Categories

### Automations (11 tests)

Tests that database triggers correctly maintain automated columns.

| Test | Automation Type | What It Tests |
|------|----------------|---------------|
| `automations-sum` | SUM | Sum of child values maintained in parent |
| `automations-count` | COUNT | Count of child rows maintained in parent |
| `automations-max` | MAX | Maximum child value maintained in parent |
| `automations-min` | MIN | Minimum child value maintained in parent |
| `automations-last-value` | LAST_VALUE | Most recent child value copied to parent |
| `automations-incremental` | SUM (incremental) | Delta updates instead of full recalc |
| `automations-multiple` | Multiple types | Multiple automations on same table |
| `automations-snapshot` | SNAPSHOT | Point-in-time copy from parent |
| `automations-spread` | SPREAD | Distribution automation (failing) |
| `automations-sync` | SYNC | Real-time sync from parent |

Pass Rate: 9/10 passing (automations-snapshot failing)

### Calculated Columns (6 tests)

Tests PostgreSQL GENERATED AS expressions.

| Test | Expression Type | What It Tests |
|------|----------------|---------------|
| `calculated-columns-case` | CASE WHEN | Conditional expressions |
| `calculated-columns-dependent` | Column refs | Calculated cols referencing other cols |
| `calculated-columns-null` | NULL handling | NULL propagation in expressions |
| `calculated-columns-string` | String ops | String concatenation/manipulation |
| `calculated-columns-update` | Updates | Calculated cols recalc on UPDATE |

Pass Rate: 0/5 passing (all failing with "relation does not exist")

### Foreign Keys (2 tests)

Tests foreign key behavior beyond basic creation.

| Test | FK Type | What It Tests |
|------|---------|---------------|
| `foreign-keys-composite` | Multi-column | Composite FKs work correctly |
| `foreign-keys-nullable` | NULL values | Nullable FKs allow NULL |

Pass Rate: 2/2 passing

### Column Expansion (3 tests)

Tests safe column type widening in existing databases.

| Test | Expansion Type | What It Tests |
|------|---------------|---------------|
| `column-expansion-varchar` | VARCHAR(n) → VARCHAR(m) | Size increase allowed, data preserved |
| `column-expansion-numeric` | NUMERIC(p,s) → NUMERIC(p',s') | Precision increase allowed |
| `column-expansion-reusable` | Via reusable cols | Expansion works with inheritance |

Pass Rate: 3/3 passing

### Pattern Matching (2 tests)

Tests pattern matching table behavior with data.

| Test | Matching Mode | What It Tests |
|------|--------------|---------------|
| `pattern-matching-all` | ALL mode | Returns all matching patterns |
| `pattern-matching-best` | BEST mode | Returns highest priority match |

Pass Rate: 2/2 passing

### Seed Data (1 test)

Tests seed data insertion with conflict resolution.

| Test | Feature | What It Tests |
|------|---------|---------------|
| `content-seed-data` | seed-rows | Idempotent inserts, PK/unique conflict handling |

Pass Rate: 1/1 passing

## Code Architecture Notes

### Trigger Generation

Location: `src/trigger-generator.ts`

Generates consolidated triggers:
- One BEFORE trigger per table (for pullFromParents, calculatedColumns)
- One AFTER trigger per table (for syncTargets, spreadTargets, aggregations)

### Critical Behaviors

1. Incremental Updates: Aggregation triggers use OLD/NEW values for O(1) performance
2. NULL Handling: COALESCE used extensively to treat NULL as zero/empty
3. FK Changes: When FK changes, both old and new parents are updated
4. Execution Order: BEFORE triggers run before constraints, AFTER triggers run after

### Architectural Questions

1. Trigger Consolidation: Current approach merges all automation logic into 2 triggers per table. Is this better than individual triggers per automation?
2. Error Handling: What happens if trigger fails? Currently rolls back entire transaction.
3. Performance: Are there scenarios where individual triggers would be faster?
4. Debugging: How do users debug trigger behavior?

## Current Issues

### Issue 1: Calculated Columns Tests Failing (6 tests)

Symptom: All fail with "relation does not exist"
Pattern: setup-data.sql runs but table not created yet
Root Cause: Likely test execution order issue

Possible Causes:
1. Schema processing fails before table creation
2. Generated column syntax error prevents table creation
3. Test runner executes setup-data.sql at wrong time
4. Database connection issue specific to calculated columns

Next Steps:
1. Manually run one failing test to see actual error
2. Check if CREATE TABLE statement is generated
3. Check if CREATE TABLE executes
4. Verify PostgreSQL GENERATED AS syntax

### Issue 2: Missing $lookup Testing

Coverage Gap: seed-rows with $lookup not tested

What's Missing:
1. Basic $lookup foreign key resolution
2. Multi-condition $lookup (where clause with multiple columns)
3. $lookup with NULL results
4. Nested $lookup chains

Impact: Feature exists but behavior not verified

## How to Read Test Results

Pass:
- Schema created successfully
- setup-data.sql runs without error
- verify-*.sql queries return expected results
- Exit code 0

Fail:
- SQL execution error (see error message)
- Unexpected query results
- Exit code 1

Common Failure Patterns:
1. "relation does not exist" → Table creation failed
2. "trigger ... does not exist" → Trigger generation failed
3. Query result mismatch → Logic error in automation
4. "constraint violation" → Constraint incorrectly enforced

## Adding New Behavior Tests

1. Create directory: `tests/05-behavior/test-name/`
2. Add `expect-exit-0.txt`
3. Add `schema.yaml` with the feature being tested
4. Add `setup-data.sql` to insert test data (optional)
5. Add `verify-behavior.sql` to check results
6. Add `expect-behavior.txt` with expected query results

Directory Contents:
```
test-name/
├── expect-exit-0.txt          # Required: marks test as expecting success
├── schema.yaml                # Required: the schema to test
├── setup-data.sql             # Optional: INSERT test data
├── verify-behavior.sql        # Optional: Query to verify behavior
└── expect-behavior.txt        # Optional: Expected query results
```

Multiple Verifications:
You can have multiple verify-*.sql files:
- `verify-aggregation.sql` + `expect-aggregation.txt`
- `verify-triggers.sql` + `expect-triggers.txt`
- `verify-constraints.sql` + `expect-constraints.txt`

## Test Maintenance

### When Features Change

1. Run affected behavior tests
2. If behavior intentionally changed, update expect-*.txt files
3. If behavior broke, fix code
4. Never update expect files to match broken behavior

### When Adding New Features

1. Add feature test in Phase 4 (isolation)
2. Add behavior test in Phase 5 (with data)
3. Update this README with test description

## Related Documentation

- [Automation Examples](../../docs/examples/automations/)
- [Trigger Generator Design](../../docs/architecture/consolidated-triggers.md)
- [Null Handling](../../docs/architecture/null-handling.md)
