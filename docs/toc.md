# GenLogic Documentation

## Installation and Usage

1. [Installation](10-installation-and-usage/00-installation.md)
2. [Configure Postgres](10-installation-and-usage/10-configure-postgres.md)
3. [CLI Usage](10-installation-and-usage/20-cli-usage.md)

## GenLogic Schema Syntax for standard SQL

1. [Introduction](20-schema-syntax/00-introduction.md)
1. [Tables and Columns](20-schema-syntax/10-tables-and-columns.md) 
1. [Column Types](20-schema-syntax/11-column-types.md)
1. [Reusable Columns](20-schema-syntax/12-reusable-columns.md)
1. [Label, Format, and Comment](20-schema-syntax/13-label-format-comment.md)
1. [Foreign Keys](20-schema-syntax/20-foreign-keys.md)
1. [Indexes and Unique Constraints](20-schema-syntax/30-indexes-and-constraints.md)

## Column Automations Syntax

1. [Moving Values from Parent to Child](30-column-automation/10-parent-to-child.md)
1. [Generating Values Within a Row](30-column-automation/20-calculate-within-row.md)
1. [Moving Values from Child to Parent](30-column-automation/30-child-to-parent.md)

## Row and Table Automation Syntax

1. [Auto-Creating Parent Rows](40-row-automation/10-auto-create-parent.md)
1. [Spreading Parent to Multiple Children](40-row-automation/20-spread-to-children.md)
1. [Syncing Parent to Children](40-row-automation/30-sync-to-children.md)

## Data Integrity Features

1. Introduction
1. [Schema Validation](50-integrity-features/01-schema-validation.md)
2. [Non-Subvertible Calculations](50-integrity-features/02-non-subvertible-calculations.md)
3. [Additive Changes Only](50-integrity-features/03-additive-changes.md)
4. [Numeric Integrity Protection](50-integrity-features/04-numeric-integrity.md)

## Application Development Features

1. [Pattern Matching Tables](schema-syntax/07-matching-tables.md)
1. [Seed Data](schema-syntax/10-seed-data.md)
5. [The Resolved File] - no link yet, does not exist
1. [The genlogic-schema.json file] - no link yet, doc does not exist

## Hacking GenLogic

1. [Running Tests](hacking/run-tests.md)
