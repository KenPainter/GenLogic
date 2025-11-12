# Plan: FK Parens Syntax and Definition String Consolidation

## End State

Definition string syntax for column specifications:

```yaml
# Standard SQL:
column_name: type [modifiers]

# FK shorthand (with parens):
column_name: FK(parent_table) [fk_modifiers]

# Calculated columns (object form):
column_name:
  definition: type [modifiers]
  formula: "expression"
  # or
  automation: AGG(fk_name) table.column
```

## Element Reference Table

| Element | Normal | Reusable | FK | Notes |
|---------|--------|----------|-----|-------|
| Type | Yes | Yes | No | Inferred from parent PK |
| primary key | Yes | Yes | No | One per table |
| not null | Yes | Yes | Yes | Requires value |
| null | Yes | Yes | Rare | Explicit nullable |
| unique | Yes | Yes | Rare | Unique constraint |
| default | Yes | Yes | Yes | Default value |
| check | No | No | No | Unimplemented at this time |
| references | No | No | No | Use FK shorthand instead |
| delete action | No | No | Yes | ON DELETE behavior |
| auto create parent | No | No | Yes | GenLogic automation |

## Benefits

- FK parent table unambiguously delimited by parens
- Consistent with automation syntax: SUM(fk_name)
- Simplifies parser (no order-dependent modifier extraction)
- String form for structural columns, object form for calculated
- Future-proof for optional FK parameters
- Cleaner token-based parsing possible

## Breaking Changes

Old syntax no longer valid:
```yaml
# Old:
customer_id: FK customers not null

# New:
customer_id: FK(customers) not null
```

Migration: `sed -i 's/FK \([a-z_][a-z0-9_]*\)/FK(\1)/g' *.yaml`

## Code Tasks

1. Update FK parser in src/new-schema.ts:parseFKDefinition()
   - Change regex to match FK(table_name)
   - Extract parent table from parens
   - Parse remaining modifiers
   - Error on old "FK space" syntax

2. Update FK detection in src/new-schema.ts:processColumn()
   - Change check from .startsWith('FK') to match FK(...)

3. Update error messages referencing FK syntax

## Documentation Tasks

1. docs/80-hacking-genlogic/30-definition-string-elements.md
   - Already has new syntax
   - Mark check as "unimplemented at this time"

2. docs/80-hacking-genlogic/20-column-definition-resolution.md
   - Update all FK examples to use parens
   - Update line references if code changes

3. docs/20-tables-and-columns/20-primary-and-foreing-keys.md
   - Update FK syntax examples

4. docs/20-tables-and-columns/10-tables-and-columns.md
   - Update FK examples

5. docs/70-reference/10-tables-and-columns-reference.md
   - Update FK syntax reference
   - Update all examples

6. docs/70-reference/error-messages.md
   - Update FK error message examples

7. docs/40-row-automations/auto-create-parent.md
   - Update FK syntax

8. docs/50-seed-data/seed-data.md
   - Update FK examples in seed rows

9. All other docs with FK examples:
   - docs/13-getting-started/
   - docs/30-column-automations/
   - docs/60-advanced/

## Test Tasks

All test files with FK syntax need updates. Major categories:

1. tests/core-relational/*.md
   - All FK definitions

2. tests/column-automations/*.md
   - FK definitions and automation syntax

3. tests/seed-rows/*.md
   - FK definitions in seed data

4. tests/row-automations/*.md
   - FK definitions with auto create parent

5. tests/schema-errors/*.md
   - FK error cases

6. tests/schema-reusable-tokens/*.md
   - Reusable FK columns

7. Test runner infrastructure
   - tests/go-right-runner.ts - if it validates syntax

8. Example schemas
   - Any .yaml files in tests/ or project root

Search strategy: `grep -r "FK " tests/ docs/` to find all occurrences

## Validation

After implementation:
- All tests pass
- No "FK " (space after FK) remains in any YAML
- Error message shows correct syntax: FK(table_name)
- Documentation examples all use FK(parent_table)

## Implementation Order

1. Update code (FK parser and detection)
2. Update tests (enables validation)
3. Update documentation (user-facing)
4. Verify no old syntax remains
