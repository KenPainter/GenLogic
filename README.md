# GenLogic

**Augmented Normalization for PostgreSQL with foreign keys as data pipelines**

GenLogic is a TypeScript CLI tool that creates powerful, self-maintaining PostgreSQL databases where foreign keys serve as both relationships and automation pathways. Write normalized data, get computed aggregations automatically.

## Philosophy

Traditional databases treat foreign keys as constraints. GenLogic treats them as data pipelines that:
- Create column structure (automatic FK columns)
- Define relationships (standard constraints)
- Power automations (SUM, COUNT, MAX, LATEST flow along FK paths)

The result: business logic runs in the database with maximum efficiency and minimal middleware complexity.

## Using AI

### Hacking GenLogic

AI-written code is accepted.  We judge the code, not the source.

Point the AI to [CONTRIBUTING.md](./CONTRIBUTING.md) at the start of a
session.

### Using GenLogic

TO-DO: Context files for AI assistants to write schemas.  Ideally we
just point them to the user documentation.

DONE: GenLogic generates a schema description intended for use by AI agents
when coding up middleware and UI's that access a GenLogic database.


## Short History

This product is the spiritual descendant of [Andromeda](https://github.com/Andromeda-Project/andromeda),
originally written by [Ken Downs](https://github.com/KenPainter) 
in 2002 in PHP, and most recently maintained 
by [Donald Organ](https://github.com/dorgan/).

GenLogic is a complete rewrite in Typescript.

## Quick Start

### Installation
```bash
npm install -g genlogic
# or clone and build locally
git clone <repository>
cd genlogic
npm install && npm run build
```

### Basic Usage
```bash
# Apply schema to database
genlogic --host localhost --port 5432 --database mydb --user postgres --password secret --schema ./schema.yaml

# Dry run (show planned changes without executing)
genlogic --schema ./schema.yaml --dry-run

# Test mode (validate schema without database connection)
genlogic --schema ./schema.yaml --test-mode
```
### Example Schema

[docs/toc.md](./docs/toc.md) - Complete examples and documentation index

```yaml
columns:
  amount: { type: numeric, size: 10, decimal: 2 }

tables:
  accounts:
    columns:
      account_id: { type: integer, sequence: true, primary_key: true }
      balance:
        $ref: amount
        automation:
          type: SUM
          table: transactions
          foreign_key: account_fk
          column: amount

  transactions:
    foreign_keys:
      account_fk: { table: accounts }
    columns:
      transaction_id: { type: integer, sequence: true, primary_key: true }
      amount: null  # inherits from reusable column
```

This creates an `accounts` table where `balance` automatically maintains the SUM of all related `transactions.amount` values via efficient PostgreSQL triggers.

## Key Features

- Safety-First: Bulletproof cycle detection prevents infinite loops
- Incremental Updates: O(1) trigger performance using OLD/NEW values
- Schema Evolution: Add-only operations never break existing data
- Multiple Inheritance: Flexible column reuse with null, string, and $ref patterns
- Consolidated Triggers: Groups multiple automations for maximum efficiency
- Transaction Safety: All operations wrapped in atomic transactions

## Available Commands

```bash
npm run build    # Compile TypeScript
npm run dev      # Run in development mode
npm run lint     # Code linting
npm run clean    # Remove build artifacts
```

For testing commands and setup, see [docs/test-guide.md](./docs/test-guide.md).

## Documentation

- [docs/toc.md](./docs/toc.md) - Complete examples and documentation index
- [docs/architecture/design.md](./docs/architecture/design.md) - Core philosophy and concepts
- [docs/test-guide.md](./docs/test-guide.md) - Testing setup and instructions

## Requirements

- Node.js 18+
- PostgreSQL database
- TypeScript (for development)

## Automation Types

- SUM/COUNT/MAX/MIN - Aggregate child values to parent
- LATEST - Copy most recent child value to parent
- FETCH - Copy parent value to child on INSERT
- FETCH_UPDATES - Copy parent value to child on UPDATE

## Safety Features

- Cycle Detection - Prevents infinite loops in FK relationships and automations
- Add-Only Schema - Never deletes existing columns or tables
- Validation-First - Comprehensive checks before any database changes
- Transaction Rollback - Automatic rollback on any error

## Performance

- Efficient Triggers - Groups multiple automations into single triggers per FK path
- Incremental Updates - O(1) calculations using OLD/NEW values instead of table scans
- Optimized SQL - Generates minimal, targeted PostgreSQL statements

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines. Test your changes using the test suite described in [docs/test-guide.md](./docs/test-guide.md).

## License

Affero GPL v3, see [LICENSE.md](./LICENSE.md) for more details.

