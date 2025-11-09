# GenLogic

GenLogic is a tool for creating Postgres databases with embedded business
logic.  This business logic exploits data paths that are inherently present
in a normalized database, namely the foreign key.  GenLogic allows the
user to specify the flow of values up and down through foreign keys
as data channels.  With the added ability to calculate derived
values within rows, GenLogic allows a declarative and single source
of truth for business logic in a postgres database.

The author calls this "Augmented Normalization" - there is a normalized
foundation for externally supplied values that is augmented with
derived values.

The use case is read-heavy databaseses, where the "pay me now" decision
to update values on writes is cost effective because the major simplication
of the development stack and process is not threatened by the differing
needs of a write-heavy database.  The author's experience in database
apps heavily leans to read-heavy line-of-business apps, and that is why
he wrote this tool.

This produces a few major simplifications for application development:
- Declarative business logic as part of the schema
- Business logic is validated and cannot be subverted
- Simpler DML in the client app
- No ORM in the client app

This project is the spiritual descendant of [Andromeda](https://github.com/Andromeda-Project/andromeda),
originally written by [Ken Downs](https://github.com/KenPainter) 
in 2002 in PHP, and then maintained 
by [Donald Organ](https://github.com/dorgan/) up until about 2012. GenLogic is
a complete rewrite in Typescript.

## Platforms

The author uses Linux exclusively for dev and production.  GenLogic
uses peer authentication, which can only work on Mac and Linux. 

Windows use is not supported.

## Licensing

Licensed under the Affero GPL 3.  See [LICENSE.md](./LICENSE.md).

The AGPL means you CAN use GenLogic in a build pipeline for any
database for any purpose.

The AGPL means you CANNOT build a network-available database
building tool on top of GenLogic without providing the full source
code of GenLogic and your tool.

Contact the author at kendowns@protonmail.com for commercial 
licensing options.

## Using GenLogic

All user documentation is in the [Table of Contents](./docs/toc.md).

## Hacking GenLogic

The use of an AI assistant is assumed, though officially neither
encouraged nor discouraged.  The author uses Claude Code.

The directory [ai-docs](./ai-docs/) contains the substantive
context for people and AI assistants wishing to hack GenLogic.

The [claude skills directory](./.claude/skills) directory contains
skills that the author finds useful for keeping the AI assistant
on track, but they are just pointers
to files in [ai-docs](./ai-docs).  

The split between pointers in `.claude` and substance in
`./ai-docs` allows the skills to be ported to something like
CoPilot instructions or prompts if another contributor wishes
to do so.

## Potential TO-DO List

Before Release 1.0:
- table check constraints keep getting rebuilt because
  postgres is adding parens even in the nested portions
  of the constraint definition.  Can probably use the ast
  parser which seems to do most of this for free, and then
  do a string compare of stringified output.
- MAJOR: Reduce child->parent updates to a single update,
  right now it is update-per-column, very in-elegant
  and bad for performance.
- Replace add-navigation.mjs with a general reconciler
  that looks for widows and orphans in both docs and
  tests/
- re-run risks analysis, like bad data in a spread
  creating an infinite loop.  Resolve and block
  all corrupt data paths.
- Determine if the LAST_VALUE can be discerned if a
  column is added to a database that already has
  data in it.

Anytime sorta-kinda maybe someday:
- Support views
- Write a "drop script" (but do not execute) that will
  drop unused tables and columns.
- Separate project: genlogic-db, convenient client app
  that does all of the SQL generation.
- Separate project: genlogic-routes, dynamically creates
  routes for all tables and actions.


