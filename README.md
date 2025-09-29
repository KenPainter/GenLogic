# GenLogic

**Augmented Normalization for PostgreSQL with foreign keys as data pipelines**

GenLogic is a TypeScript CLI tool that creates powerful, self-maintaining PostgreSQL databases where foreign keys serve as both relationships and automation pathways. Write normalized data, get computed aggregations automatically.

## 🎯 Philosophy

Traditional databases treat foreign keys as constraints. GenLogic treats them as **data pipelines** that:
- Create column structure (automatic FK columns)
- Define relationships (standard constraints)
- Power automations (SUM, COUNT, MAX, LATEST flow along FK paths)

The result: business logic runs in the database with maximum efficiency and minimal middleware complexity.

## 🚀 Quick Start

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

[docs/toc.md](./docs/toc.md)** - Complete examples and documentation index

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

## ⚡ Key Features

- **Safety-First**: Bulletproof cycle detection prevents infinite loops
- **Incremental Updates**: O(1) trigger performance using OLD/NEW values
- **Schema Evolution**: Add-only operations never break existing data
- **Multiple Inheritance**: Flexible column reuse with null, string, and $ref patterns
- **Consolidated Triggers**: Groups multiple automations for maximum efficiency
- **Transaction Safety**: All operations wrapped in atomic transactions

## 📋 Available Commands

```bash
# Core commands
npm run build          # Compile TypeScript
npm run dev           # Run in development mode
npm start             # Run compiled version

# Testing
npm run test:validation    # Fast validation tests (no database)
npm run test:database     # End-to-end tests (requires PostgreSQL)
npm run test:db:setup     # Start test database (Docker)
npm run test:db:teardown  # Stop test database

# Development
npm run lint          # Code linting
npm run clean         # Remove build artifacts
```

## 📚 Documentation

- **[docs/toc.md](./docs/toc.md)** - Complete examples and documentation index
- **[DESIGN.md](./DESIGN.md)** - Core philosophy and concepts
- **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** - Development phases and technical details
- **[TEST_GUIDE.md](./TEST_GUIDE.md)** - Comprehensive testing instructions
- **[EXAMPLE.yaml](./EXAMPLE.yaml)** - Complete schema example

## 🛠️ Requirements

- Node.js 18+
- PostgreSQL database
- TypeScript (for development)

## 📊 Automation Types

- **SUM/COUNT/MAX/MIN** - Aggregate child values to parent
- **LATEST** - Copy most recent child value to parent
- **FETCH** - Copy parent value to child on INSERT
- **FETCH_UPDATES** - Copy parent value to child on UPDATE

## 🔒 Safety Features

- **Cycle Detection** - Prevents infinite loops in FK relationships and automations
- **Add-Only Schema** - Never deletes existing columns or tables
- **Validation-First** - Comprehensive checks before any database changes
- **Transaction Rollback** - Automatic rollback on any error

## 📈 Performance

- **Efficient Triggers** - Groups multiple automations into single triggers per FK path
- **Incremental Updates** - O(1) calculations using OLD/NEW values instead of table scans
- **Optimized SQL** - Generates minimal, targeted PostgreSQL statements

## 🤝 Contributing

GenLogic is designed for reliability and performance. When contributing:
1. Run validation tests: `npm run test:validation`
2. Test against real database: `npm run test:database`
3. Ensure all documentation is updated
4. Follow existing code patterns and safety principles

## 📜 License

MIT License - see LICENSE file for details.

---

*"Twenty years ago, they said I was doing it wrong. Today, GenLogic proves that foreign keys as data pipelines create the most efficient business logic systems."*