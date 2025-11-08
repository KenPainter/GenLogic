# Test: Multiple Foreign Keys to Same Parent Table

This test verifies that a table can have multiple foreign key columns referencing the same parent table (common in accounting ledgers with debit/credit accounts).

## Input Schema

```yaml
# Multiple foreign keys to same parent table
tables:
  accounts:
    columns:
      account_id: serial primary key
      name: varchar(100)

  ledger:
    columns:
      ledger_id: serial primary key
      account_id_debit: FK accounts
      account_id_credit: FK accounts
      amount: numeric(12,2)
```

## Assertions

```json
{
  "extracted": {
    "foreignKeys.length": 2,
    "foreignKeys.0.childTable": "ledger",
    "foreignKeys.0.childColumn": "account_id_debit",
    "foreignKeys.0.parentTable": "accounts",
    "foreignKeys.0.deleteAction": "RESTRICT",
    "foreignKeys.1.childTable": "ledger",
    "foreignKeys.1.childColumn": "account_id_credit",
    "foreignKeys.1.parentTable": "accounts",
    "foreignKeys.1.deleteAction": "RESTRICT",
    "tableLayers.0": ["accounts"],
    "tableLayers.1": ["ledger"],
    "cycles": []
  }
}
```

## Notes

This test validates:
- Multiple FK columns in one table can reference the same parent table
- Each FK is extracted separately in the foreignKeys array
- Foreign keys default to RESTRICT delete action
- Topological sort correctly identifies the parent (layer 0) and child (layer 1)
- Common accounting pattern: debit/credit columns both reference accounts table
