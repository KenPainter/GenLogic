Previous: [Foreign Keys](03-foreign-keys.md) | Next: [Calculating Values Within a Row](05-calculated-columns.md)

# Moving Values from Parent to Child

Columns can automatically copy values from a parent table using SNAPSHOT or SYNC automation.

## Basic Structure

```yaml
tables:
  parent_table:
    columns:
      source_column: *any valid PostgreSQL type*

  child_table:
    foreign_keys:
      parent_fk: parent_table

    columns:
      destination_column:
        type: *same type as source_column*
        automation:
          type: SNAPSHOT  # or SYNC
          table: parent_table
          foreign_key: parent_fk
          column: source_column
```

## SNAPSHOT vs SYNC

- SNAPSHOT: Copies value on INSERT to child table only. Child value remains frozen 
  even if parent value changes later.
- SYNC: Copies value on INSERT and keeps synchronized when parent value changes via UPDATE.

## Example: Copy Discount Rate to Orders

```yaml
columns:
  id:
    type: serial primary key

tables:
  discount_groups:
    columns:
      group_id: id
      group_name: varchar(50)
      discount_percent: numeric(5,2)

  customers:
    foreign_keys:
      discount_group_fk: discount_groups

    columns:
      customer_id: id
      customer_name: varchar(100)
      discount_group_fk: integer

  orders:
    foreign_keys:
      customer_fk: customers
      discount_group_fk: discount_groups

    columns:
      order_id: id
      customer_fk: integer
      order_date: date

      # Copy discount group from customer
      discount_group_fk:
        type: integer
        automation:
          type: SYNC
          table: customers
          foreign_key: customer_fk
          column: discount_group_fk

      # Copy discount rate from discount group
      discount_percent:
        type: numeric(5,2)
        automation:
          type: SYNC
          table: discount_groups
          foreign_key: discount_group_fk
          column: discount_percent
```

## What Happens

Values are copied from parent to child when a row is inserted or the foreign key is updated. Triggers on the child table enforce the SYNC behavior.

In the example above:
- When an order is created with `customer_fk = 1`
- The `discount_group_fk` is copied from the customer row (value: 1)
- The `discount_percent` is copied from the discount_group row (value: 15.00)
- Both values are stored in the order row

## Multiple SYNC Automations

A child table can copy multiple values from parent:

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      tax_category: varchar(50)
      unit_price: numeric(10,2)

  order_items:
    foreign_keys:
      product_fk: products

    columns:
      item_id: serial primary key
      product_fk: integer
      quantity: integer

      # Copy multiple values from products
      product_name:
        type: varchar(100)
        automation:
          type: SYNC
          table: products
          foreign_key: product_fk
          column: product_name

      tax_category:
        type: varchar(50)
        automation:
          type: SYNC
          table: products
          foreign_key: product_fk
          column: tax_category

      unit_price:
        type: numeric(10,2)
        automation:
          type: SYNC
          table: products
          foreign_key: product_fk
          column: unit_price
```

## When Values Are Copied

SNAPSHOT (not implemented yet):
- INSERT: When a new child row is created
- Value remains frozen even if parent changes

SYNC:
- INSERT: When a new child row is created
- UPDATE: When parent value changes or foreign key value changes
- Child stays synchronized with parent

## Use Cases

SNAPSHOT is useful for:
- Historical records (order captures product price at time of purchase)
- Audit trails (preserve values as they were at transaction time)
- Immutable business data (tax rates, pricing tiers locked at order time)

SYNC is useful for:
- Denormalizing current values (always reflect latest discount rate)
- Application simplification (querying a single table returns all relevant details)
- Cascading updates (keep derived data synchronized with source)

---

Previous: [Foreign Keys](03-foreign-keys.md) | Next: [Calculating Values Within a Row](05-calculated-columns.md)
