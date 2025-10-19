# GenLogic Documentation

This directory contains comprehensive documentation for GenLogic schema definition language.

## Table of Contents

### Installation and Usage
1. [Installation](installation-and-usage/00-installation.md)
2. [Configure Postgres](installation-and-usage/10-configure-postgres.md)
3. [CLI Usage](installation-and-usage/20-cli-usage.md)

### GenLogic Schema Syntax
1. [Single Table Basics](schema-syntax/01-single-table.md) - Creating a simple table with all column types
2. [Reusable Columns](schema-syntax/02-reusable-columns.md) - Column inheritance with string, null, and $ref methods
3. [Foreign Keys](schema-syntax/03-foreign-keys.md) - Establishing relationships between tables
4. [Moving Values from Parent to Child](schema-syntax/04-parent-to-child.md) - SNAPSHOT and SYNC automations
5. [Generating Values Within a Row](schema-syntax/05-generated-columns.md) - Expression-based calculations
6. [Moving Values from Child to Parent](schema-syntax/06-child-to-parent.md) - Aggregation automations
7. [Pattern Matching Tables](schema-syntax/07-matching-tables.md) - Rule-based categorization with specificity ranking
8. [Indexes and Unique Constraints](schema-syntax/08-indexes-and-constraints.md) - Composite indexes and unique constraints
9. [Label and Format](schema-syntax/09-label-and-format.md) - UI metadata that propagates through relationships
10. [Seed Data](schema-syntax/10-seed-data.md) - Loading seed data with foreign key resolution

### Features
1. [Schema Validation](features/01-schema-validation.md) - Two-stage validation catches errors before database connection
2. [Non-Subvertible Calculations](features/02-non-subvertible-calculations.md) - Database-level protection for automated columns
3. [Additive Changes Only](features/03-additive-changes.md) - GenLogic never destroys data
4. [Numeric Integrity Protection](features/04-numeric-integrity.md) - Automatic blocking of NaN and Infinity values

### Hacking GenLogic

1. [Running Tests](./hacking/run-tests.md)
