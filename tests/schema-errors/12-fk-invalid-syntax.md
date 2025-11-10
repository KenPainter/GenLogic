# Test: FK invalid definition syntax

Tests that the processor detects when a foreign key has invalid syntax after removing modifiers.

Error catalog reference: `src/new-schema.ts:403`

## Expected Errors

```json
[
  {
    "location": "orders.customer_id",
    "message": "Invalid FK definition. After removing modifiers, unrecognized content remains: \"customers invalid\""
  },
  {
    "location": "orders.customer_id",
    "message": "Invalid SQL definition: ERROR invalid FK syntax, unrecognized content: \"customers invalid\""
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

  orders:
    columns:
      id: serial primary key
      customer_id: FK customers invalid
```
