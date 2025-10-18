# GenLogic

GenLogic is a tool for creating Postgres databases that implement business
logic.  This business logic exploits data paths that are inherently present
in a normalized database, namely the foreign key.  GenLogic allows the
user to specify the flow of values up and down through foreign keys
as data channels.  With the added ability to calculate derived
values within rows, GenLogic allows a declarative and single source
of truth for business logic in a postgres database.

The author calls this "Augmented Normalization" - there is a normalized
foundation for externally supplied values that is augmented with
derived values.

This produces three major simplifications for application development:
- Declarative business logic in the database layer
- No ORM is needed
- Simplified SQL statements in the middleware

This project is the spiritual descendant of [Andromeda](https://github.com/Andromeda-Project/andromeda),
originally written by [Ken Downs](https://github.com/KenPainter) 
in 2002 in PHP, and then maintained 
by [Donald Organ](https://github.com/dorgan/) up until about 2012. GenLogic is
a complete rewrite in Typescript.

## Licensing

Licensed under the Affero GPL 3.  See [LICENSE.md](./LICENSE.md).

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


