# Test: Invalid automation syntax

Tests that the processor detects when an automation expression has invalid syntax.

Error catalog reference: `src/new-schema.ts:704`

## Expected Errors

```json
[
  {
    "location": "customers.total_amount",
    "message": "Invalid automation syntax: INVALID orders.amount"
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
        automation: INVALID orders.amount

  orders:
    columns:
      id: serial primary key
      customer_id: FK customers
      amount: numeric(12,2)
```
