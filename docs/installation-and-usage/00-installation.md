Next: [Database Setup](10-database-setup.md)

# Installation

This guide covers installing GenLogic and its prerequisites.

## Prerequisites

GenLogic requires:

1. PostgreSQL 12 or higher - [Installation instructions](https://www.postgresql.org/download/)
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

---

Next: [Database Setup](10-database-setup.md)
