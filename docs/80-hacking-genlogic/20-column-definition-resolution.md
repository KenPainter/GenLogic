Previous: [Non-Subvertible](10-non-subvertible.md)

# Column Definition Resolution

This document explains how GenLogic resolves column
definitions, particularly when combining reusable columns
with local overrides and foreign key definitions.

## Overview

Column definition resolution happens in
`src/new-schema.ts:processColumn()` and follows a strict
order of operations:

1. **Base Resolution** - Resolve reusable column references
2. **Constant Substitution** - Replace ${CONSTANT_NAME} placeholders
3. **FK Parsing** - Convert FK shorthand to parent PK definition
4. **SQL Parsing** - Parse the final SQL definition string
5. **Formula/Automation** - Parse calculated column
   expressions

## Base Resolution (Reusable Columns)

### The Spread Operation

When a column uses `base:`, properties are merged using
JavaScript spread:

```typescript
resolvedCol = { ...baseCol, ...localProps }
```

This means:
- Base properties are copied first
- Local properties override base properties
- The `definition` field gets special handling (see below)

### Definition Override vs. Append

**Critical Decision Point**: Does the local `definition`
start with a modifier keyword?

**Modifier Keywords**: `['default', 'not null', 'null',
'unique', 'check', 'references']`

**If YES** → **Append** local to base:
```yaml
columns:
  amount-column:
    definition: numeric(10,2)

tables:
  accounts:
    columns:
      balance:
        base: amount-column
        definition: default 0.00  # Starts with "default"

# Result: "numeric(10,2) default 0.00"
```

**If NO** → **Replace** base with local:
```yaml
columns:
  id-column:
    definition: serial primary key

tables:
  test:
    columns:
      custom_id:
        base: id-column
        # Starts with "integer" (not a modifier)
        definition: integer unique

# Result: "integer unique" (serial primary key replaced)
```

**Code Reference**: `src/new-schema.ts:242-256`

## Foreign Key Resolution

### FK Syntax

Foreign key definitions use the shorthand:
`FK parent_table [modifiers]`

**Supported Modifiers** (order independent):
- `not null` - Makes FK required
- `default <value>` - Sets default FK value
- `delete cascade|restrict|set null|set default|no action`
  - ON DELETE behavior
- `auto create parent` - GenLogic row automation feature

### FK Parsing Process

**Step 1**: Remove modifiers from definition string
(order independent)
```yaml
column: FK parents not null default 1 delete cascade
# After removing modifiers, remains: "parents"
```

**Step 2**: Validate remaining string
- Must be a single word (parent table name)
- Must reference an existing table
- Parent table must have a primary key

**Step 3**: Replace FK definition with parent PK definition
```yaml
# Parent table:
categories:
  columns:
    category_id: serial primary key

# Child table:
products:
  columns:
    category_id: FK categories not null

# Result after FK parsing:
# category_id: integer not null
# (serial → integer, FK constraint stored separately)
```

**Code Reference**: `src/new-schema.ts:414-533`

## Combining Reusable Columns with FK

### Scenario 1: Reusable FK Base, Append Modifiers

**Works as expected** - modifiers append:

```yaml
columns:
  parent-ref:
    definition: FK categories

tables:
  products:
    columns:
      category_id:
        base: parent-ref
        definition: not null default 1

# Resolution:
# 1. Base resolution:
#    "FK categories" + "not null default 1"
#    → "FK categories not null default 1"
# 2. FK parsing: Extracts modifiers, parent table
#    → "integer not null default 1"
```

### Scenario 2: Reusable FK Base, Replace Parent Table

**Surprising behavior** - FK parent is replaced:

```yaml
columns:
  parent-ref:
    definition: FK categories

tables:
  products:
    columns:
      category_id:
        base: parent-ref
        # Starts with "FK" (not a modifier!)
        definition: FK other_table

# Resolution:
# 1. Base resolution:
#    "FK" is NOT a modifier keyword → REPLACES
# 2. Result: "FK other_table" (categories is gone)
# 3. FK parsing: Points to other_table
```

**Why?** "FK" is not in the modifier keyword list, so it
follows the "replace" rule.

**Is this correct?** Technically yes - behavior is
consistent with the rule. But it can be surprising because
users might expect:
- An error ("can't specify two parent tables")
- FK to be treated as a modifier

### Scenario 3: Reusable Type Base, Add FK

**Replaces type with FK**:

```yaml
columns:
  id-column:
    definition: integer

tables:
  test:
    columns:
      parent_id:
        base: id-column
        definition: FK parents

# Resolution:
# 1. Base resolution:
#    "FK" is not a modifier → REPLACES "integer"
# 2. Result: "FK parents"
# 3. FK parsing: integer type comes from parent's PK
```

This works but might confuse users who thought they were
extending `integer`, not replacing it.

## Edge Cases

### Conflicting Defaults

**Detected and rejected**:

```yaml
columns:
  fk-col:
    definition: FK parents default 1

tables:
  test:
    columns:
      parent_id:
        base: fk-col
        definition: default 2  # Modifier, so appends

# After append: "FK parents default 1 default 2"
# FK parser extracts first default, then sees
# "default 2" in remainder
# ERROR: "Invalid FK definition. After removing
# modifiers, unrecognized content remains"
```

**Good!** Conflicting specifications are caught.

### Parent PK Already Has Default

**Handled safely**:

```typescript
// From FK parser (line 519):
if (defaultValue && !/\bdefault\b/i.test(newDefinition)) {
  newDefinition += ` default ${defaultValue}`;
}
```

FK default is only added if parent PK definition doesn't
already contain "default".

### Multiple Word Parent Table Name

**Properly rejected**:

```yaml
# Space in name after modifier removal
column: FK parent table

# ERROR: "Invalid FK definition. After removing
# modifiers, unrecognized content remains"
```

## Constant Substitution

Constants are replaced **before** FK parsing:

```yaml
constants:
  DEFAULT_CATEGORY: 1

tables:
  products:
    columns:
      category_id: FK categories default ${DEFAULT_CATEGORY}

# After constant substitution: "FK categories default 1"
# Then FK parser extracts "default 1"
```

**Order matters!** Constants must be resolved before
FK parsing.

## Rationality Analysis

**Is the current behavior rational, uniform, and
decidable?**

✅ **Rational**: Yes - follows clear, consistent rules
✅ **Uniform**: Yes - same logic applies to all columns
✅ **Decidable**: Yes - behavior is predictable from rules
⚠️ **Surprise-Free**: Mostly, but FK replacement
(Scenario 2) can surprise users

## Current Implementation Assessment

### Strengths

1. **Clear Order of Operations** - Each step has a
   defined input/output
2. **Consistent Rules** - Same merge logic everywhere
3. **Good Error Detection** - Catches malformed FKs,
   conflicting modifiers
4. **Testable** - Behavior is deterministic

### Potential Issues

1. **FK is not a modifier** - Users might expect `FK` to
   append or error when used with reusable FK base
2. **Type replacement when adding FK** - Could confuse
   users expecting to extend a type column with FK
   behavior
3. **No validation** that base + local combination makes
   semantic sense

## Examples Summary

```yaml
columns:
  amount: numeric(10,2)
  fk-cat: FK categories
  id: serial primary key

tables:
  test:
    columns:
      # Append (starts with modifier):
      col1:
        base: amount
        definition: default 0.00
      # Result: "numeric(10,2) default 0.00" ✅

      col2:
        base: fk-cat
        definition: not null
      # Result: "FK categories not null"
      #         → "integer not null" ✅

      # Replace (doesn't start with modifier):
      col3:
        base: amount
        definition: integer
      # Result: "integer" (numeric(10,2) lost) ⚠️

      col4:
        base: fk-cat
        definition: FK other_table
      # Result: "FK other_table" (categories replaced) ⚠️

      col5:
        base: id
        definition: FK parents
      # Result: "FK parents" (serial PK replaced) ⚠️
```

## Testing Coverage

**Well Tested**:
- Basic reusable columns
  (`tests/schema-reusable-tokens/7b1-basic-reusable-columns.md`)
- Reusable with modifier extensions
  (`tests/schema-reusable-tokens/7b2-reusable-with-extensions.md`)
- FK with modifiers (scattered across tests)

**Not Explicitly Tested**:
- Reusable FK base + FK override (Scenario 2)
- Reusable type base + FK replacement (Scenario 3)
- Conflicting defaults via reusable + local

## Discussion Points

1. **Should "FK" be treated as a modifier?** Would
   require semantic change and unclear meaning
2. **Should FK replacement be an error?** Would prevent
   Scenario 2 (might be desirable)
3. **Should we warn on type replacement?** Could help
   users catch mistakes
4. **Do we need more tests?** To cover the surprising
   scenarios

---

Previous: [Non-Subvertible](10-non-subvertible.md)
