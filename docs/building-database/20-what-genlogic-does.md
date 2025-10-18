Previous: [CLI Usage](10-cli-usage.md) | Next: [Single Table Basics](../schema-syntax/01-single-table.md)

# What GenLogic Does In A Build

## Additive Principle

Genlogic first validates the provided schema, and while
doing so it builds a picture of the final database.

GenLogic compares the provided schema to the state of the
database and plans and executes additive changes only:
* Add new tables
* Add new columns
* Widen NUMERIC, CHAR and VARCHAR columns

GenLogic does not drop tables, drop columns or narrow
columns.

## Indexes

GenLogic automatically creates indexes on foreign keys.

## Ownership Principle

Apart from destructive actions that the adminstator may choose
to do, such as dropping defunct tables or columns, general
best practice is to let GenLogic "own" a database that it
modifies. 

## Use of Triggers

During a build GenLogic drops all triggers that it recognizes
as its own, and rewrites a new set of triggers.

GenLogic uses BEFORE triggers for actions that _pull_ from
a parent table, auto-create parent rows, and for actions that
generate values within a row. GenLogic writes a single BEFORE
trigger for each table on each of INSERT, UPDATE and DELETE.

GenLogic uses AFTER triggers for actions that _push_ to
other tables (SYNC, aggregrations, spread).  GenLogic writes
a single AFTER trigger for each table on each of
INSERT, UPDATE, and DELETE.

## A Note About Loops

GenLogic traps for cycles in foreign key definitions, and
also traps for cycles in generated values in a row.  For
this reason, _structural infinite cycles_ are not possible,
but under some circumstances  _logical infinite cycles_ 
may result from certain business logic constructions.

Imagine an order pulls in a discount
code from a customer, but after calculating the total, a rule
replaces the discount code because the order total exceeds
a certain value.  This discount code results in a lower total
that is below the threshold value, causing the discount code
to be discarded, and you have
an infinite loop.  To prevent these cases, calculations that
can cause "2nd pass" calculations should be based on values
that are not affected by the second pass.  In the example
given, two discount code columns would prevent the cycle.


---

Previous: [CLI Usage](10-cli-usage.md) | Next: [Single Table Basics](../schema-syntax/01-single-table.md)
