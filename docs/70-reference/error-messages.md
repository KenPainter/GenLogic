Previous: [Reference: Seed Rows](50-seed-data-reference.md) | Next: [Non-Subvertible Design](../80-hacking-genlogic/10-non-subvertible.md)

# Error Messages Reference

## Constants

Undefined constant: CONST_NAME
- Constant referenced but not defined in constants section.
- Add constant to constants section or fix reference.

Circular constant reference detected
- Constants reference each other in a loop.
- Remove circular dependency between constants.

## Column Definitions

Column has no definition
- Column specified without definition string.
- Add definition: `column_name: type` or `column_name: reusable_name`.

No type specified - column must have FK(), reusable reference, or SQL type
- Column definition is empty after parsing modifiers.
- Provide a type: `FK(table)`, reusable column name, or SQL type like `varchar(100)`.

Reusable column NAME has no definition
- Referenced reusable column exists but has no definition property.
- Add `definition:` property to the reusable column in `columns:` section.

Multiple reusable column references found: name1, name2
- Column definition references multiple reusable columns.
- Use only one reusable column per column definition.

Unknown PostgreSQL type: TYPE - do you need to define a reusable column 'TYPE'?
- Column definition uses unrecognized SQL type.
- Use valid PostgreSQL type (varchar, integer, numeric, etc.) or define as reusable column.

Invalid SQL type: TYPE
- Column type string cannot be parsed.
- Check SQL type syntax.

Unrecognized SQL modifiers: "text" in definition: varchar(100) text
- Definition contains unrecognized text after type.
- Remove invalid text. Valid modifiers: primary key, not null, default, unique.

## Column Automation and Formula

Column cannot have both automation and formula
- Column specifies both automation and formula properties.
- Remove one property. Use automation for aggregation/sync, formula for calculation.

Formula columns cannot have defaults - the value is calculated from other columns. Remove the 'default' specification.
- Formula column includes default value.
- Remove default from definition. Formula calculates value.

Automation columns cannot have user-specified defaults. Remove 'default' - the system will set appropriate defaults based on automation type.
- Automation column includes default value.
- Remove default from definition. Automation sets appropriate default.

SUM automation requires a numeric type, got: TYPE
- SUM or COUNT automation applied to non-numeric column.
- Change column type to numeric or use different automation.

Invalid SQL expression
- Formula or check constraint contains invalid SQL syntax.
- Fix SQL syntax error in formula or constraint.

Unknown column property: PROPERTY
- Column object contains unrecognized property.
- Remove invalid property. Valid: definition, automation, formula, label, format, comment.

## Foreign Keys

Multiple FK definitions found - only one FK() allowed per column
- Column definition contains multiple FK() references.
- Use only one FK() per column: `customer_id: FK(customers)`.

FK references non-existent table: TABLE
- FK references undefined table.
- Define parent table or fix FK reference.

FK references table TABLE which has no primary key
- FK references table without primary key.
- Add primary key to parent table.

Cannot specify explicit type when using FK: "text"
- FK definition includes additional type after FK().
- Remove explicit type. FK infers type from parent table's primary key.

Cannot combine FK with reusable column reference
- Column definition has both FK() and reusable column reference.
- Use either FK() or reusable column, not both.

FK columns cannot be primary keys - FK references a primary key, it is not one itself
- FK column marked as primary key.
- Remove primary key modifier from FK column.

DELETE action is only valid on FK columns
- Non-FK column has DELETE action modifier.
- Remove DELETE action or change column to FK.

AUTO CREATE PARENT is only valid on FK columns
- Non-FK column has AUTO CREATE PARENT modifier.
- Remove AUTO CREATE PARENT or change column to FK.

## Automations

Invalid automation syntax: TEXT
- Automation expression has invalid syntax.
- Use valid automation: SUM table.column, COUNT table.column, MAX table.column, MIN table.column, SYNC table.column, SNAPSHOT table.column.

Automation references non-existent table: TABLE
- Automation references undefined table.
- Define referenced table or fix automation reference.

## Tables

Unknown table property: PROPERTY
- Table object contains unrecognized property.
- Remove invalid property. Valid: columns, indexes, unique-constraints, constraints, seed-rows, comment.

## Seed Data

Seed row references non-existent column: COLUMN
- Seed row includes column not in table definition.
- Remove invalid column from seed-rows or add column to table.

## Check Constraints

Constraint references non-existent column: COLUMN
- Check constraint references undefined column.
- Add column to table or fix constraint reference.

## Unique Constraints

unique-constraints must be an array
- unique-constraints property is not array.
- Change to array of arrays: unique-constraints: [[col1, col2]].

Unique constraint references non-existent column: COLUMN
- Unique constraint includes undefined column.
- Add column to table or fix unique constraint.

## Indexes

indexes must be an array
- indexes property is not array.
- Change to array of arrays: indexes: [[col1, col2]].

Index must be an array of column names
- Individual index is not array.
- Change to array: indexes: [[col1, col2]] not indexes: [col1].

Index references non-existent column: COLUMN
- Index includes undefined column.
- Add column to table or fix index.

## Cycles

Cycle detected: table1 -> table2 -> table1
- Foreign key relationships form cycle.
- Remove one FK(to) break cycle or make one FK(nullable).

Cycle detected: table.col1 -> table.col2 -> table.col1
- Formula columns reference each other in loop.
- Remove circular dependency between formulas.

Cycle detected: table1.col1 -> table2.col2 -> table1.col1
- Automation dependencies form cycle.
- Remove circular dependency. Check SYNC/aggregation/formula chain.

---

Previous: [Reference: Seed Rows](50-seed-data-reference.md) | Next: [Non-Subvertible Design](../80-hacking-genlogic/10-non-subvertible.md)
