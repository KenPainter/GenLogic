# Installation

## Requirements

- Bun >= 1.2.0
- PostgreSQL server with trusted local connections
- Database user with CREATEROLE privilege

## Install from Source

Clone the repository and install dependencies:

```bash
git clone https://github.com/your-org/genlogic.git
cd genlogic
bun install
```

## Verify Installation

```bash
bun run src/cli.ts --help
```

Output shows available options:

```
GenLogic - Augmented Normalization for PostgreSQL with foreign keys as data pipelines

Options:
  -V, --version            output the version number
  -d, --database <database> PostgreSQL database name
  -s, --schema <path>      Path to YAML schema file
  --dry-run                Show planned changes without executing them
  --dump-dir <dir>         Directory for all output files
  -h, --help               display help for command
```

## Database User Setup

GenLogic requires a database user with CREATEROLE privilege.

Using the postgres superuser:

```bash
sudo -u postgres psql -c "GRANT CREATEROLE TO your_username;"
```

Or create a dedicated migration user:

```bash
sudo -u postgres psql -c "CREATE ROLE genlogic_admin WITH LOGIN CREATEROLE;"
```

GenLogic fails immediately if the user lacks CREATEROLE privilege.
