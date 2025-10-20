Previous: [Indexes and Unique Constraints](../20-schema-syntax/30-indexes-and-constraints.md) | Next: [Calculating Values Within a Row](20-calculate-within-row.md)

# Moving Values from Parent to Child

Columns can automatically copy values from a parent table using SNAPSHOT or SYNC automation.

## SNAPSHOT vs SYNC

- SNAPSHOT: Copies value from parent only on child row changes
  - Value remains frozen if parent value changes 
  - Value re-copies if child foreign key changes, pointing to a new parent row
- SYNC: child table always has the parent table's value
  - INSERT to child copies from parent
  - UPDATE to child with new foreign key value re-copies from new parent row
  - UPDATE to parent distributes changes to all children

## Use Cases

SNAPSHOT: Historical records, audit trails, point-in-time captures (order price, exchange rate at transaction time)

SYNC: Denormalized current values, cascading updates (always reflect latest tax rate, current status)


## Example

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      base_price: numeric(10,2)
      tax_category: varchar(50)

  orders:
    foreign_keys:
      product: products

    columns:
      order_id: serial primary key
      product_id: integer
      quantity: integer

      # SNAPSHOT: Freeze at order time
      price_at_purchase:
        definition: numeric(10,2)
        automation: SNAPSHOT @products.base_price

      product_name:
        definition: varchar(100)
        automation: SNAPSHOT @products.product_name

      # SYNC: Always reflect current value
      tax_category:
        definition: varchar(50)
        automation: SYNC @products.tax_category
```

## Cascading Automations

Copy foreign keys and then use them to pull values from grandparent tables:

```yaml
tables:
  discount_groups:
    columns:
      group_id: serial primary key
      discount_percent: numeric(5,2)

  customers:
    foreign_keys:
      discount_group: discount_groups
    columns:
      customer_id: serial primary key
      discount_group_id: integer

  orders:
    foreign_keys:
      customer: customers
      discount_group: discount_groups
    columns:
      order_id: serial primary key
      customer_id: integer

      # Copy FK from customer
      discount_group_id:
        definition: integer
        automation: SYNC @customers.discount_group_id

      # Use that FK to get discount from grandparent
      discount_percent:
        definition: numeric(5,2)
        automation: SNAPSHOT @discount_groups.discount_percent
```


## Test Coverage

### Behavior Tests

- [x] [SNAPSHOT automation](../../tests/06-behavior/automations-snapshot) - Point-in-time value capture (parent value changes)
- [x] [SNAPSHOT FK change](../../tests/06-behavior/snapshot-fk-change) - SNAPSHOT re-copies when FK changes to new parent
- [x] [SYNC automation](../../tests/06-behavior/automations-sync) - Synchronized value tracking (parent value changes)
- [x] [SYNC FK change](../../tests/06-behavior/sync-fk-change) - SYNC re-copies when FK changes to new parent
- [x] [Cascading automations](../../tests/06-behavior/cascading-automations) - Copy FK and pull from grandparent table

---

Previous: [Indexes and Unique Constraints](../20-schema-syntax/30-indexes-and-constraints.md) | Next: [Calculating Values Within a Row](20-calculate-within-row.md)
