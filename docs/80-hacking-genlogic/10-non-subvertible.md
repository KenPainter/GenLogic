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
| UPDATE | Formula | Recalculates | Column-level GRANT | Protected |
| UPDATE | Aggregate | Nothing | Column-level GRANT | Protected |

## Why Two Mechanisms Are Required

**Trigger overwrites** are used for INSERT operations because PostgreSQL does not support column-level INSERT restrictions. All automated columns must allow INSERT permission, so triggers unconditionally overwrite user input to ensure correctness.

**Column-level GRANTs** are used for UPDATE operations to provide clear, explicit protection. All automated columns (SYNC, SNAPSHOT, Formula, Aggregate) deny UPDATE permission, causing immediate "permission denied" errors if users attempt to update them. This is superior to silent correction because:
- Users get explicit feedback about programming errors
- Single, consistent protection mechanism for all automated columns on UPDATE
- Simpler security model to understand and audit

**Default initialization** for aggregates on INSERT is required because:
- Parent table BEFORE INSERT trigger doesn't touch aggregation columns
- PostgreSQL doesn't support column-level INSERT restrictions
- Without initialization, user can insert bogus aggregation values for
  SUM and COUNT that persist because updates are deltas, not full queries
  of all children.

## Implementation Status

- ✅ Trigger overwrites for INSERT: Working (all 4 column types protected)
- ✅ Column-level GRANTs for UPDATE: Implemented in `src/helpers-ddl/permissions.ts` and wired into processor
- ✅ Aggregate initialization: Implemented in `src/helpers-ddl/triggers/initialize-aggregations.ts`

## Tests

Test suite: `tests/non-subvertible/`
- `10a1-insert-subversion-attempts.md` - Tests all 4 INSERT cases (SYNC, SNAPSHOT, Formula, Aggregate trigger overwrites)
- `10a2-update-subversion-attempts.md` - Tests all 4 UPDATE cases (SYNC, SNAPSHOT, Formula, Aggregate all blocked via permission denied)
