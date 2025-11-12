# The Theory of GenLogic

GenLogic was born of the realization that a large class
of database applications allow the fuzzy term "business
logic" to collapse to very predictable patterns: calculated
values against a normalized relational database.

The author's experience up until about 2003 suggested that
life would be much simpler if this logic were encoded in
the database itself.  This would require a database builder
that could validate a schema and guarantee error-free execution
of said business logic.  So was born [Andromeda](https://sourceforge.net/projects/andro/)
in 2004, which was later reborn as this project, GenLogic, 
in 2025.

The complete system is styled as "Augmented Normalization",
where tables are normalized for incoming values, and augmented
with calculations at write time.  It is as if every table is
a materialized view, but they are never stale.

The calculations follow paths in the data established by
foreign keys:
- copies from parent to child
- calculations within a row
- aggregations pushed to parent from child

Some ideas from relational theory were "loosely borrowed":
- Just as a relational database is non-subvertible, GenLogic is
  non-subvertible - calculated values cannot be overwritten so 
  long as the application connects to the database with accounts
  that are not an admin role, such as:
  - <database>_genlogic_admin
  - database owner
  - PostgreSQL superuser
- Just as DDL defines tables and keys and constraints without
  the user needing to know how they are stored on disk, the
  calculated values are defined without the user needing to
  know how their integrity is maintained.

But some knowledge of internals is warranted.  GenLogic views
columns within tables as nodes in a Directed Acyclic Graph (DAG)
where the edges are formed by the dependencies that are explicit
in the calculations.  If line_total = qty * price, we have three
nodes and edges price->line_total and qty->line_total. As long
as the column Graph has no cycles, we can make a few assurances.

**Guaranteed Termination (strong)**: All calculations will complete in finite time.
This is mathematically guaranteed so long as we have proven that
we detect cycles.

**Guaranteed Determinism (with no random factors in formulas)**: Given the
same DML to the same database, 
calculated values always produce the same result.  As long as the
formulas do not include random factors, this is true because:
- calculations always execute in dependency order
- triggers complete before commit

**No Race Conditions**: No calculations or queries see inconsistent
internal state.  This is guaranteed by Postgres's transaction
model: BEFORE triggers complete atomically before the row is written, 
AFTER triggers see the committed state, and all calculations within a
transaction are isolated from other transactions.

The use of a Directed Acyclic Graph means that a GenLogic schema
is formally analyzable, though no effort has yet been made to demonstrate
it is formally verifiable. 

This was all done back in 2004, and again in 2025, for purely practical
reasons of productivity.
- a declarative syntax is easier to reason about
- YAML is easier (for the author) to write than DDL, and much
  easier to scan for details
- business logic is easier to maintain when its inherent strong coupling
  to the database is leveraged instead of being obscured by denial
- a tool that writes the code completes the value of the
  single declarative source of truth
- no ORM is needed, most DML is a single table write.
  All consequences of any 
  database write propogate completely with termination,
  determinism, and without race conditions.
- The stack above the database has no need of the many layers
  of abstraction bloat that seem to get worse every day.

Finally, in terms of performance, GenLogic is a "pay me now"
system, where we increase the cost of a write operation to avoid
race conditions and reduce the cost of development.  GenLogic
shines when (cost of writes) < cost(hardware + development + support).
