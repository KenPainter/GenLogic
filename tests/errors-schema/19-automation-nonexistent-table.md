# Test: Automation references non-existent table

Tests that the processor detects when an automation references a table that doesn't exist.

Error catalog reference: `src/new-schema.ts:719`

## Expected Errors

```json
[
  {
    "location": "customers.total_amount",
    "message": "Automation references non-existent table: orders"
  }
]
```

## Input Schema

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100)
      total_amount:
        definition: numeric(12,2)
        automation: SUM orders.amount
```
