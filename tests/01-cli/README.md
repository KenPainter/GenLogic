# Phase 1: CLI Entry

## What This Phase Does

The CLI entry phase handles command-line interface parsing and basic validation before any schema processing begins.

Code Location: `src/cli.ts`

Execution Flow:
```
User command → commander.js → Validate required options → Create GenLogicProcessor
```

## Inputs

- Command-line arguments (host, port, database, user, password, schema path, --dry-run)
- No file system access yet
- No database connection yet

## Outputs

Success Path:
- Validated configuration object passed to GenLogicProcessor
- Proceeds to Phase 2 (Schema Loading)

Error Path:
- Exit code 1
- Error message to stderr
- Process terminates (no further phases run)

## What Tests Validate

| Test | Validates | Expected Behavior |
|------|-----------|-------------------|
| `000-dry-run-safety` | --dry-run prevents writes | Should complete without modifying database |
| `help` | --help displays usage | Should show help text and exit 0 |
| `version` | --version displays version | Should show version from package.json and exit 0 |
| `custom-host-port` | Custom --host and --port work | Should connect to specified host/port |
| `schema-file-path` | Custom schema path works | Should load schema from custom path |
| `missing-database` | Error when --database omitted | Should exit 1 with error message |
| `missing-username` | Error when --user omitted | Should exit 1 with error message |

## Code Architecture Notes

### Current Implementation

`src/cli.ts` uses commander.js for option parsing:
- Version: Read from package.json at runtime
- Required options: `--database`, `--user`
- Required but not validated: `--password` (Bun limitation)
- Optional options: `--host` (default: localhost), `--port` (default: 5432), `--schema` (default: ./schema.yaml)
- Flags: `--dry-run`

### Critical Behavior

1. Password requirement: Password is required for connection but not validated by CLI. Bun's SQL driver does not support passwordless connections. Connection will fail if password is omitted.
2. Schema path: Can be relative or absolute
3. Dry-run mode: Sets flag but doesn't prevent connection - later phases must check it

### Architectural Questions

1. Should CLI validate that --password is provided? (Currently not validated but required for connection)
2. Should schema path validation happen here or in Phase 2?
3. Should database connectivity be tested here or later?

## How to Read Test Results

Pass: Test exits with expected code and produces expected output
Fail: Test exits with unexpected code or output

Look for:
- Exit code mismatches (expected 0 got 1, or vice versa)
- Missing expected stdout/stderr patterns
- Unexpected error messages

## Adding New CLI Tests

1. Create directory: `tests/01-cli/new-test-name/`
2. Add `expect-exit-0.txt` or `expect-exit-1.txt` (required)
3. Add `expect-stdout.txt` with required patterns (optional)
4. Add `expect-stderr.txt` with required patterns (optional)
5. Add `args.txt` with custom CLI arguments (optional)
6. Add `schema.yaml` if needed (optional)

## Related Documentation

- [CLI Usage Guide](../../docs/building-database/01-cli-usage.md)
- [Installation Guide](../../docs/building-database/00-installation.md)
