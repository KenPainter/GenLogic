# NULL Handling in GenLogic Resolved Schemas

## Overview

The resolved YAML schema now provides clear guidance to UI developers about NULL handling with two distinct fields:

For practical examples demonstrating NULL handling in various automation scenarios, see [examples/edge-cases/null-handling.md](examples/edge-cases/null-handling.md).

- `expect_null_on_read`: Will the UI ever see NULL when reading this column?
- `can_write_null`: Is the UI allowed to write NULL to this column?

This replaces the ambiguous `nullable` field with precise information for both read and write operations.

## Field Meanings

### `expect_null_on_read`

**`false`** - The UI will **never** see NULL when reading this column:
- Primary keys (auto-generated)
- Sequence columns (auto-generated)
- Aggregation automations (SUM, COUNT, MAX, MIN) - Have `DEFAULT 0`

**`true`** - The UI **may** see NULL when reading this column:
- Regular columns (nullable by default)
- FETCH/FETCH_UPDATES automations (NULL = not fetched yet)
- LATEST automations (NULL = no children yet)
- Calculated columns (depends on expression)
- Foreign key columns

### `can_write_null`

**`false`** - The UI **cannot** write NULL to this column:
- Primary keys
- Sequence columns (not writable at all)
- All automation columns (not writable at all)
- All calculated columns (not writable at all)

**`true`** - The UI **can** write NULL to this column:
- Regular columns
- Foreign key columns (NULL = no relationship)

## Examples

### 1. Aggregation Column (SUM)

```yaml
balance:
  type: numeric
  size: 15
  decimal: 2
  expect_null_on_read: false  # DEFAULT 0, never NULL
  can_write_null: false        # Not writable at all
  writable: never
  reason: database_automation
```

**UI Guidance:**
- ✅ Always expect a numeric value (never NULL)
- ❌ Never attempt to write to this column
- Display as: `123.45` (no NULL handling needed)

### 2. FETCH Automation

```yaml
fetched_description:
  type: varchar
  size: 100
  expect_null_on_read: true   # May be NULL if not fetched yet
  can_write_null: false        # Not writable at all
  writable: never
  reason: database_automation
```

**UI Guidance:**
- ⚠️  May be NULL (parent has no value or not fetched yet)
- ❌ Never attempt to write to this column
- Display as: `description ?? "(not set)"` (NULL handling needed)

### 3. Regular Column

```yaml
description:
  type: varchar
  size: 100
  expect_null_on_read: true   # User may not have provided value
  can_write_null: true         # User can explicitly set to NULL
  writable: always
```

**UI Guidance:**
- ⚠️  May be NULL (optional field)
- ✅ Can write NULL to clear the value
- Display as: `description ?? "(empty)"` (NULL handling needed)
- Save as: `NULL` or `"some value"`

### 4. Primary Key (Auto-increment)

```yaml
account_id:
  type: integer
  primary_key: true
  expect_null_on_read: false  # Always has a value
  can_write_null: false        # Not writable at all
  writable: never
  reason: auto_increment_sequence
```

**UI Guidance:**
- ✅ Always expect an integer value (never NULL)
- ❌ Never attempt to write to this column (omit on INSERT)
- Display as: `123` (no NULL handling needed)

### 5. Foreign Key Column

```yaml
parent_id:
  type: integer
  expect_null_on_read: true   # May be NULL (no relationship)
  can_write_null: true         # Can write NULL to remove relationship
  writable: always
  source: foreign_key_column
```

**UI Guidance:**
- ⚠️  May be NULL (no parent assigned)
- ✅ Can write NULL to remove the relationship
- Display as: `parent_id ?? "(no parent)"` (NULL handling needed)
- Save as: `123` or `NULL`

## Matrix: All Column Types

| Column Type | expect_null_on_read | can_write_null | Reason |
|-------------|---------------------|----------------|--------|
| **Primary Key (sequence)** | `false` | `false` | Auto-generated, always has value |
| **Primary Key (non-sequence)** | `false` | N/A | Required on insert, immutable |
| **SUM aggregation** | `false` | `false` | DEFAULT 0, not writable |
| **COUNT aggregation** | `false` | `false` | DEFAULT 0, not writable |
| **MAX aggregation** | `false` | `false` | DEFAULT 0, not writable |
| **MIN aggregation** | `false` | `false` | DEFAULT 0, not writable |
| **FETCH automation** | `true` | `false` | May be NULL, not writable |
| **FETCH_UPDATES automation** | `true` | `false` | May be NULL, not writable |
| **LATEST automation** | `true` | `false` | May be NULL, not writable |
| **Calculated column** | `true` | `false` | Depends on expression, not writable |
| **Regular column** | `true` | `true` | Optional field, writable |
| **Foreign key column** | `true` | `true` | Optional relationship, writable |

## UI Implementation Patterns

### TypeScript/JavaScript

```typescript
interface Column {
  expect_null_on_read: boolean;
  can_write_null: boolean;
  writable: 'always' | 'never';
}

// Reading
function displayValue(column: Column, value: any): string {
  if (value === null) {
    if (!column.expect_null_on_read) {
      console.error(`Unexpected NULL in ${column.name}!`);
      return "ERROR";
    }
    return "(not set)";
  }
  return String(value);
}

// Writing
function validateWrite(column: Column, value: any): boolean {
  if (column.writable === 'never') {
    return false; // Never write automated/sequence columns
  }

  if (value === null && !column.can_write_null) {
    return false; // Cannot write NULL to this column
  }

  return true;
}
```

### React Example

```tsx
function BalanceDisplay({ balance }: { balance: number | null }) {
  // Aggregation: expect_null_on_read = false
  // So we can assert it's never null
  return <div>Balance: ${balance.toFixed(2)}</div>;
}

function DescriptionInput({ value, onChange }: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  // Regular column: expect_null_on_read = true, can_write_null = true
  return (
    <div>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
      <button onClick={() => onChange(null)}>Clear</button>
    </div>
  );
}
```

## Benefits

1. **Clear Contracts**: UI knows exactly what to expect
2. **Type Safety**: TypeScript can use non-nullable types for `expect_null_on_read: false`
3. **Better UX**: Different UI patterns for "never NULL" vs "may be NULL"
4. **Fewer Bugs**: No ambiguity about NULL handling
5. **Validation**: Can validate writes before sending to database

## Migration from Old `nullable` Field

**Old format:**
```yaml
balance:
  nullable: true  # Ambiguous - on read or write?
```

**New format:**
```yaml
balance:
  expect_null_on_read: false  # Clear: never NULL on read
  can_write_null: false        # Clear: cannot write NULL
```

The new format eliminates ambiguity and provides actionable guidance for both read and write operations.
