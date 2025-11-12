# Plan: Unified Column Definition Syntax

## End State

Definition string syntax for column specifications:

```yaml
# Standard SQL:
column_name: type [modifiers]

# FK shorthand (with parens):
column_name: FK(parent_table) [modifiers]

# Re-usable shorthand
column_name: reusable [modifiers]

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

## Code End State

Remove separate FK, reusable and "normal" branches.
Parse a column's definition string once in a unified parser.

### Single Parse Path

1. **Parse definition string to extract components:**
   - Match FK(parent_table) pattern? Extract parent table name
   - Match reusable column name? Look up and expand inline.  Match first and move on.
   - Otherwise parse as SQL type definition
   - Extract all modifiers (not null, unique, default, etc.)

2. **Validate combinations after parsing:**
   - Detect and report all invalid combinations
   - Build final column definition from validated components

3. **Store parsed results:**
   - Column type and constraints
   - FK relationships (if FK syntax used)
   - Formula/automation expressions (if calculated column)

### Invalid Combinations (New Errors)

**Definition string ambiguity:**
- Definition matches multiple reusable names (ambiguous reference)
  - see "match first and move on" above, this would be
    reported as unknown syntax.
- Old FK space syntax: `FK table` (must use `FK(table)`)
- Empty FK parentheses: `FK()` (must specify parent table)

**Type conflicts:**
- FK(parent) with explicit type specification (FK infers type from parent PK)
- FK(parent) with primary key modifier (FK references PK, cannot be PK)
- Reusable reference with explicit type (choose one or the other)

**Reusable column restrictions:**
- Reusable column cannot reference another reusable column (no chaining allowed)

**Calculated column conflicts:**
- Formula with default value (formula calculates, cannot have default)
- Automation with default value (system sets default, user cannot)
- Both formula AND automation (must be one or the other)

**Circular references:**
- Formula column dependencies that form a cycle (already detected)
- Automation dependencies that form a cycle (already detected)

### Error Message Updates

All error messages referencing FK syntax must show: `FK(table_name)`

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
