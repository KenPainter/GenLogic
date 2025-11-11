# Seed Data Technical Reference

## Seed-Rows Property

Define seed data with the `seed-rows` property on a table.

```yaml
tables:
  categories:
    columns:
      category_id: serial primary key
      category_name: varchar(100)
    seed-rows:
      - category_id: 1
        category_name: Electronics
      - category_id: 2
        category_name: Books
```

Seed data is inserted on every GenLogic run.

## Primary Keys in Seed Data

Primary key values must be specified explicitly.

Required for:
- Idempotency (ON CONFLICT DO NOTHING)
- Child seed data to reference parent seed data via FK

Convention: use values less than 100 for seed data (serial starts at 100).

## Seed Data with Foreign Keys

Parent tables are seeded before child tables.

```yaml
tables:
  categories:
    columns:
      category_id: serial primary key
      category_name: varchar(100)
    seed-rows:
      - category_id: 1
        category_name: Electronics

  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      category_id: FK categories
    seed-rows:
      - product_id: 1
        product_name: Laptop
        category_id: 1
```

## Partial Seed Data

Omit columns to use NULL or default values:

```yaml
tables:
  users:
    columns:
      user_id: serial primary key
      username: varchar(50)
      is_active: boolean default true
    seed-rows:
      - user_id: 1
        username: admin
        # is_active uses default: true
```

## Seed Data with Automations

Seed rows trigger automations:

```yaml
tables:
  customers:
    columns:
      customer_id: serial primary key

      order_count:
        definition: integer
        automation: COUNT orders.order_id

  orders:
    columns:
      order_id: serial primary key
      customer_id: FK customers
    seed-rows:
      - order_id: 1
        customer_id: 100
      - order_id: 2
        customer_id: 100
```

After seeding, customer 100's order_count is 2.

## Seed Data with Formulas

Formula columns calculate for seed rows:

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      base_price: numeric(10,2)
      tax_rate: numeric(5,4)

      final_price:
        definition: numeric(10,2)
        formula: "base_price * (1 + tax_rate)"
    seed-rows:
      - product_id: 1
        base_price: 100.00
        tax_rate: 0.0825
        # final_price calculates to 108.25
```

## Idempotency

Seed data uses ON CONFLICT DO NOTHING.

Re-running GenLogic does not duplicate seed rows.

Manual data insertion does not conflict with seed data.
