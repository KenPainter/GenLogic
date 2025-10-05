# GenLogic Documentation

This directory contains comprehensive documentation for GenLogic schema definition language.

## Table of Contents

### GenLogic Schema Syntax
1. [Single Table Basics](schema-syntax/01-single-table.md) - Creating a simple table with all column types
2. [Reusable Columns](schema-syntax/02-reusable-columns.md) - Column inheritance with string, null, and $ref methods
3. [Foreign Keys](schema-syntax/03-foreign-keys.md) - Establishing relationships between tables
4. [Moving Values from Parent to Child](schema-syntax/04-parent-to-child.md) - FOLLOW automation
5. [Calculating Values Within a Row](schema-syntax/05-calculated-columns.md) - Expression-based calculations
6. [Moving Values from Child to Parent](schema-syntax/06-child-to-parent.md) - Aggregation automations
7. [Pattern Matching Tables](schema-syntax/07-matching-tables.md) - Rule-based categorization with specificity ranking

### Building and Updating a Database
1. [CLI Usage](building-database/01-cli-usage.md) - Command-line interface usage and options
2. [Seed Data](building-database/02-seed-data.md) - Loading seed data with foreign key resolution

### Development Utilities
1. [Documentation Navigation Links](development/01-navigation-links.md) - Adding navigation to documentation
2. [Test Guide](development/02-test-guide.md) - Testing framework and validation
3. [Test Coverage Matrix](development/03-test-coverage-matrix.md) - Source code to test and documentation mapping

### Database Architecture
1. [Design Documentation](architecture/design.md) - Core philosophy and data flow concepts
2. [Consolidated Triggers](architecture/consolidated-triggers.md) - Trigger architecture and execution order
3. [NULL Handling](architecture/null-handling.md) - NULL value handling in automation

### Code Architecture
- [Trigger Generator](guides/trigger-generator.md) - Deep dive into trigger generation and automation

### Reference Examples
- [Minimal Schema](examples/basic/minimal-schema.md) - The simplest possible GenLogic schema
- [Simple Blog](examples/basic/simple-blog.md) - Basic blog structure
- [Type Showcase](examples/basic/type-showcase.md) - All GenLogic data types
- [String Inheritance](examples/inheritance/string-inheritance.md) - String-based column inheritance
- [Ref Inheritance](examples/inheritance/ref-inheritance.md) - Reference-based inheritance using $ref
- [Null Inheritance](examples/inheritance/null-inheritance.md) - Inheriting columns with null values
- [Mixed Inheritance](examples/inheritance/mixed-inheritance.md) - Combining inheritance patterns
- [Simple Foreign Key](examples/foreign-keys/simple-foreign-key.md) - Basic foreign key relationships
- [Multiple Foreign Keys](examples/foreign-keys/multiple-foreign-keys.md) - Multiple foreign key relationships
- [Composite Foreign Keys](examples/foreign-keys/composite-foreign-keys.md) - Composite primary key references
- [Self-Referencing](examples/foreign-keys/self-referencing.md) - Hierarchical data
- [Cascading Actions](examples/foreign-keys/cascading-actions.md) - CASCADE, RESTRICT, SET NULL
- [SUM Automation](examples/automations/sum-automation.md) - Calculate totals from child records
- [COUNT Automation](examples/automations/count-automation.md) - Count related records
- [MAX/MIN Automation](examples/automations/max-min-automation.md) - Track maximum and minimum values
- [LATEST Automation](examples/automations/latest-automation.md) - Copy most recent values
- [Multiple Automations](examples/automations/multiple-automations.md) - Consolidation of multiple automations
- [Blog Platform](examples/complex/blog-platform.md) - Full-featured blog
- [E-commerce System](examples/complex/e-commerce-system.md) - Comprehensive e-commerce
- [Financial Tracking](examples/complex/financial-tracking.md) - Financial system
- [NULL Handling](architecture/null-handling.md) - NULL value automation
- [Circular References](examples/edge-cases/circular-references.md) - Circular dependencies and validation
- [Performance Considerations](examples/edge-cases/performance-considerations.md) - Performance scenarios
- [Schema Evolution](examples/edge-cases/schema-evolution.md) - Schema changes and migrations

