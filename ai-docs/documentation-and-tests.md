# GenLogic Documentation and Tests

GenLogic makes strong promises about the value of the
databases it builds, and it takes a relatively known system,
the relational database, and adds features on top of it
that must be fully covered by documentation and tests.

For this reason, we have a documentation system that also
details tests.  This creates a single source of truth for
how a feature is specified, and how it is tested.

## Test Coverage

To provide our required level of [database-integrity](./database-integrity.md),
we must have 100% coverage of advertised syntax features and integrity
features.

We test end-to-end always, to ensure the tests follow the same code
path as the end-user.

## Documentation Sections

### Setup and CLI Usage

There should be exactly three documents here:

- [00-Installation](../docs/installation-and-usage/00-installation.md)
  - only instructions
- [10-Database-Setup](../docs/installation-and-usage/10-database-setup.md)
  - only instructions relevant to the user
  - following details in [database-connections](./database-connections.md)
- [20-cli-usage](../docs/installation-and-usage/20-cli-usage.md)
  - instructions
  - listing of test coverage
  - following details in [code structure](./code-structure.md)

### Schema Syntax

Systematic progression through syntax elements, from a basic table,
to re-usable columns, then the three major forms of calculations,
being the parent-to-child, within row, and child-to-parent.

Following those docs come other features such as spread and
matching tables.

Each document lists
- the feature with progressive explanation of variations
- at the bottom of the document, a list of the tests that cover it

### Features

This section covers non-syntax features like subversion protection
and NaN prevention.

Each document explains:
- what the feature is and what it does
- what tests cover this feature
