Previous: [Foreign Keys](03-foreign-keys.md) | Next: [Generating Values Within a Row](05-generated-columns.md)

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
        automation: SNAPSHOT @parent_table.source_column
        # or: automation: SYNC @parent_table.source_column
```

The automation format is: `SNAPSHOT @table.column` or `SYNC @table.column`

## SNAPSHOT vs SYNC

- **SNAPSHOT**: Copies value on INSERT to child table only. Child value remains frozen even if parent value changes later.
- **SYNC**: Copies value on INSERT and keeps synchronized when parent value changes via UPDATE.

## Example: Capturing Product Price

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      base_price: numeric(10,2)

  orders:
    foreign_keys:
      product: products

    columns:
      order_id: serial primary key
      product_id: integer

      # Freeze price at time of purchase
      price_at_purchase:
        type: numeric(10,2)
        automation: SNAPSHOT @products.base_price
```

When an order is created:
1. The `price_at_purchase` is copied from `products.base_price`
2. Future changes to `products.base_price` do NOT update the order
3. The order preserves the historical price

## Example: Syncing Tax Rates

```yaml
tables:
  categories:
    columns:
      category_id: serial primary key
      category_name: varchar(100)
      tax_rate: numeric(5,2)

  products:
    foreign_keys:
      category: categories

    columns:
      product_id: serial primary key
      category_id: integer
      product_name: varchar(100)

      # Keep tax rate synchronized
      category_tax:
        type: numeric(5,2)
        automation: SYNC @categories.tax_rate
```

When tax rates change:
1. Update to `categories.tax_rate` automatically updates all products in that category
2. Products always reflect current tax rate
3. No need to manually update child records

## What Happens

Values are copied from parent to child via triggers:

**SNAPSHOT behavior:**
- INSERT: When a new child row is created, value is copied from parent
- Value remains frozen even if parent changes later

**SYNC behavior:**
- INSERT: When a new child row is created, value is copied from parent
- UPDATE: When parent value changes, all child rows are updated
- UPDATE: When child's foreign key changes, child pulls value from new parent

## Multiple Automations

A child table can have multiple SNAPSHOT and SYNC columns:

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      tax_category: varchar(50)
      unit_price: numeric(10,2)
      weight_kg: numeric(8,2)

  order_items:
    foreign_keys:
      product: products

    columns:
      item_id: serial primary key
      product_id: integer
      quantity: integer

      # Freeze values at order time
      product_name:
        type: varchar(100)
        automation: SNAPSHOT @products.product_name

      unit_price:
        type: numeric(10,2)
        automation: SNAPSHOT @products.unit_price

      # Keep synchronized with current values
      tax_category:
        type: varchar(50)
        automation: SYNC @products.tax_category

      weight_kg:
        type: numeric(8,2)
        automation: SYNC @products.weight_kg
```

## Cascading Automations

You can copy foreign keys and then use them:

```yaml
tables:
  discount_groups:
    columns:
      group_id: serial primary key
      group_name: varchar(50)
      discount_percent: numeric(5,2)

  customers:
    foreign_keys:
      discount_group: discount_groups

    columns:
      customer_id: serial primary key
      customer_name: varchar(100)
      discount_group_id: integer

  orders:
    foreign_keys:
      customer: customers
      discount_group: discount_groups

    columns:
      order_id: serial primary key
      customer_id: integer
      order_date: date

      # Copy discount group FK from customer
      discount_group_id:
        type: integer
        automation: SYNC @customers.discount_group_id

      # Then use that FK to get the discount rate
      discount_percent:
        type: numeric(5,2)
        automation: SNAPSHOT @discount_groups.discount_percent
```

## Use Cases

**SNAPSHOT is useful for:**
- Historical records (order captures product price at time of purchase)
- Audit trails (preserve values as they were at transaction time)
- Immutable business data (tax rates, pricing tiers locked at order time)
- Point-in-time snapshots (exchange rates, commission tiers)

**SYNC is useful for:**
- Denormalizing current values (always reflect latest tax rate)
- Application simplification (querying a single table returns all relevant details)
- Cascading updates (keep derived data synchronized with source)
- Real-time data (current category, current status)

---

Previous: [Foreign Keys](03-foreign-keys.md) | Next: [Generating Values Within a Row](05-generated-columns.md)
