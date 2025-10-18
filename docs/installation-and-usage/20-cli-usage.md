Previous: [Installation](00-installation.md) | Next: [What GenLogic Does](20-what-genlogic-does.md)

# CLI Usage

GenLogic provides a command-line interface for processing schema definitions and applying them to PostgreSQL databases.

## Basic Usage

```bash
bun run src/cli.ts -d database_name -u username -s schema.yaml
```

GenLogic connects to PostgreSQL on localhost using Unix socket trusted connections.

## Command Options

### Required Options

- `-d, --database <database>` - PostgreSQL database name (created automatically if it doesn't exist)
- `-u, --user <user>` - PostgreSQL username
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
  -u postgres \
  -s /path/to/my-product.yaml
```

If the database doesn't exist, GenLogic will create it automatically.

### Dry Run Mode

Preview changes without applying them:

```bash
bun run src/cli.ts \
  -d myapp_db \
  -u postgres \
  -s /path/to/my-product.yaml \
  --dry-run
```

This outputs the SQL statements that would be executed without actually running them.

## Schema File Format

GenLogic expects schemas in YAML format. Example:

```yaml
columns:
  id: serial primary key
  name: varchar(100)
  created_at: timestamp

tables:
  users:
    columns:
      id:
      name:
      email: varchar(255) unique
      created_at:
```

See schema syntax documentation for details.

## Exit Codes

- `0` - Success
- `1` - Error (validation failure, database error, etc.)

## Common Workflows

### Initial Setup

1. Create your schema file
2. Preview changes with dry run:
   ```bash
   bun run src/cli.ts -d mydb -u $USER -s schema.yaml --dry-run
   ```
3. Build/Update the database:
   ```bash
   bun run src/cli.ts -d mydb -u $USER -s schema.yaml
   ```

### Schema Updates

When modifying an existing schema:

1. Edit your schema file
2. Preview changes with dry run to see what will be modified (if desired)
3. Apply changes when satisfied

### Debugging

For detailed SQL output during execution:

```bash
DEBUG_SQL=1 bun run src/cli.ts -d mydb -u $USER -s schema.yaml
```

## Error Messages

Common error messages and solutions:

- "Database name is required" - Provide `-d` option
- "Username is required" - Provide `-u` option
- "Schema file path is required" - Provide `-s` option
- "Column 'x' references non-existent column 'y'" - Fix column inheritance reference
- "Foreign key references non-existent table" - Ensure referenced table exists
- "Cycle detected in data flow graph" - Remove circular automation dependencies
- Connection errors - Check PostgreSQL is running and peer authentication is configured (see Installation guide)

## Integration with CI/CD

Example GitHub Actions workflow:

```yaml
- name: Apply Schema
  run: |
    bun run src/cli.ts \
      -d ${{ secrets.DB_NAME }} \
      -u ${{ secrets.DB_USER }} \
      -s schema.yaml
```

For validation testing, use dry-run mode:

```yaml
- name: Validate Schema Changes
  run: |
    bun run src/cli.ts \
      -d ${{ secrets.DB_NAME }} \
      -u ${{ secrets.DB_USER }} \
      -s schema.yaml \
      --dry-run
```

**Note**: Ensure your CI environment has PostgreSQL configured with peer/trust authentication for the specified user.

## Troubleshooting

### Connection Issues

If you cannot connect to the database:
1. Verify PostgreSQL is running: `pg_isready`
2. Test Unix socket connection: `psql -U username -d postgres`
3. Check `pg_hba.conf` has peer authentication enabled for local connections
4. Verify your system user matches the PostgreSQL user you're specifying

### Schema Validation Errors

If schema validation fails:
1. Check YAML syntax with a YAML validator
2. Verify all referenced columns and tables exist
3. Check for circular dependencies in automations

### Performance Issues

For slow schema processing:
1. Use `--dry-run` first to analyze changes
2. Review generated SQL with `DEBUG_SQL=1`
3. Check PostgreSQL logs for slow queries

---

Previous: [Installation](00-installation.md) | Next: [What GenLogic Does](20-what-genlogic-does.md)
