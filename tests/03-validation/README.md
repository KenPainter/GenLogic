# Phase 3: Validation

## What This Phase Does

Validation checks the loaded schema for logical errors before any database operations. This is the last safety check before SQL generation.

Code Location: `src/validation.ts`

Execution Flow:
```
GenLogicSchema → Validate tables → Validate columns → Validate references →
Check for cycles → Validated schema or error
```

## Inputs

- `GenLogicSchema` object from Phase 2
- No database access
- No SQL generation yet

## Outputs

Success Path:
- Validation passes (no errors)
- Proceeds to Phase 4 (Schema Features/Processing)

Error Path:
- Exit code 1
- Specific validation error message
- Process terminates before touching database

## What Tests Validate

| Test | Validates | Expected Behavior |
|------|-----------|-------------------|
| `simple-schema` | Valid basic schema passes | Should exit 0 |
| `invalid-table-name` | Invalid table names rejected | Should exit 1 with error |
| `invalid-column-name` | Invalid column names rejected | Should exit 1 with error |
| `invalid-column-reference` | Non-existent column refs rejected | Should exit 1 with error |
| `circular-foreign-keys` | Circular FK dependencies rejected | Should exit 1 with error |
| `invalid-index-columns` | Invalid index column refs rejected | Should exit 1 (INACTIVE) |
| `invalid-unique-constraint-columns` | Invalid unique constraint refs rejected | Should exit 1 (INACTIVE) |

## Code Architecture Notes

### Current Implementation

`src/validation.ts` provides a `Validator` class with methods:
- `validateSchema()` - Entry point
- `validateTableName()` - Check table name syntax
- `validateColumnName()` - Check column name syntax
- `validateColumnReferences()` - Check column refs exist
- `detectCycles()` - Check for circular dependencies

### Validation Order

1. Structure validation: Tables, columns exist
2. Name validation: Valid PostgreSQL identifiers
3. Reference validation: Referenced columns/tables exist
4. Cycle detection: No circular foreign key dependencies
5. Type validation: Column types are valid

### Critical Behavior

1. Fail fast: First error stops processing
2. Detailed errors: Error messages include table/column names
3. No database access: All validation is in-memory
4. Case sensitivity: PostgreSQL identifier rules apply

### Architectural Questions

1. Should validation continue after first error to report multiple errors?
2. Should cycle detection only flag errors or also warn about long dependency chains?
3. Should we validate automation syntax here or later?
4. Should type validation check PostgreSQL compatibility or just syntax?

## How to Read Test Results

Pass: Test catches expected validation error with correct error message
Fail: Test allows invalid schema through OR rejects valid schema OR produces wrong error

Look for:
- Validation errors not being caught
- Error messages that are vague or misleading
- Performance issues with large schemas
- Stack traces (indicates validation threw exception)

## Test Coverage Gaps

Missing validation tests:
1. Invalid automation syntax (e.g., `SUM invalid.column`)
2. Invalid generated column expressions
3. Multiple tables with same name
4. Multiple columns with same name in one table
5. Self-referential foreign keys
6. Foreign keys to non-primary key columns
7. Composite primary keys with mismatched FK columns
8. Reserved PostgreSQL keywords as identifiers
9. Very long identifier names (>63 chars)
10. seed-rows referencing non-existent columns
11. seed-rows $lookup with invalid references

Inactive tests (have files but no expect-exit):
- `invalid-index-columns` - Has schema.yaml and expected-error.txt
- `invalid-unique-constraint-columns` - Has schema.yaml and expected-error.txt

## Adding New Validation Tests

1. Create directory: `tests/03-validation/new-test-name/`
2. Add `expect-exit-1.txt` (all validation tests should expect failure)
3. Add `expect-stderr.txt` with the specific error message to match
4. Add `schema.yaml` with the invalid schema

For success tests (like simple-schema):
1. Add `expect-exit-0.txt` instead
2. Don't add expect-stderr.txt (or make it match success output)
3. Add `schema.yaml` with valid schema

## Related Documentation

- [Schema Validation Rules](../../docs/schema-syntax/)
- [PostgreSQL Naming Rules](https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS)
