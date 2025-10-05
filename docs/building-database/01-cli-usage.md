# CLI Usage

GenLogic provides a command-line interface for processing schema definitions and applying them to PostgreSQL databases.

## Installation

GenLogic requires Bun runtime:

```bash
# Install dependencies
bun install

# Make CLI executable
chmod +x src/cli.ts
```

## Basic Usage

```bash
bun run src/cli.ts -d database_name -u username -w password -s schema.yaml
```

## Command Options

### Required Options (unless in test mode)

- `-d, --database <database>` - PostgreSQL database name
- `-u, --user <user>` - PostgreSQL username
- `-w, --password <password>` - PostgreSQL password

### Optional Options

- `-h, --host <host>` - PostgreSQL host (default: `localhost`)
- `-p, --port <port>` - PostgreSQL port (default: `5432`)
- `-s, --schema <path>` - Path to YAML schema file (default: `./schema.yaml`)
- `--dry-run` - Show planned SQL changes without executing them
- `--test-mode` - Skip database connection for validation testing
- `--version` - Display version information
- `--help` - Display help information

## Usage Examples

### Process a Schema

Apply a schema to your database:

```bash
bun run src/cli.ts \
  -d myapp_db \
  -u postgres \
  -w mypassword \
  -s schemas/production.yaml
```

### Dry Run Mode

Preview changes without applying them:

```bash
bun run src/cli.ts \
  -d myapp_db \
  -u postgres \
  -w mypassword \
  -s schema.yaml \
  --dry-run
```

This outputs the SQL statements that would be executed without actually running them.

### Test Mode

Validate a schema without database connection:

```bash
bun run src/cli.ts \
  -s schema.yaml \
  --test-mode
```

This validates:
- Schema syntax
- Column inheritance references
- Foreign key references
- Automation configurations
- Data flow graph for cycles

### Custom Host and Port

Connect to a remote PostgreSQL server:

```bash
bun run src/cli.ts \
  -h db.example.com \
  -p 5433 \
  -d production_db \
  -u dbadmin \
  -w secure_password \
  -s schema.yaml
```

## Environment Variables

For security, you can use environment variables instead of command-line arguments:

```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=postgres
export DB_PASSWORD=mypassword

bun run src/cli.ts -d myapp_db -s schema.yaml
```

## Schema File Format

GenLogic expects schemas in YAML format. Example:

```yaml
columns:
  id: { type: integer, primary_key: true, sequence: true }
  name: { type: varchar, size: 100 }
  created_at: { type: timestamp }

tables:
  users:
    columns:
      id: null
      name: null
      email: { type: varchar, size: 255, unique: true }
      created_at: null
```

See [examples](../examples/) for comprehensive schema examples.

## Exit Codes

- `0` - Success
- `1` - Error (validation failure, database error, etc.)

## Common Workflows

### Initial Setup

1. Create your schema file
2. Validate with test mode:
   ```bash
   bun run src/cli.ts -s schema.yaml --test-mode
   ```
3. Preview changes with dry run:
   ```bash
   bun run src/cli.ts -d mydb -u user -w pass -s schema.yaml --dry-run
   ```
4. Apply schema:
   ```bash
   bun run src/cli.ts -d mydb -u user -w pass -s schema.yaml
   ```

### Schema Updates

When modifying an existing schema:

1. Edit your schema file
2. Preview changes with dry run to see what will be modified
3. Apply changes when satisfied

### Debugging

For detailed SQL output during execution:

```bash
DEBUG_SQL=1 bun run src/cli.ts -d mydb -u user -w pass -s schema.yaml
```

## Error Messages

Common error messages and solutions:

- **"Database name is required"** - Provide `-d` option or use test mode
- **"Column 'x' references non-existent column 'y'"** - Fix column inheritance reference
- **"Foreign key references non-existent table"** - Ensure referenced table exists
- **"Cycle detected in data flow graph"** - Remove circular automation dependencies
- **"Connection refused"** - Check PostgreSQL is running and credentials are correct

## Performance Considerations

- Use `--dry-run` for large schemas to preview changes first
- GenLogic processes schemas incrementally, only applying necessary changes
- Triggers are consolidated for optimal performance
- Pattern matching tables use indexed lookups

## Integration with CI/CD

Example GitHub Actions workflow:

```yaml
- name: Validate Schema
  run: bun run src/cli.ts -s schema.yaml --test-mode

- name: Apply Schema
  run: |
    bun run src/cli.ts \
      -d ${{ secrets.DB_NAME }} \
      -u ${{ secrets.DB_USER }} \
      -w ${{ secrets.DB_PASSWORD }} \
      -s schema.yaml
```

## Troubleshooting

### Connection Issues

If you cannot connect to the database:
1. Verify PostgreSQL is running: `pg_isready -h localhost -p 5432`
2. Check credentials: `psql -h localhost -U username -d database`
3. Ensure database exists
4. Check firewall/network settings

### Schema Validation Errors

If schema validation fails:
1. Use `--test-mode` to get detailed validation errors
2. Check YAML syntax with a YAML validator
3. Verify all referenced columns and tables exist
4. Review [Test Guide](../test-guide.md) for validation rules

### Performance Issues

For slow schema processing:
1. Use `--dry-run` first to analyze changes
2. Consider breaking large schemas into smaller files
3. Review generated SQL with `DEBUG_SQL=1`
4. Check PostgreSQL logs for slow queries