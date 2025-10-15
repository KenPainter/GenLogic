# GenLogic Test Inventory

Total Tests: 43
Last Updated: 2025-10-15
Purpose: Map all tests to code execution phases for human review

## Execution Phase Model

```
1. CLI Entry → 2. Schema Loading → 3. Validation → 4. Processing → 5. Execution
```

---

## Test Categorization

### Phase 1: CLI Entry (7 tests)

Tests command-line interface before any schema processing.

| Test | Validates | Pass/Fail |
|------|-----------|-----------|
| `000-dry-run-safety` | --dry-run prevents database modification | Pass |
| `cli-options/help` | --help displays usage | Pass |
| `cli-options/version` | --version displays version | Pass |
| `cli-options/custom-host-port` | Custom host/port options work | Pass |
| `cli-options/schema-file-path` | Custom schema path option works | Pass |
| `error-handling/missing-database` | Error when --database not provided | Pass |
| `error-handling/missing-username` | Error when --user not provided | Pass |

Coverage: CLI options, required args, help text

---

### Phase 2: Schema Loading (2 tests)

Tests YAML parsing and initial schema structure validation.

| Test | Validates | Pass/Fail |
|------|-----------|-----------|
| `error-handling/invalid-yaml` | Invalid YAML syntax rejected | Pass |
| `error-handling/missing-schema-file` | Error when schema file not found | Pass |

Coverage: YAML parsing, file existence

---

### Phase 3: Validation (5 tests)

Tests pre-execution validation that catches schema errors before database operations.

| Test | Validates | Pass/Fail |
|------|-----------|-----------|
| `validation/simple-schema` | Basic valid schema passes | Pass |
| `validation/invalid-table-name` | Invalid table names rejected | Pass |
| `validation/invalid-column-name` | Invalid column names rejected | Pass |
| `validation/invalid-column-reference` | Non-existent column refs rejected | Pass |
| `validation/circular-foreign-keys` | Circular FK dependencies rejected | Pass |

Coverage: Schema structure validation, reference checking, cycle detection

---

### Phase 4: Schema Features (8 tests)

Tests individual GenLogic schema features in isolation.

| Test | Validates | Pass/Fail |
|------|-----------|-----------|
| `schema-features/column-types` | All PostgreSQL types supported | Pass |
| `schema-features/column-inheritance` | Reusable column definitions work | Pass |
| `schema-features/ref-inheritance` | $ref inheritance with overrides | Pass |
| `schema-features/foreign-keys` | Basic foreign key generation | Pass |
| `schema-features/pattern-matching-tables` | Pattern matching table creation | Pass |
| `schema-features/calculated-columns` | Generated column expressions | Fail |
| `schema-features/indexes-and-constraints` | NOT YET CREATED | - |
| `schema-features/label-and-format` | NOT YET CREATED | - |

Coverage: Core schema syntax features
Gap: indexes-and-constraints and label-and-format tests don't exist yet

---

### Phase 5: Behavior - Automations (11 tests)

Tests automation triggers and data flow behavior.

| Test | Validates | Pass/Fail |
|------|-----------|-----------|
| `behavior/automations-sum` | SUM aggregation updates correctly | Pass |
| `behavior/automations-count` | COUNT aggregation updates correctly | Pass |
| `behavior/automations-max` | MAX aggregation updates correctly | Pass |
| `behavior/automations-min` | MIN aggregation updates correctly | Pass |
| `behavior/automations-last-value` | LAST_VALUE updates correctly | Pass |
| `behavior/automations-incremental` | Incremental updates work | Pass |
| `behavior/automations-multiple` | Multiple automations on same table | Pass |
| `behavior/automations-snapshot` | SNAPSHOT automation works | Fail |
| `behavior/automations-spread` | SPREAD automation works | Pass |
| `behavior/automations-sync` | SYNC automation works | Pass |

Coverage: All automation types
Issue: automations-snapshot failing (setup-data.sql issue)

---

### Phase 5: Behavior - Calculated Columns (6 tests)

Tests generated column expressions.

| Test | Validates | Pass/Fail |
|------|-----------|-----------|
| `behavior/calculated-columns-case` | CASE expressions in generated cols | Fail |
| `behavior/calculated-columns-dependent` | Generated cols referencing other cols | Fail |
| `behavior/calculated-columns-null` | NULL handling in generated cols | Fail |
| `behavior/calculated-columns-string` | String expressions in generated cols | Fail |
| `behavior/calculated-columns-update` | Generated cols update correctly | Fail |

Coverage: Generated column behavior
Issue: All failing with "relation does not exist" - likely setup-data.sql runs before table creation

---

### Phase 5: Behavior - Foreign Keys (2 tests)

Tests foreign key behavior and constraints.

| Test | Validates | Pass/Fail |
|------|-----------|-----------|
| `behavior/foreign-keys-composite` | Composite (multi-column) FKs work | Pass |
| `behavior/foreign-keys-nullable` | Nullable foreign keys work | Pass |

Coverage: FK variations

---

### Phase 5: Behavior - Column Expansion (3 tests)

Tests safe column type widening.

| Test | Validates | Pass/Fail |
|------|-----------|-----------|
| `behavior/column-expansion-varchar` | VARCHAR size can be increased | Pass |
| `behavior/column-expansion-numeric` | NUMERIC precision can be increased | Pass |
| `behavior/column-expansion-reusable` | Expansion works with reusable cols | Pass |

Coverage: Type expansion safety

---

### Phase 5: Behavior - Pattern Matching (2 tests)

Tests pattern matching table functionality.

| Test | Validates | Pass/Fail |
|------|-----------|-----------|
| `behavior/pattern-matching-all` | Match ALL patterns correctly | Pass |
| `behavior/pattern-matching-best` | Match BEST (priority) patterns | Pass |

Coverage: Pattern matching modes

---

### Phase 5: Behavior - Seed Data (1 test)

Tests seed data insertion.

| Test | Validates | Pass/Fail |
|------|-----------|-----------|
| `behavior/content-seed-data` | seed-rows inserts correctly | Pass |

Coverage: Basic seed data

---

## Summary Statistics

- Total Tests: 43
- Passing: 36 (84%)
- Failing: 7 (16%)
- Missing: 2 (indexes-and-constraints, label-and-format)

### By Phase

| Phase | Tests | Pass | Fail |
|-------|-------|------|------|
| 1. CLI Entry | 7 | 7 | 0 |
| 2. Schema Loading | 2 | 2 | 0 |
| 3. Validation | 5 | 5 | 0 |
| 4. Schema Features | 8 | 6 | 2 |
| 5. Behavior | 21 | 16 | 5 |

---

## Issues Identified

### 1. Calculated Columns Tests All Failing (6 tests)
- Pattern: All fail with "relation does not exist"
- Root Cause: setup-data.sql runs before table creation
- Impact: 6 failing tests
- Fix: Need to investigate test runner execution order

### 2. Missing Feature Tests (2 tests)
- `tests/schema-features/indexes-and-constraints/` - exists in file system
- `tests/schema-features/label-and-format/` - exists in file system
- Issue: Missing expect-exit-0.txt files, so not discovered by test runner
- Fix: Add expect files to activate these tests

### 3. Test Organization
- Current structure mixes phases (cli-options, error-handling, validation, schema-features, behavior)
- Not immediately clear which phase each test belongs to
- Would benefit from reorganization into numbered phase directories

---

## Coverage Gaps

### Features Not Tested
1. Indexes and Constraints: Tests exist but not active
2. Label and Format: Tests exist but not active
3. seed-rows with $lookup: Only basic seed data tested
4. Composite primary keys: Not explicitly tested
5. Table comments: Not tested
6. Column comments: Not tested
7. Multiple foreign keys to same table: Unclear if tested

### Validation Not Tested
1. Invalid automation syntax
2. Invalid generated column expressions
3. Conflicting unique constraints
4. Invalid seed-data $lookup references

### Error Conditions Not Tested
1. Database connection failures (covered by auth failure)
2. Permission errors
3. Invalid PostgreSQL type names
4. Schema migration conflicts (changing PK types, etc.)

---

## Recommendations for Reorganization

### Current Structure Issues
1. Phase mixing makes it hard to understand test flow
2. No README files explaining what each category tests
3. Test names don't clearly indicate what they validate

### Proposed Improvements
1. Rename test directories to follow phase model (01-cli/, 02-loading/, etc.)
2. Add README.md to each phase directory
3. Ensure test names are self-documenting
4. Fix failing calculated-columns tests
5. Activate missing schema-features tests

---

## Next Steps (For User Review)

1. Immediate: Fix 6 failing calculated-columns tests
2. Quick Win: Activate 2 missing schema-features tests
3. Reorganize: Rename test directories to follow phase model
4. Document: Add README.md to each test category
5. Coverage: Add tests for identified gaps

Question for User: Should we fix failing tests first, or reorganize the structure first?
