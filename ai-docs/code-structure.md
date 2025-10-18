# GenLogic Architecture

GenLogic is a cli utility.

Flow is straight linear from one stage to the next.  The
stages are fixed and immutable, optimized to follow the 
natural structure of a GenLogic schema.  File names can
be reliably linked to in docs because they are not going to
change.

The entry point is [cli.ts](../src/cli.ts).

The GenLogic schema syntax favors magic over explicitness.
This is a clearly stated preference of the author, who desires
the terse syntax over more explicit solutions.  For the architecture,
this means GenLogic must do extra work to fill in the blanks
that the user has left out.

## Stages

The processing pipeline is implemented in [processor.ts](../src/processor.ts)
in the `process()` method. All stages execute linearly in order.

### CLI Parameter Validation

In [cli.ts](../src/cli.ts) GenLogic validates that the
command line parameters are sufficient to allow it to
proceed. Required parameters are database name, username,
and schema file path.

### Load and Parse YAML

Implemented in [processor.ts](../src/processor.ts).

GenLogic loads the schema file and parses it from YAML
into an object structure. This stage fails fast if the
file does not exist or contains invalid YAML syntax.

### Schema Syntax Validation

Implemented in [validation.ts](../src/validation.ts).

GenLogic validates that the parsed schema matches the
rules defined in the [JSON schema](../src/genlogic-schema.json).
This validation is handled by the SchemaValidator class
and uses the AJV library for JSON schema validation.

### Database Connection

Implemented in [database.ts](../src/database.ts).

GenLogic connects to PostgreSQL using Unix socket trusted
connections. The DatabaseManager attempts to connect to
the postgres database first. If the target database does
not exist, it creates the database automatically before
proceeding.

### Build Reusable Columns Store

Implemented in [schema-processor.ts](../src/schema-processor.ts).

The SchemaProcessor builds a map of all reusable column
definitions from the schema's top-level columns section.
These are used later when processing table columns that
reference them.

### Build Foreign Key Graph

Implemented in [graph.ts](../src/graph.ts).

The DataFlowGraphValidator builds a directed graph of all
tables connected by foreign keys. It then runs cycle detection
to fail fast if circular dependencies exist. After validation,
it assigns each table to a topological layer number based on
its depth in the dependency graph.

### Process Schema by Layers

Implemented in [schema-processor.ts](../src/schema-processor.ts).

The schema is processed and validated at the same time,
stepwise through the various processing stages.

Because the schema describes a Directed Acyclic Graph of
tables connected by foreign keys, and because GenLogic syntax
favors "magic" with defaults and inference, almost all processing
follows the topological order of the tables. This requires
elements of the schema file to be validated table-by-table,
and this is why it is inefficient and error prone to attempt
validation in a step that is separate from processing.

The SchemaProcessor processes tables layer by layer, starting
from tables with no foreign keys (layer 0) and proceeding upward.
For each table, it expands column definitions, resolves foreign
key references, and validates column types.

### Validate Automation Definitions

Implemented in [validation.ts](../src/validation.ts).

After all tables are processed, the SchemaValidator validates
that all automation definitions reference valid columns and
foreign keys. The current approach validates all automations in one pass for simplicity,
even though SNAPSHOT/SYNC could theoretically be validated earlier. The
separate pass is necessary for aggregations that reference child tables not
yet processed.


### Validate Content Sections

Implemented in [content-manager.ts](../src/content-manager.ts).

The ContentManager validates all seed-rows sections in the schema.
It checks that referenced tables and columns exist and that
foreign key references in seed data are valid.

### Database Introspection and Diffing

Implemented in [database.ts](../src/database.ts) and [diff-engine.ts](../src/diff-engine.ts).

The DatabaseManager queries the PostgreSQL system catalogs to
get the current state of all tables, columns, foreign keys,
indexes, and triggers. The DiffEngine compares the processed
schema against this current state to determine what changes
are needed.

### Drop Existing GenLogic Triggers

Implemented in [database.ts](../src/database.ts).

Before making any schema changes, GenLogic drops all existing
triggers that follow the GenLogic naming convention. This
ensures a clean slate before regenerating triggers from the
current schema definition.

### Generate SQL Statements

Implemented in [sql-generator.ts](../src/sql-generator.ts), 
[trigger-generator.ts](../src/trigger-generator.ts),
 [matching-generator.ts](../src/matching-generator.ts),
 and [content-manager.ts](../src/content-manager.ts).

Multiple generators create SQL statements in parallel:

- SQLGenerator produces DDL for tables, columns, foreign keys, and indexes
- TriggerGenerator creates trigger functions and triggers for all automations
- MatchingGenerator creates pattern matching functions for matching tables
- ContentManager generates INSERT statements for seed data

The statements are ordered to execute safely:

1. Drop all GenLogic triggers
2. Create new tables
3. Add columns to existing tables
4. Modify existing columns (widen only)
5. Clean up orphaned foreign key values
6. Add foreign key constraints
7. Create indexes
8. Add table and column comments
9. Create triggers
10. Create matching functions
11. Insert seed data

### Execute or Report

Implemented in [database.ts](../src/database.ts) and [processor.ts](../src/processor.ts).

In execute mode, the DatabaseManager runs all SQL statements
within a single transaction. If any statement fails, the entire
transaction is rolled back and no changes are applied.

In dry-run mode, the plan is dumped to stdout showing what
changes would be made, but no commands are executed against
the database.

### Generate Resolved Schema Documentation

Implemented in [resolved-schema-generator.ts](../src/resolved-schema-generator.ts).

After successful execution, GenLogic generates a TypeScript
file containing the fully resolved schema with all inferred
and expanded columns. This file is written to the same directory
as the source schema with a .ts extension.
