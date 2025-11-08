# Test: YAML Line Tracking

This test verifies that the YAML parser correctly tracks line numbers for all schema elements.

## Input Schema

```yaml
# Test YAML line tracking for all schema elements
tables:
  categories:
    columns:
      category: varchar(9) primary key
      display_order: integer
    seed-rows:
      - { category: Asset, display_order: 1 }
      - { category: Liability, display_order: 2 }
      - { category: Equity, display_order: 3 }

  accounts:
    columns:
      account_id: serial primary key
      category: FK categories
      account_name: varchar(30) unique
      debits: numeric(12,2)
      credits: numeric(12,2)
      balance:
        definition: numeric(12,2)
        formula: "debits - credits"
    indexes:
      - [ account_name ]
      - [ category ]
    constraints:
      - balance >= 0
      - account_name IS NOT NULL
    seed-rows:
      - { account_id: 1, category: Asset, account_name: Cash }
      - { account_id: 2, category: Liability, account_name: Loan }
```

## Assertions

```json
{
  "parsed": {
    "content.tables._yamlLine": 2,
    "content.tables.categories._yamlLine": 3,
    "content.tables.categories.columns._yamlLine": 4,
    "content.tables.categories.columns.category._yamlLine": 5,
    "content.tables.categories.columns.display_order._yamlLine": 6,
    "content.tables.categories.seed-rows._yamlLine": 7,
    "content.tables.accounts._yamlLine": 12,
    "content.tables.accounts.columns._yamlLine": 13,
    "content.tables.accounts.columns.account_id._yamlLine": 14,
    "content.tables.accounts.columns.category._yamlLine": 15,
    "content.tables.accounts.columns.account_name._yamlLine": 16,
    "content.tables.accounts.columns.debits._yamlLine": 17,
    "content.tables.accounts.columns.credits._yamlLine": 18,
    "content.tables.accounts.columns.balance._yamlLine": 19,
    "content.tables.accounts.indexes._yamlLine": 22,
    "content.tables.accounts.constraints._yamlLine": 25
  }
}
```

## Notes

The `_yamlLine` property tracks the line number where each key appears in the source YAML file. This is used for error reporting to show users exactly where problems occur in their schema files.
