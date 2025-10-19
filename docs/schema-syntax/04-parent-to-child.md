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
        definition: *same type as source_column*
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
        definition: numeric(10,2)
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
        definition: numeric(5,2)
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
        definition: varchar(100)
        automation: SNAPSHOT @products.product_name

      unit_price:
        definition: numeric(10,2)
        automation: SNAPSHOT @products.unit_price

      # Keep synchronized with current values
      tax_category:
        definition: varchar(50)
        automation: SYNC @products.tax_category

      weight_kg:
        definition: numeric(8,2)
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
        definition: integer
        automation: SYNC @customers.discount_group_id

      # Then use that FK to get the discount rate
      discount_percent:
        definition: numeric(5,2)
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

## Test Coverage

This section lists tests that verify parent-to-child automation features work correctly.

### Validation (Runtime)

These tests verify that GenLogic catches invalid auto-create definitions:

- [x] [Spread bad start column](../../tests/04-validation/auto-create-spread-bad-start) - Error when spread.start column doesn't exist in parent
- [x] [Spread bad end column](../../tests/04-validation/auto-create-spread-bad-end) - Error when spread.end column doesn't exist in parent
- [x] [Copy_columns bad parent](../../tests/04-validation/auto-create-copy-bad-parent) - Error when copy_columns parent column doesn't exist
- [x] [Copy_columns bad child](../../tests/04-validation/auto-create-copy-bad-child) - Error when copy_columns child column doesn't exist
- [x] [Literals bad column](../../tests/04-validation/auto-create-literals-bad-column) - Error when literals references non-existent child column
- [x] [auto_create_parent without PK](../../tests/04-validation/auto-create-parent-no-pk) - Error when auto_create_parent on FK to table without primary key

### Schema Features (Isolated Tests)

These tests verify that GenLogic generates correct auto-create triggers:

- [x] [auto_create_parent trigger](../../tests/05-schema-features/auto-create-parent-trigger) - BEFORE INSERT trigger generated for auto_create_parent FK

### Behavior (End-to-End Tests)

These tests verify parent-to-child automation behavior with actual data:

- [x] [SNAPSHOT automation](../../tests/06-behavior/automations-snapshot) - Point-in-time value capture
- [x] [SPREAD automation](../../tests/06-behavior/automations-spread) - Date range expansion with auto_create
- [x] [SYNC automation](../../tests/06-behavior/automations-sync) - Synchronized value tracking
- [x] [Basic auto_create_parent](../../tests/06-behavior/auto-create-parent-basic) - BEFORE INSERT trigger auto-creates parent row

---

Previous: [Foreign Keys](03-foreign-keys.md) | Next: [Generating Values Within a Row](05-generated-columns.md)
