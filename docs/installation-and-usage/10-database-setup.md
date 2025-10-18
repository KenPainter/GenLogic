Previous: [Installation](00-installation.md) | Next: [CLI Usage](20-cli-usage.md)

# Database Setup

GenLogic requires a PostgreSQL database with proper user permissions and authentication configured.

## Prerequisites

- PostgreSQL 12 or higher installed
- Database user with CREATE DATABASE privilege
- Unix socket or TCP connection to PostgreSQL

## Creating a Database

GenLogic will automatically create the database if it doesn't exist, provided your user has CREATE DATABASE privilege:

```bash
bun run src/cli.ts \
  -d myapp_db \
  -u postgres \
  -s schema.yaml
```

If the database `myapp_db` doesn't exist, GenLogic creates it automatically.

## Connection Methods

### Unix Socket Connection (Default)

GenLogic connects via Unix socket by default (localhost):

```bash
bun run src/cli.ts \
  -d mydb \
  -u postgres \
  -s schema.yaml
```

### TCP Connection

For remote databases or custom ports:

```bash
bun run src/cli.ts \
  -d mydb \
  -u postgres \
  -s schema.yaml \
  --host db.example.com \
  --port 5432 \
  --password yourpassword
```

## Authentication

### Peer Authentication (Development)

For local development, peer authentication is simplest:

```bash
# pg_hba.conf
local   all   all   peer
```

Your system username must match your PostgreSQL username.

### Password Authentication (Production)

For production or remote connections:

```bash
# pg_hba.conf
host   all   all   0.0.0.0/0   md5
```

Then use the `--password` flag:

```bash
bun run src/cli.ts \
  -d mydb \
  -u postgres \
  -s schema.yaml \
  --password yourpassword
```

## User Permissions

The database user needs these privileges:

- CREATE DATABASE - To create database if it doesn't exist
- CREATE TABLE - To create tables
- CREATE FUNCTION - To create triggers and stored procedures
- CREATEROLE - Required for non-subvertible calculated columns (see [Non-Subvertible Calculations](../features/02-non-subvertible-calculations.md))

Grant CREATEROLE privilege:

```sql
ALTER ROLE your_user CREATEROLE;
```

## Troubleshooting

### Connection Refused

If you get "connection refused":

1. Check PostgreSQL is running: `pg_isready`
2. Verify connection settings (host, port)
3. Check firewall rules

### Authentication Failed

If authentication fails:

1. Verify username and password
2. Check `pg_hba.conf` authentication method
3. Reload PostgreSQL: `sudo systemctl reload postgresql`

### Database Does Not Exist

If the database doesn't exist and GenLogic can't create it:

1. Verify user has CREATE DATABASE privilege
2. Create database manually:
   ```sql
   CREATE DATABASE myapp_db;
   ```

## Test Coverage

This section lists tests that verify database connection behavior works correctly.

### Connection Tests

These tests verify that GenLogic handles database connections correctly:

- [x] [Successful connection](../../tests/03-database-connection/successful-connection) - Database connects and disconnects cleanly
- [x] [Authentication failure](../../tests/03-database-connection/authentication-failure) - Wrong password error reported
- [x] [Database doesn't exist](../../tests/03-database-connection/database-does-not-exist) - Non-existent database error reported

---

Previous: [Installation](00-installation.md) | Next: [CLI Usage](20-cli-usage.md)
