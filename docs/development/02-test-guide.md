Previous: [UI Notes Guide](guides/ui-notes-guide.md) | Next: [Minimal Schema](examples/basic/minimal-schema.md)

# GenLogic Testing Guide

This document outlines the comprehensive testing framework for GenLogic.

## Test Structure

### Group 1: YAML Validation Tests (Unit Tests)
These tests verify schema validation without requiring a database connection.

**Files:**
- `tests/validation/schema-syntax.test.ts` - Basic syntax validation
- `tests/validation/type-system.test.ts` - PostgreSQL type system validation
- `tests/validation/cross-reference.test.ts` - Column inheritance validation
- `tests/validation/graph-validation.test.ts` - Cycle detection
- `tests/validation/inheritance.test.ts` - Column inheritance edge cases

**Run Command:**
```bash
bun test tests/validation
```

### Group 2: End-to-End Database Tests (Integration Tests)
These tests verify complete functionality with a real PostgreSQL database.

**Files:**
- `tests/database/setup.test.ts` - Database connection and basic operations
- `tests/database/automation.test.ts` - SUM, COUNT, MAX, LATEST automation

**Prerequisites:**
- PostgreSQL database
- Test database created
- Environment variables set for database connection

**Run Commands:**
```bash
# Run database tests
DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASSWORD=your_password bun test tests/database
```

## Test Environment Setup

### PostgreSQL Setup

Create a test database in your local PostgreSQL instance:

```bash
# Create test database
createdb genlogic_test

# Or using psql
psql -U postgres -c "CREATE DATABASE genlogic_test;"
```

Set environment variables for database connection:

```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=postgres
export DB_PASSWORD=your_password

# Run tests
bun test tests/database
```

## Environment Variables

The database tests use these environment variables:

- `DB_HOST` - PostgreSQL host (default: localhost)
- `DB_PORT` - PostgreSQL port (default: 5432)
- `DB_USER` - PostgreSQL username (default: postgres)
- `DB_PASSWORD` - PostgreSQL password (default: postgres)

## Test Coverage

### Validation Tests (Group 1)
- ✅ Top-level key validation
- ✅ Column/table name patterns
- ✅ PostgreSQL type system (require/allow/prohibit size)
- ✅ Cross-reference validation (column inheritance, automation references)
- ✅ Cycle detection (foreign key cycles, automation dependency cycles)
- ✅ Column inheritance patterns

For practical schema examples, see:
- [examples/basic/minimal-schema.md](examples/basic/minimal-schema.md) - Simple schema for getting started
- [examples/automations/sum-automation.md](examples/automations/sum-automation.md) - SUM automation examples
- [examples/edge-cases/null-handling.md](examples/edge-cases/null-handling.md) - NULL value edge cases

### Database Tests (Group 2)
- ✅ Database connection and setup
- ✅ Schema processing pipeline
- ✅ Column inheritance processing
- ✅ SUM automation with incremental updates
- ✅ COUNT automation with incremental updates
- ✅ MAX/MIN automation with incremental updates
- ✅ LATEST automation
- ✅ Multiple instances of automation (consolidated triggers)

## Known Issues

1. **Database tests**: Require local PostgreSQL instance with test database created.

2. **Performance tests**: Large-scale performance testing not yet implemented. Would require datasets with 100k+ records and timing measurements.

3. **CI Integration**: Automated test runs on code changes not yet configured.

## Running All Tests

```bash
# Run only validation tests (fast, no database needed)
bun test tests/validation

# Run full test suite (requires database setup)
DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASSWORD=your_password bun test
```

## Development Workflow

1. **During development**: Use `bun test tests/validation` for fast feedback
2. **Before commits**: Run full test suite including database tests
3. **CI/CD**: Currently validation tests only (database tests need infrastructure)

## Future Enhancements

- [ ] Large-scale performance and stress testing (100k+ records)
- [ ] Error recovery testing
- [ ] Concurrent modification testing
- [ ] Database migration testing
- [ ] CI/CD integration

---

Previous: [UI Notes Guide](guides/ui-notes-guide.md) | Next: [Minimal Schema](examples/basic/minimal-schema.md)
