# Moving Values from Parent to Child

Columns can automatically copy values from a parent table using SNAPSHOT or FOLLOW automation.

## Basic Structure

```yaml
tables:
  parent_table:
    columns:
      source_column: { type: data_type }

  child_table:
    foreign_keys:
      parent_fk:
        table: parent_table

    columns:
      destination_column:
        type: data_type
        automation:
          type: SNAPSHOT  # or FOLLOW
          table: parent_table
          foreign_key: parent_fk
          column: source_column
```

## SNAPSHOT vs FOLLOW

- **SNAPSHOT**: Copies value on INSERT only. Child value remains frozen even if parent value changes later.
- **FOLLOW**: Copies value on INSERT and keeps synchronized when parent value changes via UPDATE.

## Example: Copy Discount Rate to Orders

```yaml
columns:
  id:
    type: integer
    sequence: true
    primary_key: true

tables:
  discount_groups:
    columns:
      group_id: id
      group_name: { type: varchar, size: 50 }
      discount_percent: { type: numeric, size: 5, decimal: 2 }

  customers:
    foreign_keys:
      discount_group_fk:
        table: discount_groups

    columns:
      customer_id: id
      customer_name: { type: varchar, size: 100 }
      discount_group_fk: { type: integer }

  orders:
    foreign_keys:
      customer_fk:
        table: customers
      discount_group_fk:
        table: discount_groups

    columns:
      order_id: id
      customer_fk: { type: integer }
      order_date: { type: date }

      # Copy discount group from customer
      discount_group_fk:
        type: integer
        automation:
          type: FOLLOW
          table: customers
          foreign_key: customer_fk
          column: discount_group_fk

      # Copy discount rate from discount group
      discount_percent:
        type: numeric
        size: 5
        decimal: 2
        automation:
          type: FOLLOW
          table: discount_groups
          foreign_key: discount_group_fk
          column: discount_percent
```

## What Happens

Values are copied from parent to child when a row is inserted or the foreign key is updated. Triggers on the child table enforce the FOLLOW behavior.

In the example above:
- When an order is created with `customer_fk = 1`
- The `discount_group_fk` is copied from the customer row (value: 1)
- The `discount_percent` is copied from the discount_group row (value: 15.00)
- Both values are stored in the order row

## Multiple FOLLOW Automations

A child table can copy multiple values from parent:

```yaml
tables:
  products:
    columns:
      product_id: { type: integer, primary_key: true, sequence: true }
      product_name: { type: varchar, size: 100 }
      tax_category: { type: varchar, size: 50 }
      unit_price: { type: numeric, size: 10, decimal: 2 }

  order_items:
    foreign_keys:
      product_fk:
        table: products

    columns:
      item_id: { type: integer, primary_key: true, sequence: true }
      product_fk: { type: integer }
      quantity: { type: integer }

      # Copy multiple values from products
      product_name:
        type: varchar
        size: 100
        automation:
          type: FOLLOW
          table: products
          foreign_key: product_fk
          column: product_name

      tax_category:
        type: varchar
        size: 50
        automation:
          type: FOLLOW
          table: products
          foreign_key: product_fk
          column: tax_category

      unit_price:
        type: numeric
        size: 10
        decimal: 2
        automation:
          type: FOLLOW
          table: products
          foreign_key: product_fk
          column: unit_price
```

## When Values Are Copied

SNAPSHOT (not implemented yet):
- INSERT: When a new child row is created
- Value remains frozen even if parent changes

FOLLOW:
- INSERT: When a new child row is created
- UPDATE: When parent value changes or foreign key value changes
- Child stays synchronized with parent

## Use Cases

SNAPSHOT is useful for:
- Historical records (order captures product price at time of purchase)
- Audit trails (preserve values as they were at transaction time)
- Immutable business data (tax rates, pricing tiers locked at order time)

FOLLOW is useful for:
- Denormalizing current values (always reflect latest discount rate)
- Performance optimization (avoiding joins for frequently accessed values)
- Cascading updates (keep derived data synchronized with source)
