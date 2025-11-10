# Test: Automation cycle detected

Tests that the processor detects cycles in automation dependencies.

Error catalog reference: `src/processor.ts:159`

## Expected Errors

```json
[
  {
    "location": "Automation dependencies",
    "message": "Cycle detected: orders.discounted_total -> customers.order_discount_threshhold -> orders.discounted_base -> orders.discounted_total"
  },
  {
    "location": "Automation dependencies",
    "message": "Cycle detected: orders.customer_total -> customers.order_total -> orders.customer_total"
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
      order_discount_threshhold:
        definition: numeric(12,2)
        automation: SUM orders.discounted_total
      order_total:
        definition: numeric(12,2)
        automation: SUM orders.customer_total

  orders:
    columns:
      id: serial primary key
      customer_id: FK customers
      amount: numeric(12,2)
      customer_total:
        definition: numeric(12,2)
        automation: SYNC customers.order_total
      discounted_base:
        definition: numeric(12,2)
        automation: SYNC customers.order_discount_threshhold
      discounted_total:
        definition: numeric(12,2)
        formula: discounted_base * 0.95

  
```
