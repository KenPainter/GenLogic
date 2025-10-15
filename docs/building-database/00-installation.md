Next: [CLI Usage](10-cli-usage.md)

# Installation

This guide covers installing GenLogic and its prerequisites.

## Prerequisites

GenLogic requires:

1. PostgreSQL - [Installation instructions](https://www.postgresql.org/download/)
2. Bun 1.2.0 or later - [Installation instructions](https://bun.sh/docs/installation)

You'll also need a PostgreSQL database created and accessible.

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

### Project Dependencies

GenLogic has minimal external dependencies:

```json
{
  "dependencies": {
    "ajv": "^8.12.0",        // JSON Schema validation
    "commander": "^11.1.0",   // CLI argument parsing
    "yaml": "^2.3.4"          // YAML schema parsing
  }
}
```

## Bun Built-in Features

GenLogic uses Bun built-in features. These do not appear in `package.json` dependencies.

### PostgreSQL Driver (`bun:sql`)

Bun includes a native PostgreSQL driver. GenLogic uses this instead of external packages like `pg` or `node-postgres`.

Usage in GenLogic:
```typescript
import { SQL } from "bun";

const db = new SQL({
  hostname: "localhost",
  port: 5432,
  database: "myapp_db",
  username: "postgres",
  password: "password"
});

// Query using tagged template literals
const results = await db`SELECT * FROM users`;
```

This provides:
- Zero-dependency PostgreSQL access
- Automatic connection pooling
- Tagged template literal syntax for queries

### Shell Command Execution (`bun:$`)

Bun provides a built-in shell command executor. GenLogic tests use this instead of Node.js child process modules.

Usage in GenLogic tests:
```typescript
import { $ } from "bun";

// Run shell commands directly
await $`createdb test_db`;
```

## Verification

After installation, verify GenLogic is working:

```bash
# Test basic CLI
bun run src/cli.ts --version

# Test help output (shows available options)
bun run src/cli.ts --help
```

Expected output from `--version`:
```
1.0.0
```

Expected output from `--help`:
```
Usage: genlogic [options]

GenLogic - Augmented Normalization for PostgreSQL with foreign keys as data pipelines

Options:
  -V, --version              output the version number
  -h, --host <host>          PostgreSQL host (default: "localhost")
  -p, --port <port>          PostgreSQL port (default: "5432")
  -d, --database <database>  PostgreSQL database name
  -u, --user <user>          PostgreSQL username
  -w, --password <password>  PostgreSQL password
  -s, --schema <path>        Path to YAML schema file(s) (default: "./schema.yaml")
  --dry-run                  Show planned changes without executing them (default: false)
  --help                     display help for command
```

## Configuration

### Database Connection

GenLogic connects to PostgreSQL using command-line arguments. All connection details must be provided as options:

```bash
bun run src/cli.ts \
  -d myapp_db \
  -u postgres \
  -w password \
  -s schema.yaml
```

Required options:
- `-d, --database` - Database name
- `-u, --user` - PostgreSQL username

Optional options:
- `-h, --host` - PostgreSQL host (default: localhost)
- `-p, --port` - PostgreSQL port (default: 5432)
- `-w, --password` - PostgreSQL password
- `-s, --schema` - Schema file path (default: ./schema.yaml)

## Troubleshooting

### "Command not found: bun"

Ensure Bun is in your PATH:
```bash
# Add to ~/.bashrc or ~/.zshrc
export PATH="$HOME/.bun/bin:$PATH"

# Reload shell
source ~/.bashrc
```

### "Cannot connect to PostgreSQL"

Check PostgreSQL is running:
```bash
pg_isready -h localhost -p 5432
```

Check authentication:
```bash
# Test connection manually
psql -h localhost -U postgres -d myapp_db
```

Common fixes:
- Ensure PostgreSQL service is running
- Verify `pg_hba.conf` allows connections
- Check firewall rules
- Confirm database exists

### "Dependency version mismatch"

Ensure Bun version is 1.2.0 or later:
```bash
bun --version

# Upgrade if needed
curl -fsSL https://bun.sh/install | bash
```

### "Module not found" errors

Reinstall dependencies:
```bash
rm -rf node_modules bun.lockb
bun install
```

---

Next: [CLI Usage](10-cli-usage.md)
