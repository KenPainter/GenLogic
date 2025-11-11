# Non-Subvertible Design

GenLogic prevents users from corrupting automated column values
through two complementary mechanisms.  

The system is not necessarily obvious by looking at the code,
so it is summarized here.

## Protection Mechanisms by Case

| Operation | Column Type | Trigger Behavior | Protection Mechanism | Status |
|-----------|-------------|------------------|---------------------|---------|
| INSERT | SYNC | Pulls from parent | Trigger overwrites | Protected |
| INSERT | SNAPSHOT | Pulls from parent | Trigger overwrites | Protected |
| INSERT | Formula | Calculates | Trigger overwrites | Protected |
| INSERT | Aggregate | Nothing | Default initialization | Protected |
| UPDATE | SYNC | Only if FK changes | Column-level GRANT | Protected |
| UPDATE | SNAPSHOT | Only if FK changes | Column-level GRANT | Protected |
| UPDATE | Formula | Recalculates | Trigger overwrites | Protected |
| UPDATE | Aggregate | Nothing | Column-level GRANT | Protected |

## Why Two Mechanisms Are Required

**Trigger overwrites** are sufficient when the trigger unconditionally sets the column value on every operation. User input is silently discarded - the trigger always wins.

**Column-level GRANTs** are necessary when triggers only recalculate conditionally:
- SYNC/SNAPSHOT on UPDATE: Only recalculates if FK changes
- Aggregates on UPDATE: Only recalculated by child table triggers
- Without permission restrictions, direct UPDATE with unchanged dependencies → bogus value persists

**Default initialization** for aggregates on INSERT is required because:
- Parent table BEFORE INSERT trigger doesn't touch aggregation columns
- PostgreSQL doesn't support column-level INSERT restrictions
- Without initialization, user can insert bogus aggregation values for
  SUM and COUNT that persist because updates are deltas, not full queries
  of all children.

## Implementation Status

- ✅ Trigger overwrites: Working (3 cases protected)
- ✅ Column-level GRANTs: Implemented in `src/helpers-ddl/permissions.ts` and wired into processor
- ✅ Aggregate initialization: Implemented in `src/helpers-ddl/triggers/initialize-aggregations.ts`

## Tests

Test suite: `tests/non-subvertible/`
- `10a1-insert-subversion-attempts.md` - Tests all 4 INSERT cases (SYNC, SNAPSHOT, Formula, Aggregate)
- `10a2-update-subversion-attempts.md` - Tests all 4 UPDATE cases (Formula overwrites, SYNC/SNAPSHOT/Aggregate permission denied)
