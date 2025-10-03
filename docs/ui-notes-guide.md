# UI-Notes Feature Guide

## Overview

The `ui-notes` feature allows schema designers to provide UI guidance directly in table definitions. These notes are:
- Not processed by the database - Pure metadata for UI developers
- Expanded in resolved schemas - Detailed guidance generated automatically
- Type-safe - Validated by JSON Schema

## Available UI Notes

### 1. `singleton`

Indicates that the table should contain exactly one row.

**Use Cases:**
- Application settings/configuration tables
- User profile (single user apps)
- System state tables
- Beginning balance snapshots

**Example:**
```yaml
tables:
  app_settings:
    ui-notes:
      - singleton
    columns:
      id: { type: integer, sequence: true, primary_key: true }
      theme: { type: varchar, size: 20 }
      language: { type: varchar, size: 10 }
```

**Generated UI Guidance:**
```yaml
_table_info:
  ui_guidance:
    row_expectations:
      type: singleton
      expected_rows: exactly_one
      description: This table should contain exactly one row
      ui_behavior:
        - Do not show "Add" or "New" buttons
        - Do not show "Delete" button
        - Present as a form, not a list
        - Load the single row on component mount
        - Show edit mode directly or with single "Edit" button
      query_pattern: SELECT * FROM table_name LIMIT 1
      note: Always expect exactly one row. If no row exists, show error or create default.
```

### 2. `no-insert`

Prevents UI from implementing INSERT operations.

**Use Cases:**
- Tables populated by database triggers
- Tables managed by background processes
- Reference data loaded from external sources
- Views represented as tables

**Example:**
```yaml
tables:
  computed_statistics:
    ui-notes:
      - no-insert
    columns:
      stat_id: { type: integer, sequence: true, primary_key: true }
      total_users: { type: integer }
      last_updated: { type: timestamp }
```

**Generated UI Guidance:**
```yaml
_table_info:
  ui_guidance:
    crud_restrictions:
      insert:
        allowed: false
        reason: Schema restricts INSERT operations
        ui_behavior:
          - Do not show "Add" or "New" buttons
          - Do not implement create/insert forms
          - Rows are managed by database or other processes
```

### 3. `no-update`

Prevents UI from implementing UPDATE operations (immutable records).

**Use Cases:**
- Audit logs
- Historical records
- Transaction history
- Event logs
- Blockchain-style append-only tables

**Example:**
```yaml
tables:
  audit_log:
    ui-notes:
      - no-update
      - no-delete
    columns:
      log_id: { type: integer, sequence: true, primary_key: true }
      timestamp: { type: timestamp }
      user_id: { type: integer }
      action: { type: varchar, size: 100 }
```

**Generated UI Guidance:**
```yaml
_table_info:
  ui_guidance:
    crud_restrictions:
      update:
        allowed: false
        reason: Schema restricts UPDATE operations
        ui_behavior:
          - Do not show "Edit" buttons
          - Show all fields as read-only
          - Data is immutable after creation
```

### 4. `no-delete`

Prevents UI from implementing DELETE operations.

**Use Cases:**
- Master data tables
- Reference tables
- Account/user tables (soft delete preferred)
- Legal/compliance data that must be retained

**Example:**
```yaml
tables:
  accounts:
    ui-notes:
      - no-delete
    columns:
      account_id: { type: integer, sequence: true, primary_key: true }
      name: { type: varchar, size: 100 }
      active: { type: boolean }  # Use soft delete instead
```

**Generated UI Guidance:**
```yaml
_table_info:
  ui_guidance:
    crud_restrictions:
      delete:
        allowed: false
        reason: Schema restricts DELETE operations
        ui_behavior:
          - Do not show "Delete" buttons
          - Records cannot be removed once created
          - Consider soft-delete column if needed
```

## Combining Multiple UI Notes

UI notes can be combined for complex constraints:

### Example: Immutable Audit Log

```yaml
audit_log:
  ui-notes:
    - no-update
    - no-delete
  columns:
    log_id: { type: integer, sequence: true, primary_key: true }
    timestamp: { type: timestamp }
    action: { type: varchar, size: 50 }
```

**Result:** UI shows read-only list with "Add" button only.

### Example: Singleton with No Delete

```yaml
begin_balance:
  ui-notes:
    - singleton
  columns:
    id: { type: integer, sequence: true, primary_key: true }
    opening_balance: { type: numeric, size: 15, decimal: 2 }
```

**Result:** UI shows single-record form with "Edit" button only (no Add/Delete).

Note: `singleton` automatically implies `no-insert` and `no-delete`, so those don't need to be specified.

## Real-World Example: Begin Balance Table

From your example:

```yaml
begin_balance:
  ui-notes:
    - singleton
  foreign_keys:
    accounts:
      table: accounts
      prefix: base_account_
  columns:
    id: skey
    date: { type: date }
    debits:
      $ref: amount
      automation:
        type: SUM
        table: begin_balance_debits
        foreign_key: fk_begin_balance
        column: amount
    credits:
      $ref: amount
      automation:
        type: SUM
        table: begin_balance_credits
        foreign_key: fk_begin_balance
        column: amount
    total:
      $ref: amount
      calculated: debits - credits
```

**Resolved Schema Includes:**

```yaml
begin_balance:
  _table_info:
    has_triggers: true
    has_automations: true
    foreign_keys: 1
    ui_guidance:
      row_expectations:
        type: singleton
        expected_rows: exactly_one
        description: This table should contain exactly one row
        ui_behavior:
          - Do not show "Add" or "New" buttons
          - Do not show "Delete" button
          - Present as a form, not a list
          - Load the single row on component mount
          - Show edit mode directly or with single "Edit" button
        query_pattern: SELECT * FROM table_name LIMIT 1
        note: Always expect exactly one row. If no row exists, show error or create default.
  columns:
    # ... column details with expect_null_on_read, can_write_null, writable, etc.
```

## UI Implementation Patterns

### React Example: Singleton Table

```tsx
function BeginBalanceForm() {
  const [balance, setBalance] = useState<BeginBalance | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    // Load the single row
    fetch('/api/begin_balance')
      .then(res => res.json())
      .then(data => setBalance(data));
  }, []);

  // No "Add New" button
  // No "Delete" button
  // Just Edit/Save

  return (
    <div>
      <h2>Begin Balance</h2>
      {editing ? (
        <form onSubmit={handleSave}>
          <input name="date" value={balance?.date} />
          {/* debits and credits are automated - read-only */}
          <div>Debits: {balance?.debits}</div>
          <div>Credits: {balance?.credits}</div>
          <div>Total: {balance?.total}</div>
          <button type="submit">Save</button>
          <button onClick={() => setEditing(false)}>Cancel</button>
        </form>
      ) : (
        <div>
          <div>Date: {balance?.date}</div>
          <div>Debits: {balance?.debits}</div>
          <div>Credits: {balance?.credits}</div>
          <div>Total: {balance?.total}</div>
          <button onClick={() => setEditing(true)}>Edit</button>
        </div>
      )}
    </div>
  );
}
```

### React Example: No-Delete Table

```tsx
function AccountsList() {
  const [accounts, setAccounts] = useState<Account[]>([]);

  return (
    <div>
      <h2>Accounts</h2>
      <button onClick={handleAdd}>Add Account</button>
      <table>
        <tbody>
          {accounts.map(account => (
            <tr key={account.id}>
              <td>{account.name}</td>
              <td>
                <button onClick={() => handleEdit(account)}>Edit</button>
                {/* No Delete button - schema has no-delete */}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### React Example: Immutable Audit Log

```tsx
function AuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);

  return (
    <div>
      <h2>Audit Log</h2>
      {/* No Add button - logs created by system */}
      <table>
        <tbody>
          {logs.map(log => (
            <tr key={log.log_id}>
              <td>{log.timestamp}</td>
              <td>{log.action}</td>
              {/* No Edit button - no-update */}
              {/* No Delete button - no-delete */}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

## TypeScript Types

```typescript
interface UIGuidance {
  row_expectations?: {
    type: 'singleton';
    expected_rows: 'exactly_one';
    description: string;
    ui_behavior: string[];
    query_pattern: string;
    note: string;
  };
  crud_restrictions?: {
    insert?: CRUDRestriction;
    update?: CRUDRestriction;
    delete?: CRUDRestriction;
  };
}

interface CRUDRestriction {
  allowed: false;
  reason: string;
  ui_behavior: string[];
}

interface TableInfo {
  has_triggers: boolean;
  has_automations: boolean;
  foreign_keys: number;
  ui_guidance?: UIGuidance;
}
```

## Benefits

1. **Single Source of Truth**: UI constraints defined in schema alongside data model
2. **Type Safety**: JSON schema validates ui-notes values
3. **Rich Documentation**: Expanded guidance includes specific UI patterns
4. **Consistency**: All UI developers follow same rules
5. **Automated**: No manual documentation needed
6. **Maintainable**: Change schema, UI guidance updates automatically

## Future Extensions

Possible future ui-notes:

- `read-only`: Entire table is read-only
- `paginated`: Expect large result sets, use pagination
- `searchable`: Implement search/filter
- `sortable: [columns]`: Enable sorting on specific columns
- `default-view: list|form|grid`: Suggest default UI layout
- `refresh-interval: seconds`: Auto-refresh interval for real-time data

## Schema Validation

The JSON Schema ensures only valid ui-notes are accepted:

```json
{
  "ui-notes": {
    "type": "array",
    "items": {
      "type": "string",
      "enum": ["singleton", "no-insert", "no-update", "no-delete"]
    }
  }
}
```

Invalid notes will cause schema validation errors.

## Summary

UI-notes provide a way to communicate table-level UI constraints directly in your GenLogic schema. Combined with column-level fields like `expect_null_on_read`, `can_write_null`, and `writable`, the resolved schema provides complete guidance for UI implementation.
