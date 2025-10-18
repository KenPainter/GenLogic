Next: [CLI Usage](10-cli-usage.md)

# Installation

This guide covers installing GenLogic and its prerequisites.

## Prerequisites

GenLogic requires:

1. PostgreSQL - [Installation instructions](https://www.postgresql.org/download/)
2. Bun 1.2.0 or later - [Installation instructions](https://bun.sh/docs/installation)

## Installing GenLogic

### From Source

```bash
# Clone the repository
git clone https://github.com/your-org/genlogic.git
cd genlogic

# Install dependencies
bun install

# Make CLI executable (optional)
chmod +x src/cli.ts
```

## Verification

After installation, verify GenLogic is working:

```bash
# Test basic CLI
bun run src/cli.ts --version

# Test help output (shows available options)
bun run src/cli.ts --help
```

## Configuration

### Database Connection

GenLogic connects to PostgreSQL on localhost using Unix socket trusted connections (peer authentication).

```bash
bun run src/cli.ts \
  -d myapp_db \
  -u postgres \
  -s schema.yaml
```

Required options:
- `-d, --database` - Database name (will be created automatically if it doesn't exist)
- `-u, --user` - PostgreSQL username
- `-s, --schema` - Schema file path

### PostgreSQL Authentication Setup

GenLogic requires trusted/peer authentication to be configured in PostgreSQL. Verify your `pg_hba.conf` includes:

```
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     peer
```

Test your connection:
```bash
psql -U your_username -d postgres
```

If this works without a password prompt, GenLogic will work.

---

Next: [CLI Usage](10-cli-usage.md)
