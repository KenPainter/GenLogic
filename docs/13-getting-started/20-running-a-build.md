# Running a Build

## Basic Build Command

```bash
bun run src/cli.ts --database myapp --schema schema.yaml
```

Required options:
- `-d, --database` - PostgreSQL database name (created if does not exist)
- `-s, --schema` - Path to YAML schema file

## Database Creation

If the specified database does not exist, GenLogic creates it automatically.

The database user must have CREATEDB privilege (included in CREATEROLE).

## Dry Run

Preview changes without executing:

```bash
bun run src/cli.ts --database myapp --schema schema.yaml --dry-run
```

Dry run:
- Validates schema
- Compares to live database
- Generates DDL
- Shows planned changes
- Does not execute DDL

## Dump Directory

Save all intermediate files:

```bash
bun run src/cli.ts --database myapp --schema schema.yaml --dump-dir ./output
```

Generated files:
- `*.newSchema.json` - Processed schema with inferred types and dependencies
- `*.diff.json` - Differences between schema and live database
- `*.ddl.sql` - Generated DDL statements
- `*.drop.sql` - Drop script for unused tables/columns

## User Privileges

GenLogic must run as a database user with CREATEROLE privilege.

The user is auto-detected from the USER environment variable.

GenLogic creates an admin role `<database_name>_genlogic_admin` that:
- Owns all tables
- Owns all triggers (created SECURITY DEFINER)
- Cannot be bypassed by application code

## Build Failures

If schema validation fails, GenLogic prints errors and exits with status 1.

See docs/70-reference/error-messages.md for all validation errors.

## Rerunning Builds

GenLogic builds are idempotent. Rerunning with the same schema makes no changes except:
- Triggers are always dropped and recreated
- Seed rows are inserted (ON CONFLICT DO NOTHING)
