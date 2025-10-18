# Database Integrity

GenLogic builds Postgres database using standard integrity
mechanisms like primary keys and foreign keys.

However, because GenLogic expands on what is normally found
in a database, GenLogic itself must provide additional
mechanisms to gaurantee the integrity of the values we
are responsible for.

A user must be able to rely on the integrity of all of
our additional features with the same confidence that they
rely on the most basic Postgres features like primary
key and unique key enforcement.

## Additive Changes Only

Our system of additive changes only (documented elsewhere) ensures
that GenLogic can not, in any code path, destroy data.  


## Non-subvertible Calculated Columns

It must not be possible for a client to corrupt calculated
values (automated and generated) by directly inserting or
updating those values.  Calculated values must alway reflect
the formulas that define them.

Protection is enforced through a combination of database permissions
and trigger guards. This requires GenLogic to run as a privileged
setup user with CREATEROLE privilege. See [database-connections.md](database-connections.md)
for the two-user model.

INSERT operations: BEFORE INSERT triggers reset all automated columns
to NULL, preventing external insertion of calculated values. See
[trigger-generator.ts](../src/trigger-generator.ts) method
`generateAutomatedColumnProtection`.

UPDATE operations: Column-level UPDATE permissions are revoked for
automated columns. Users cannot execute UPDATE statements that modify
these columns. See [permissions-generator.ts](../src/permissions-generator.ts)
method `generateColumnPermissions`.

GenLogic's own triggers execute as SECURITY DEFINER with elevated
privileges, allowing automation to update protected columns. The
privileged role is named `<database_name>_genlogic_admin` to prevent
cross-database spillover. See [trigger-generator.ts](../src/trigger-generator.ts)
for SECURITY DEFINER implementation.

Automated columns are identified by presence of `automation` or
`generated` properties in the processed schema. See
[trigger-generator.ts](../src/trigger-generator.ts) method
`getAutomatedColumns`.

## Valid Inputs

We must protect against NULL and "NaN pollution" in numeric
values.

