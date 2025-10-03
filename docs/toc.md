# GenLogic Documentation

This directory contains comprehensive examples and documentation for GenLogic schema definition language.

## Table of Contents

### Core Documentation
- [Design Documentation](design.md) - Core philosophy and data flow concepts
- [Calculated Columns](calculated-columns.md) - Expression-based column calculations
- [Consolidated Triggers](consolidated-triggers.md) - Trigger architecture and execution order
- [NULL Handling Guide](null-handling-guide.md) - How GenLogic handles NULL values in automation
- [UI Notes Guide](ui-notes-guide.md) - Table-level UI guidance metadata
- [Test Guide](test-guide.md) - Testing framework and validation

### Basic Examples
- [Minimal Schema](examples/basic/minimal-schema.md) - The simplest possible GenLogic schema with reusable columns and a basic table
- [Simple Blog](examples/basic/simple-blog.md) - Basic blog structure with users, posts, and categories
- [Type Showcase](examples/basic/type-showcase.md) - Comprehensive demonstration of all GenLogic data types

### Inheritance Examples
- [String Inheritance](examples/inheritance/string-inheritance.md) - Simple string-based column inheritance
- [Ref Inheritance](examples/inheritance/ref-inheritance.md) - Reference-based inheritance using $ref syntax
- [Null Inheritance](examples/inheritance/null-inheritance.md) - Inheriting columns with null values
- [Mixed Inheritance](examples/inheritance/mixed-inheritance.md) - Combining different inheritance patterns

### Foreign Key Examples
- [Simple Foreign Key](examples/foreign-keys/simple-foreign-key.md) - Basic foreign key relationships
- [Multiple Foreign Keys](examples/foreign-keys/multiple-foreign-keys.md) - Tables with multiple foreign key relationships
- [Composite Foreign Keys](examples/foreign-keys/composite-foreign-keys.md) - Foreign keys referencing composite primary keys
- [Self-Referencing](examples/foreign-keys/self-referencing.md) - Tables that reference themselves (hierarchical data)
- [Cascading Actions](examples/foreign-keys/cascading-actions.md) - CASCADE, RESTRICT, SET NULL actions


### Automation Examples
- [SUM Automation](examples/automations/sum-automation.md) - Automatically calculate totals from child records
- [COUNT Automation](examples/automations/count-automation.md) - Automatically count related records
- [MAX/MIN Automation](examples/automations/max-min-automation.md) - Track maximum and minimum values
- [LATEST Automation](examples/automations/latest-automation.md) - Copy most recent values from child records
- [Multiple Automations](examples/automations/multiple-automations.md) - Efficient consolidation of multiple instances of automation


### Complex Examples
- [Blog Platform](examples/complex/blog-platform.md) - Full-featured blog with users, posts, comments, categories, and social features
- [E-commerce System](examples/complex/e-commerce-system.md) - Comprehensive e-commerce with products, customers, orders, and inventory
- [Financial Tracking](examples/complex/financial-tracking.md) - Financial system with accounts, transactions, budgets, and reporting

### Edge Cases
- [NULL Handling](examples/edge-cases/null-handling.md) - How GenLogic automation handles NULL values correctly
- [Circular References](examples/edge-cases/circular-references.md) - Circular dependencies and validation rules
- [Performance Considerations](examples/edge-cases/performance-considerations.md) - Performance scenarios and optimization strategies
- [Schema Evolution](examples/edge-cases/schema-evolution.md) - Handling schema changes and migrations

## Getting Started

1. Start with the [Minimal Schema](examples/basic/minimal-schema.md) to understand basic concepts
2. Explore [Type Showcase](examples/basic/type-showcase.md) to see all available data types
3. Learn about column inheritance with [String Inheritance](examples/inheritance/string-inheritance.md)
4. Understand automation with [SUM Automation](examples/automations/sum-automation.md)
5. Study complex relationships with [Simple Foreign Key](examples/foreign-keys/simple-foreign-key.md)

## Advanced Topics

For production use, review the [Edge Cases](#edge-cases) section to understand:
- NULL value handling
- Performance characteristics
- Schema migration strategies
- Circular reference validation