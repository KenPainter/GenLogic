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
the terse syntax of more solutions.  For the architecture,
this means GenLogic must do extra work to fill in the blanks
that the user has left out.

## Stages

### CLI Parms Validation

In [cli.ts](../src/cli.ts) GenLogic validates that the 
command line parameters are sufficient to allow it to
proceed.  Consult the code where necessary for more information.

### Schema Syntax Validation

In this stage we validate only that the loaded schema file
matches the rules in the [JSON schema](../src/genlogic-schema.json).

### Schema Processing and validation

The schema is processed and validated at the same time,
stepwise through the various processing stages.

Because the schema describes a Directed Acyclic Graph of
tables connected by foreign keys, and because GenLogic syntax
favors "magic" with defaults and inference, almost all processing
follows the topological order of the tables.  This requires
elements of the schema file to be validated table-by-table,
and this is why it is inefficient and error prone to attempt
validation in a step that is separate from processing.

The end result of a successful Schema processing and validation stage
is a fully populated and validated schema that can be 
used in the next stage.

### Database Writes

Given a validation and fully populated schema, GenLogic must
do two things.

First, it diffs the existing schema of tables and columns 
against the database to produce three types of additive
changes:
- new tables
- new columns in existing tables
- widened columns for data types NUMERIC, CHAR and VARCHAR

Then it writes the triggers that will be applied to all of
its tables.

In dry-run mode, the plan is dumped to stdout but the
commands are not executed.
