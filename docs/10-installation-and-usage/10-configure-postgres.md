Previous: [Installation](00-installation.md) | Next: [CLI Usage](20-cli-usage.md)

# Configure Postgres

GenLogic connects to PostgreSQL on localhost using Unix socket connections with peer authentication.

## Security Model

GenLogic runs on a model that local acess = authorized access.  In both dev
and production, SSH access to the box means the user can run GenLogic 
without a password.  We use Postgres peer authentication for this.

This approach depends upon security that should be in place anyway - 
security of the schema definition and protection of the production server.
This method creates no new secrets management requirements around
access to the database.

## Prerequisites

- PostgreSQL 12 or higher installed on a Linux or Mac system (only Linux has been tested with regular use)
- Unix socket connection to PostgreSQL configured

## User Setup

GenLogic runs as your current system user. PostgreSQL must have a user matching your OS username.

Check your username:

```bash
whoami
```

Create a matching PostgreSQL user (run as postgres user):

```bash
sudo -u postgres createuser $(whoami)
```

Grant required privileges (CREATEROLE and CREATEDB):

```bash
sudo -u postgres psql -c "ALTER ROLE $(whoami) CREATEROLE CREATEDB;"
```

GenLogic fails immediately at connection time if the user lacks CREATEROLE privilege.

## Connection Method

GenLogic connects to PostgreSQL via Unix socket at `/var/run/postgresql` using peer authentication.
Peer authentication verifies your identity based on your OS username.

Most PostgreSQL installations on Linux include peer authentication by default. Verify this `pg_hba.conf` entry exists:

```
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     peer
```

## Verify Setup

Test your connection works without a password:

```bash
psql -d postgres
```

If this connects successfully without prompting for a password, GenLogic will work correctly.

If the connection fails, verify:
1. PostgreSQL user exists matching your OS username (`whoami`)
2. User has CREATEROLE and CREATEDB privileges
3. `pg_hba.conf` has peer authentication enabled for local connections


## Test Coverage

This section lists tests that verify database connection behavior works correctly.

### Connection Tests

These tests verify that GenLogic handles database connections correctly:

- [x] [Successful connection](../../tests/03-database-connection/successful-connection) - Database connects and disconnects cleanly
- [x] [Auto-create database](../../tests/03-database-connection/auto-create-database) - Database created automatically when it doesn't exist

---

Previous: [Installation](00-installation.md) | Next: [CLI Usage](20-cli-usage.md)
