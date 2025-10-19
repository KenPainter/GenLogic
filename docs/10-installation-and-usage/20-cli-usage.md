Previous: [Configure Postgres](10-configure-postgres.md) | Next: [Introduction](../20-schema-syntax/00-introduction.md)

# CLI Usage

GenLogic provides a command-line interface for processing schema 
definitions and applying them to PostgreSQL databases.

## Basic Usage

```bash
bun run src/cli.ts -d database_name -s schema.yaml
```

GenLogic automatically uses your current OS username for database connections via Unix socket peer authentication.

## Command Options

### Required Options

- `-d, --database <database>` - PostgreSQL database name (created automatically if it doesn't exist)
- `-s, --schema <path>` - Path to YAML schema file

### Optional Options

- `--dry-run` - Show planned SQL changes without executing them
- `-V, --version` - Display version information
- `-h, --help` - Display help information

## Usage Examples

### Process a Schema

Build your database:

```bash
bun run src/cli.ts \
  -d myapp_db \
  -s /path/to/my-product.yaml
```

If the database doesn't exist, GenLogic creates it automatically.

### Dry Run Mode

Preview changes without applying them:

```bash
bun run src/cli.ts \
  -d myapp_db \
  -s /path/to/my-product.yaml \
  --dry-run
```

This outputs the SQL statements that would be executed without running them.

## Exit Codes

- `0` - Success
- `1` - Error (validation failure, database error, etc.)


### Debugging

For detailed SQL output during execution:

```bash
DEBUG_SQL=1 bun run src/cli.ts -d mydb -s schema.yaml
```

## Test Coverage

This section lists tests that verify CLI behavior works correctly.

### CLI Behavior Tests

These tests verify command-line argument parsing and option handling:

- [x] [--help flag](../../tests/01-cli/help) - Displays usage information and exits 0
- [x] [--version flag](../../tests/01-cli/version) - Displays version in semver format and exits 0
- [x] [Missing --database](../../tests/01-cli/missing-database) - Error: "Database name is required"
- [x] [Missing --schema](../../tests/01-cli/missing-schema) - Error: "Schema file path is required"
- [x] [--dry-run flag](../../tests/01-cli/000-dry-run-safety) - Flag passes through correctly, no DB changes made
- [x] [Custom schema path](../../tests/01-cli/schema-file-path) - Schema loaded from custom path
- [x] [Non-existent schema file](../../tests/01-cli/nonexistent-schema-file) - Error: "no such file or directory"

---

Previous: [Configure Postgres](10-configure-postgres.md) | Next: [Introduction](../20-schema-syntax/00-introduction.md)
