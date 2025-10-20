# GenLogic Documentation

## Installation and Usage

1. [Installation](10-installation-and-usage/00-installation.md)
2. [Configure Postgres](10-installation-and-usage/10-configure-postgres.md)
3. [CLI Usage](10-installation-and-usage/20-cli-usage.md)

## GenLogic Schema Syntax for standard SQL

1. [Introduction](70-integrity-features/00-introduction.md)
1. [Tables and Columns](20-schema-syntax/10-tables-and-columns.md) 
1. [Column Types](20-schema-syntax/11-column-types.md)
1. [Reusable Columns](20-schema-syntax/12-reusable-columns.md)
1. [Label, Format, and Comment](20-schema-syntax/13-label-format-comment.md)
1. [Foreign Keys](20-schema-syntax/20-foreign-keys.md)
1. [Indexes and Unique Constraints](20-schema-syntax/30-indexes-and-constraints.md)

## Column Automations Syntax

1. [Moving Values from Parent to Child](30-column-automation/10-parent-to-child.md)
1. [Calculating Values Within a Row](30-column-automation/20-calculate-within-row.md)
1. [Moving Values from Child to Parent](30-column-automation/30-child-to-parent.md)

## Row and Automation Syntax

1. [Auto-Creating Parent Rows](40-row-automation/10-auto-create-parent.md)
1. [Syncing Parent to Children 1:1](40-row-automation/30-sync-to-children.md)
1. [Spreading Parent to Multiple Children](40-row-automation/20-spread-to-children.md)

## Other Schema Features

1. [Pattern Matching Tables](50-other-schema/10-matching-tables.md)
1. [Seed Data](50-other-schema/20-seed-data.md)


## Data Integrity Features

1. [Introduction](70-integrity-features/00-introduction.md)
1. [Schema Validation](70-integrity-features/10-schema-validation.md)
4. [Numeric Integrity](70-integrity-features/20-numeric-integrity.md)
2. [Calculation Integrity](70-integrity-features/30-calculation-integrity.md)
3. [Additive Changes Only](70-integrity-features/40-additive-changes.md)

## Application Development Features

1. [IDE Support](90-application/10-ide-support.md)
1. [Resolved Schema](90-application/20-resolved-schema.md)

## Hacking GenLogic

1. [Running Tests](95-hacking/run-tests.md)
