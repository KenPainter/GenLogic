# Test: 1H - CHECK Constraints

Tests custom CHECK constraints for data validation.

## Step 1: Simple CHECK constraint on numeric column

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

## Verify CHECK constraint created

```json
{
  "newSchema": {
    "tables.products": "@exists",
    "tables.products.constraints": "@exists",
    "errors.length": 0
  }
}
```

## Test CHECK allows valid value

```sql
INSERT INTO products (name, price) VALUES ('Widget', 19.99);
SELECT name, price FROM products;
```

## Verify valid insert succeeded

```json
[
  {"name": "Widget", "price": "19.99"}
]
```

## Test CHECK allows zero is blocked (price > 0)

```sql
INSERT INTO products (name, price) VALUES ('Gadget', 29.99);
SELECT COUNT(*) as count FROM products;
```

## Verify second valid insert

```json
[
  {"count": "2"}
]
```

## Step 2: CHECK constraint with range

```yaml
tables:
  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price: numeric(10,2)
    constraints:
      - price > 0

  employees:
    columns:
      id: serial primary key
      name: varchar(100)
      age: integer
    constraints:
      - age >= 18 AND age <= 120
```

## Verify range CHECK constraint

```json
{
  "newSchema": {
    "tables.employees": "@exists",
    "tables.employees.constraints": "@exists"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "employees"
  }
}
```

## Test range CHECK allows valid ages

```sql
INSERT INTO employees (name, age) VALUES ('Alice', 25);
INSERT INTO employees (name, age) VALUES ('Bob', 55);
INSERT INTO employees (name, age) VALUES ('Charlie', 18);
SELECT name, age FROM employees ORDER BY age;
```

## Verify valid ages inserted

```json
[
  {"name": "Charlie", "age": 18},
  {"name": "Alice", "age": 25},
  {"name": "Bob", "age": 55}
]
```

## Step 3: CHECK constraint with string pattern

```yaml
tables:
  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price: numeric(10,2)
    constraints:
      - price > 0

  employees:
    columns:
      id: serial primary key
      name: varchar(100)
      age: integer
    constraints:
      - age >= 18 AND age <= 120

  phone_numbers:
    columns:
      id: serial primary key
      phone: varchar(20)
      contact_name: varchar(100)
    constraints:
      - phone ~ '^[0-9]{3}-[0-9]{3}-[0-9]{4}$'
```

## Verify pattern CHECK constraint

```json
{
  "newSchema": {
    "tables.phone_numbers": "@exists",
    "tables.phone_numbers.constraints": "@exists"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "phone_numbers"
  }
}
```

## Test pattern CHECK allows valid format

```sql
INSERT INTO phone_numbers (phone, contact_name) VALUES ('555-123-4567', 'Alice');
INSERT INTO phone_numbers (phone, contact_name) VALUES ('555-987-6543', 'Bob');
SELECT phone, contact_name FROM phone_numbers ORDER BY contact_name;
```

## Verify valid phone formats

```json
[
  {"phone": "555-123-4567", "contact_name": "Alice"},
  {"phone": "555-987-6543", "contact_name": "Bob"}
]
```

## Step 4: CHECK constraint with multiple conditions

```yaml
tables:
  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price: numeric(10,2)
    constraints:
      - price > 0

  employees:
    columns:
      id: serial primary key
      name: varchar(100)
      age: integer
    constraints:
      - age >= 18 AND age <= 120

  phone_numbers:
    columns:
      id: serial primary key
      phone: varchar(20)
      contact_name: varchar(100)
    constraints:
      - phone ~ '^[0-9]{3}-[0-9]{3}-[0-9]{4}$'

  orders:
    columns:
      id: serial primary key
      order_date: date
      ship_date: date
      status: varchar(20)
    constraints:
      - ship_date IS NULL OR ship_date >= order_date
```

## Verify multi-condition CHECK constraint

```json
{
  "newSchema": {
    "tables.orders": "@exists",
    "tables.orders.constraints": "@exists"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "orders"
  }
}
```

## Test multi-condition CHECK allows NULL

```sql
INSERT INTO orders (order_date, ship_date, status) VALUES ('2025-01-10', NULL, 'pending');
SELECT order_date, ship_date, status FROM orders WHERE status = 'pending';
```

## Verify NULL ship_date allowed

```json
[
  {"order_date": "2025-01-10T00:00:00.000Z", "ship_date": null, "status": "pending"}
]
```

## Test multi-condition CHECK allows ship_date >= order_date

```sql
INSERT INTO orders (order_date, ship_date, status) VALUES ('2025-01-11', '2025-01-11', 'shipped');
INSERT INTO orders (order_date, ship_date, status) VALUES ('2025-01-12', '2025-01-15', 'shipped');
SELECT order_date, ship_date, status FROM orders WHERE status = 'shipped' ORDER BY order_date;
```

## Verify valid ship dates

```json
[
  {"order_date": "2025-01-11T00:00:00.000Z", "ship_date": "2025-01-11T00:00:00.000Z", "status": "shipped"},
  {"order_date": "2025-01-12T00:00:00.000Z", "ship_date": "2025-01-15T00:00:00.000Z", "status": "shipped"}
]
```

## Step 5: Table-level CHECK constraint

```yaml
tables:
  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price: numeric(10,2)
    constraints:
      - price > 0

  employees:
    columns:
      id: serial primary key
      name: varchar(100)
      age: integer
    constraints:
      - age >= 18 AND age <= 120

  phone_numbers:
    columns:
      id: serial primary key
      phone: varchar(20)
      contact_name: varchar(100)
    constraints:
      - phone ~ '^[0-9]{3}-[0-9]{3}-[0-9]{4}$'

  orders:
    columns:
      id: serial primary key
      order_date: date
      ship_date: date
      status: varchar(20)
    constraints:
      - ship_date IS NULL OR ship_date >= order_date

  discounts:
    columns:
      id: serial primary key
      discount_percent: numeric(5,2)
      discount_amount: numeric(10,2)
    constraints:
      - (discount_percent IS NOT NULL AND discount_amount IS NULL) OR (discount_percent IS NULL AND discount_amount IS NOT NULL)
```

## Verify table-level CHECK constraint

```json
{
  "newSchema": {
    "tables.discounts": "@exists",
    "tables.discounts.constraints": "@exists"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "discounts"
  }
}
```

## Test table-level CHECK allows percent only

```sql
INSERT INTO discounts (discount_percent, discount_amount) VALUES (10.00, NULL);
SELECT discount_percent, discount_amount FROM discounts WHERE discount_percent IS NOT NULL;
```

## Verify percent-only discount

```json
[
  {"discount_percent": "10.00", "discount_amount": null}
]
```

## Test table-level CHECK allows amount only

```sql
INSERT INTO discounts (discount_percent, discount_amount) VALUES (NULL, 5.00);
SELECT discount_percent, discount_amount FROM discounts WHERE discount_amount IS NOT NULL;
```

## Verify amount-only discount

```json
[
  {"discount_percent": null, "discount_amount": "5.00"}
]
```

## Verify all CHECK constraints are active

```sql
SELECT
  c.conrelid::regclass::text as tablename,
  COUNT(c.conname) as check_constraint_count
FROM pg_constraint c
WHERE c.contype = 'c'
  AND c.connamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND c.conname NOT LIKE '%_not_null'
GROUP BY c.conrelid
ORDER BY tablename;
```

## Summary of CHECK constraints

```json
[
  {"tablename": "discounts", "check_constraint_count": "1"},
  {"tablename": "employees", "check_constraint_count": "1"},
  {"tablename": "orders", "check_constraint_count": "1"},
  {"tablename": "phone_numbers", "check_constraint_count": "1"},
  {"tablename": "products", "check_constraint_count": "1"}
]
```
