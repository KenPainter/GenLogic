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

The author uses Linux exclusively for dev and production.  

## Licensing

Licensed under the Affero GPL 3.  See [LICENSE.md](./LICENSE.md).

The AGPL means you CAN use GenLogic in a build pipeline for any
datababase for personal or business use, without providing source,
if that project is NOT itself
a network available database building tool.

The AGPL means you CANNOT build a network-available database
building tool on top of GenLogic without providing the full source
code of GenLogic and your tool.

Contact the author at kendowns@protonmail.com for commercial 
licensing options.

## Using GenLogic

All user documentation is in the [Table of Contents](./docs/toc.md).

## Potential TO-DO List

Release plan:
- (current) Tests: 0.98.x 
- Docs: 0.99.x
- Everything else: 0.99.x
  - final dead code removal

Then: 1.0

Some thoughts and to-do items
- document or prevent corruption of automation columns
- consider preventing SQL keywords as column names
- Replace add-navigation.mjs with a general reconciler
  that looks for widows and orphans in both docs and
  tests/

For 1.1 if we ever need them
- row level security 
  - case 1: seed rows
  - case 2: groups on tables
- column check constraints

