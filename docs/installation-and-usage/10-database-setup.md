Previous: [Installation](00-installation.md) | Next: [CLI Usage](20-cli-usage.md)

# Database Setup

GenLogic connects to PostgreSQL on localhost using Unix socket connections with peer authentication.

## Prerequisites

- PostgreSQL 12 or higher installed
- Database user with CREATE DATABASE and CREATEROLE privileges
- Unix socket connection to PostgreSQL configured

## Connection Method

GenLogic connects to PostgreSQL via Unix socket at `/var/run/postgresql`. This requires:

1. PostgreSQL running on localhost
2. Peer authentication configured in `pg_hba.conf`
3. System username matching PostgreSQL username

Example `pg_hba.conf` entry:

```
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     peer
```

Test your connection works without a password:

```bash
psql -U your_username -d postgres
```

If this succeeds without prompting for a password, GenLogic will connect successfully.

## Creating a Database

GenLogic automatically creates the database if it doesn't exist:

```bash
bun run src/cli.ts \
  -d myapp_db \
  -u postgres \
  -s schema.yaml
```

If database `myapp_db` doesn't exist and the user has CREATE DATABASE privilege, GenLogic creates it.

## Two-User Security Model

GenLogic enforces database-level integrity using a two-user model.

### Setup User (Privileged)

GenLogic must run as a privileged user with CREATEROLE privilege. This user performs schema migrations and configures the security model.

The setup user:
- Creates the `<database_name>_genlogic_admin` role
- Creates tables owned by the admin role
- Generates SECURITY DEFINER triggers owned by the admin role
- Configures column-level permissions for application users

Grant CREATEROLE privilege:

```sql
ALTER ROLE your_user CREATEROLE;
```

GenLogic fails immediately at connection time if the user lacks CREATEROLE privilege.

### Application User (Normal)

After GenLogic runs, application code connects as a normal unprivileged user. This user has restricted permissions:

- SELECT, INSERT, DELETE permissions on all tables
- UPDATE permission only on non-automated columns
- Cannot modify automated or generated columns (permission denied)
- Cannot bypass triggers (does not own tables)

This separation ensures calculated values cannot be corrupted by application code or malicious clients.

## Test Coverage

This section lists tests that verify database connection behavior works correctly.

### Connection Tests

These tests verify that GenLogic handles database connections correctly:

- [x] [Successful connection](../../tests/03-database-connection/successful-connection) - Database connects and disconnects cleanly
- [x] [Auto-create database](../../tests/03-database-connection/auto-create-database) - Database created automatically when it doesn't exist
- [x] [Missing CREATEROLE](../../tests/03-database-connection/missing-createrole) - Error when user lacks CREATEROLE privilege

---

Previous: [Installation](00-installation.md) | Next: [CLI Usage](20-cli-usage.md)
