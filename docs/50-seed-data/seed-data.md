Previous: [Auto Create Parent](../40-row-automations/auto-create-parent.md) | Next: [Intra-Table Dependencies With Calculated Foreign Keys](../60-advanced/intra-table-column-dependency-chain-via-fk.md)

# Seed Data

Seed data pre-populates tables with initial rows defined in the schema. GenLogic inserts seed data automatically when building the database.

## Serial Primary Keys and Seed Data

GenLogic always initializes the serial value of a new table so that the first value is 100.

Required: Serial primary key values in seed data must be <= 99. GenLogic will reject seed rows with serial PK values > 99 to prevent collisions with the auto-increment sequence.

All examples in this documentation use primary key values less than 100 for seed data.

## Basic Seed Data

Define seed data with the `seed-rows` property:

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
      - category_id: 3
        category_name: Clothing
```

When GenLogic builds the schema, these three rows are inserted.

Query the table:
```sql
SELECT category_id, category_name
FROM categories
ORDER BY category_id;
```

Result:
```
category_id | category_name
------------+--------------
          1 | Electronics
          2 | Books
          3 | Clothing
```

## Seed Data with Foreign Keys

Seed data respects foreign key relationships. Parent tables are seeded before children.

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
      category_id: FK(categories)
      price: numeric(10,2)
    seed-rows:
      - product_id: 1
        product_name: Laptop
        category_id: 1
        price: 999.99
```

GenLogic inserts categories first, then products. The FK(constraint) is satisfied.

## Idempotency

Seed data uses `ON CONFLICT DO NOTHING`. Re-running GenLogic does not duplicate seed rows.

Initial run creates rows:
```sql
SELECT * FROM categories;
-- Returns 3 rows
```

Insert additional data manually:
```sql
INSERT INTO categories (category_name)
VALUES ('Home & Garden');
```

Re-run GenLogic with the same seed-rows. The table still has 4 rows (3 seed + 1 manual). Seed rows are not duplicated.

## Seed Data with Automations

Seed rows trigger automations like any other insert.

```yaml
tables:
  customers:
    columns:
      customer_id: serial primary key
      customer_name: varchar(100)

      order_count:
        definition: integer
        automation: COUNT orders.order_id

  orders:
    columns:
      order_id: serial primary key
      customer_id: FK(customers)
      order_date: date
    seed-rows:
      - order_id: 1
        customer_id: 100
        order_date: '2025-01-15'
      - order_id: 2
        customer_id: 100
        order_date: '2025-01-16'
```

After seeding, customer 100's `order_count` is 2.

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
```

The seed row has `final_price = 108.25` automatically calculated.

## Partial Seed Data

Omit columns to use default values or NULL:

```yaml
tables:
  users:
    columns:
      user_id: serial primary key
      username: varchar(50)
      created_at: timestamp default CURRENT_TIMESTAMP
      is_active: boolean default true
    seed-rows:
      - user_id: 1
        username: admin
```

The seed row has:
- `user_id = 1`
- `username = 'admin'`
- `created_at` = current timestamp (default)
- `is_active = true` (default)

## Use Cases

Seed data is useful for:
- Lookup tables (status codes, categories, countries)
- Initial configuration data
- System accounts or defaults
- Development and testing data
- Demo databases

## Limitations

- Seed data must specify the primary key explicitly
  - to prevent duplicate values being inserted on later builds.
  - so that child table seed rows can reference parent-table seed rows
- Seed rows use `ON CONFLICT DO NOTHING` (cannot update existing rows)
- Seed data is inserted on every GenLogic run (idempotent but not skippable)

---

Previous: [Auto Create Parent](../40-row-automations/auto-create-parent.md) | Next: [Intra-Table Dependencies With Calculated Foreign Keys](../60-advanced/intra-table-column-dependency-chain-via-fk.md)
