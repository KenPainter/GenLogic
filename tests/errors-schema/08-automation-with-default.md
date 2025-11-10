# Test: Automation columns cannot have user-specified defaults

Tests that the processor detects when an automation column specifies a default value.

Error catalog reference: `src/new-schema.ts:276`

## Expected Errors

```json
[
  {
    "location": "customers.order_count",
    "message": "Automation columns cannot have user-specified defaults. Remove 'default' - the system will set appropriate defaults based on automation type."
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
      order_count:
        definition: integer default 0
        automation: COUNT orders.id

  orders:
    columns:
      id: serial primary key
      customer_id: FK customers
```
