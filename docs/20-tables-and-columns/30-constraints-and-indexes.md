Previous: [Primary Keys and Foreign Keys](20-primary-and-foreing-keys.md) | Next: [Snapshot Parent to Child](../30-column-automations/snapshot-automation.md)

# Constraints and Indexes

## Unique Constraints

The `unique` modifier ensures a column contains only distinct values.

```yaml
tables:
  users:
    columns:
      id: serial primary key
      email: varchar(255) unique
      username: varchar(50) unique
```

The database prevents duplicate email or username values.

### Composite Unique Constraints

For uniqueness across multiple columns, use table-level `unique-constraints`:

This example prevents a student from enrolling in the same course twice.

Unique constraints allow NULL values and create indexes automatically.


```yaml
tables:
  enrollments:
    columns:
      id: serial primary key
      student_id: integer
      course_id: integer
    unique-constraints:
      - [student_id, course_id]
```



Multiple composite unique constraints are allowed:

```yaml
tables:
  bookings:
    columns:
      id: serial primary key
      room_id: integer
      date: date
      time_slot: varchar(20)
      guest_id: integer
    unique-constraints:
      - [room_id, date, time_slot]
      - [guest_id, date, time_slot]
```


## Check Constraints

Check constraints enforce validation rules using SQL expressions.

GenLogic supports check constraints at the table level.

```yaml
tables:
  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price: numeric(10,2)
    constraints:
      - price > 0
```


### Range Constraints

```yaml
tables:
  employees:
    columns:
      id: serial primary key
      name: varchar(100)
      age: integer
    constraints:
      - age >= 18 AND age <= 120
```

### Multiple Constraints

```yaml
tables:
  products:
    columns:
      id: serial primary key
      price: numeric(10,2)
      discount_percent: numeric(5,2)
    constraints:
      - price > 0
      - discount_percent >= 0 AND discount_percent <= 100
```

### Multi-Column Constraints

```yaml
tables:
  discounts:
    columns:
      id: serial primary key
      regular_price: numeric(10,2)
      sale_price: numeric(10,2)
    constraints:
      - sale_price <= regular_price
```

### Pattern Matching

```yaml
tables:
  users:
    columns:
      id: serial primary key
      username: varchar(50)
      email: varchar(255)
    constraints:
      - email LIKE '%@%'
      - LENGTH(username) >= 3
```

### NULL Behavior

Check constraints allow NULL unless the column is `not null`:

```yaml
tables:
  products:
    columns:
      id: serial primary key
      price: numeric(10,2) not null
    constraints:
      - price > 0
```

## Indexes

GenLogic automatically creates indexes for primary keys, foreign keys, and unique constraints.

### Auto-Generated Indexes

Primary key example:
```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100)
```

Creates index `customers_pkey` on the `id` column.

Foreign key example:
```yaml
tables:
  orders:
    columns:
      id: serial primary key
      customer_id: FK(customers)
      order_date: date
```

Creates index on `orders.customer_id` for efficient joins.

### Custom Indexes

Define custom indexes in the `indexes` section:

```yaml
tables:
  products:
    columns:
      id: serial primary key
      name: varchar(100)
      category: varchar(50)
      price: numeric(10,2)
      created_at: timestamp
    indexes:
      - [category]
      - [category, price]
      - [created_at]
```

Creates three indexes:
- `idx_products_category`
- `idx_products_category_price` (composite)
- `idx_products_created_at`

Add custom indexes for frequently filtered columns, sort columns, or composite queries.

Indexes speed up reads but slow down writes.

---

Previous: [Primary Keys and Foreign Keys](20-primary-and-foreing-keys.md) | Next: [Snapshot Parent to Child](../30-column-automations/snapshot-automation.md)
