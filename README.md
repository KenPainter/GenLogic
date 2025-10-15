# GenLogic

GenLogic is a tool for creating Postgres databases that implement business
logic.  This business logic exploits data paths that are inherently present
in a normalized database, namely the foreign key.  By adding the ability to
derive values within a row (such as final = price * qty), and moving
values up and down foreign key paths, you get what the author
calls "Augmented Normalization" - a normalized foundation for external
values that automatically generates the denormalized calculated values.

This produces two major simplifications for application development:
* Declarative business logic in a single source of truth.
* No ORM in the stack - Middleware and UI can be destructered to views
  and actions on single tables.

There is one category of solution that GenLogic cannot provide,
which is the state-dependent allocation problem.  This is old-fashioned stuff like
MRP and ERP, basically anything where there is sequential processing
and resource consumption based on priority logic.  More simply, it cannot
work when there is no pure set-oriented one pass solution.

This project is the spiritual descendant of [Andromeda](https://github.com/Andromeda-Project/andromeda),
originally written by [Ken Downs](https://github.com/KenPainter) 
in 2002 in PHP, and then maintained 
by [Donald Organ](https://github.com/dorgan/) up until about 2012. GenLogic is
a complete rewrite in Typescript.

## Simple Notes on How it Works

GenLogic uses foreign keys to allow most automations, which involve copying
values from parent to child, creating extended values within a row, and
aggregating values from child to parent.

GenLogic validates for cycles in foreign key declarations, and for 
cycles in the calculations within a row.  Once a schema passes validation,
it diffs the schema against the current database and generates DDL to
update the database.  It then writes triggers to apply the business 
logic.  Finally, it writes a "resolved" schema loaded with notes
for an AI assistant to code SQL and generate UI's against the
database.

## Using GenLogic

All documentation is in the [Table of Contents](./docs/toc.md).

## Hacking GenLogic

In addition to the docs linked to above, you need [Contributing](./CONTRIBUTING.md).

## Status and Major TO-DO Items

General To-Do
- Consider replacing Bun postgres built-in with pg driver, allows tests
  and use on localhost w/trusted connections.
- Implement SNAPSHOT - parent to child only once on insert to child
- Better solution for AI assisants to write schema files.
- Implement subversion protection for automated columns


