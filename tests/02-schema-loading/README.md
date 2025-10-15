# Phase 2: Schema Loading

## What This Phase Does

Schema loading reads and parses the YAML schema file into a GenLogic schema object.

Code Location: `src/processor.ts` → `loadYamlSchema()`

Execution Flow:
```
Schema file path → Read file → Parse YAML → Basic structure validation → GenLogicSchema object
```

## Inputs

- Schema file path (from Phase 1)
- File system access to read YAML

## Outputs

Success Path:
- `GenLogicSchema` object with tables, columns, foreign keys, etc.
- Proceeds to Phase 3 (Validation)

Error Path:
- Exit code 1
- Error message describing parse failure
- Process terminates

## What Tests Validate

| Test | Validates | Expected Behavior |
|------|-----------|-------------------|
| `invalid-yaml` | Malformed YAML syntax rejected | Should exit 1 with parse error |
| `missing-schema-file` | Non-existent file handled | Should exit 1 with file not found error |

## Code Architecture Notes

### Current Implementation

`src/processor.ts` handles schema loading:
```typescript
private loadYamlSchema(schemaPath: string): GenLogicSchema
```

Uses `yaml` package (parse function) to parse YAML into JavaScript object.
Validates that result is an object (not null, not primitive).

### What Gets Validated Here

This phase validates:
- File exists and is readable (readFileSync)
- YAML syntax is valid (yaml.parse)
- Parsed result is an object (not null, not primitive)

NOT validated here:
- Table/column names
- Type definitions
- References between tables
- Automation syntax
- Schema structure (that happens in Phase 3)

### Critical Behavior

1. Minimal validation: Only checks YAML is parseable and result is an object
2. Relative paths: Schema path resolved relative to current working directory
3. Error messages: Wrapped with "Failed to load YAML schema: " prefix
4. Synchronous: File read and parse happen synchronously (not async)

### Architectural Questions

1. Should relative file paths be resolved relative to schema file location or CWD?
2. Should this phase load imported schemas (if we add import support)?
3. Should empty object {} be allowed as a valid schema?

## How to Read Test Results

Pass: Test catches expected error or successfully loads schema
Fail: Test allows invalid YAML through or crashes unexpectedly

Look for:
- Generic errors instead of specific parse errors
- Stack traces (indicates unhandled exception)
- Wrong error messages

## Test Coverage Gaps

Missing tests:
1. YAML with valid syntax but invalid GenLogic structure (e.g., `tables: "not an object"`)
2. Empty schema file
3. Very large schema files (performance)
4. Schema files with unusual encodings
5. Schema files with YAML anchors/aliases

## Adding New Schema Loading Tests

1. Create directory: `tests/02-schema-loading/new-test-name/`
2. Add `expect-exit-1.txt` (all current tests expect failure)
3. Add `expect-stderr.txt` with expected error pattern
4. Add `schema.yaml` with the problematic YAML

## Related Documentation

- [Schema Syntax Overview](../../docs/schema-syntax/01-single-table.md)
- [YAML Specification](https://yaml.org/spec/)
