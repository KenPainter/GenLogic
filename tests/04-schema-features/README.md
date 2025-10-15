# Phase 4: Schema Features

## What This Phase Does

Schema feature tests validate individual GenLogic features in isolation. Each test focuses on one feature (column types, foreign keys, reusable columns, etc.) without complex interactions.

Code Location: Multiple files:
- `src/schema-processor.ts` - Column inheritance, FK generation
- `src/sql-generator.ts` - SQL DDL generation
- `src/sql-type-parser.ts` - Type string parsing
- `src/matching-generator.ts` - Pattern matching tables

Execution Flow:
```
Validated schema → Process inheritance → Generate FK columns → Generate SQL → Execute SQL → Verify database
```

## Inputs

- Validated `GenLogicSchema` from Phase 3
- Database connection (for execution)

## Outputs

Success Path:
- Database schema created correctly
- Tables, columns, constraints match expected structure
- Exit code 0

Error Path:
- SQL execution fails
- Database structure doesn't match expectations
- Exit code 1

## What Tests Validate

| Test | Feature | What It Tests |
|------|---------|---------------|
| `column-types` | All PostgreSQL types | All types (serial, varchar, numeric, etc.) create correctly |
| `column-inheritance` | Reusable column defs | String and null inheritance work |
| `ref-inheritance` | $ref with overrides | Inheritance with property overrides |
| `foreign-keys` | Basic FK generation | FK columns generated from parent PKs |
| `pattern-matching-tables` | Pattern matching | Special matching tables created |
| `calculated-columns` | Generated columns | GENERATED AS expressions work |
| `indexes-and-constraints` | Indexes | Index creation (INACTIVE) |
| `label-and-format` | Metadata | label/format properties (INACTIVE) |

## Code Architecture Notes

### Processing Steps

1. Schema Processing (`SchemaProcessor`):
   - Resolves column inheritance (null, string, $ref)
   - Generates FK columns from parent primary keys
   - Normalizes types

2. SQL Generation (`SQLGenerator`):
   - Converts processed schema to CREATE TABLE statements
   - Adds constraints (PK, FK, UNIQUE)
   - Handles defaults and sequences

3. Execution (`DatabaseManager`):
   - Runs SQL statements in correct order
   - Creates triggers (if automations present)
   - Inserts seed data

### Critical Behaviors

1. FK Column Generation: Child tables automatically get FK columns matching parent PK
2. Type Normalization: "serial" becomes "SERIAL PRIMARY KEY" in SQL
3. Column Merging: Generated FK columns merged into main column list
4. Execution Order: Tables → Columns → FKs → Triggers → Seed data

### Architectural Questions

1. FK Column Naming: Current logic uses FK name directly for single-column FKs. Should prefix/suffix always be used?
2. Type Parsing: Should multi-word types (double precision) be normalized during parsing or SQL generation?
3. Label/Format: Where should metadata be stored? Comments? Separate metadata table?
4. Calculated Columns: Should these use PostgreSQL GENERATED AS or triggers?

## How to Read Test Results

Pass:
- Test exits 0
- `verify-schema.sql` query returns expected results
- Database structure matches `expect-schema.txt`

Fail:
- Test exits 1
- SQL execution error
- Schema mismatch between actual and expected

Look for:
- Type mapping errors (e.g., "integer" becoming "INT" instead of "INTEGER")
- Missing columns or constraints
- Wrong column order (may indicate processing bug)

## Test Coverage Analysis

### Well Tested
- ✅ Column types (all PostgreSQL types)
- ✅ Column inheritance (null, string, $ref)
- ✅ Foreign key generation
- ✅ Pattern matching tables

### Incomplete Testing
- ⚠️ Calculated columns (test exists but failing)
- ⚠️ Indexes (test exists but inactive)
- ⚠️ Label and format (test exists but inactive)

### Missing Tests
- ❌ Composite primary keys
- ❌ Composite foreign keys (tested in Phase 5 behavior)
- ❌ Column comments
- ❌ Table comments
- ❌ Multiple unique constraints
- ❌ NOT NULL constraints
- ❌ DEFAULT expressions
- ❌ Type aliases (character varying → varchar)

## Adding New Feature Tests

1. Create directory: `tests/04-schema-features/feature-name/`
2. Add `expect-exit-0.txt` (feature tests expect success)
3. Add `schema.yaml` with minimal example of feature
4. Add `verify-schema.sql` to query database structure
5. Add `expect-schema.txt` with expected query results in JSON format

Example `verify-schema.sql`:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'my_table'
ORDER BY ordinal_position;
```

Example `expect-schema.txt`:
```json
[{"column_name":"id","data_type":"integer","is_nullable":"NO"},{"column_name":"name","data_type":"character varying","is_nullable":"YES"}]
```

## Relationship to Phase 5 (Behavior)

Phase 4 tests features in isolation:
- Feature works with minimal schema
- SQL is generated correctly
- Database structure is correct

Phase 5 tests features in context:
- Feature works with complex schemas
- Triggers fire correctly
- Data flows through automations

## Related Documentation

- [Schema Syntax Docs](../../docs/schema-syntax/)
- [Column Types Guide](../../docs/schema-syntax/01-single-table.md)
- [Foreign Keys Guide](../../docs/schema-syntax/03-foreign-keys.md)
