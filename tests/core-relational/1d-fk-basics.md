# Test: 1D - FK Basics

Tests basic foreign key relationships and patterns.

## Step 1: Simple parent-child relationship

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100)

  orders:
    columns:
      id: serial primary key
      customer_id: FK customers
      order_date: date
```

## Verify FK created

```json
{
  "newSchema": {
    "tables.customers": "@exists",
    "tables.customers.pkColumn": "id",
    "tables.orders": "@exists",
    "tables.orders.pkColumn": "id",
    "tables.orders.columns.customer_id.type": "integer",
    "tables.orders.foreignKeys.fk_orders_customer_id": "@exists",
    "tables.orders.foreignKeys.fk_orders_customer_id.parentTable": "customers",
    "tables.orders.foreignKeys.fk_orders_customer_id.childColumn": "customer_id",
    "tables.orders.foreignKeys.fk_orders_customer_id.parentColumn": "id",
    "errors.length": 0
  }
}
```

## Test FK constraint works

```sql
INSERT INTO customers (name) VALUES ('Alice');
INSERT INTO orders (customer_id, order_date) VALUES (100, '2025-01-15');
SELECT c.name, o.order_date
FROM customers c
JOIN orders o ON c.id = o.customer_id;
```

## Verify FK join works

```json
[
  {"name": "Alice", "order_date": "2025-01-15T00:00:00.000Z"}
]
```

## Verify FK Constraint Naming Convention

GenLogic names FK constraints as fk_<child_table>_<column_name>.

```sql
SELECT conname
FROM pg_constraint
WHERE conrelid = 'orders'::regclass
  AND contype = 'f'
ORDER BY conname;
```

```json
[
  {
    "conname": "fk_orders_customer_id"
  }
]
```

## Step 2: Add multi-level hierarchy (3 levels)

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100)

  orders:
    columns:
      id: serial primary key
      customer_id: FK customers
      order_date: date

  line_items:
    columns:
      id: serial primary key
      order_id: FK orders
      product_name: varchar(100)
      quantity: integer
```

## Verify 3-level hierarchy

```json
{
  "newSchema": {
    "tables.line_items": "@exists",
    "tables.line_items.columns.order_id.type": "integer",
    "tables.line_items.foreignKeys.fk_line_items_order_id": "@exists",
    "tables.line_items.foreignKeys.fk_line_items_order_id.parentTable": "orders",
    "tables.line_items.foreignKeys.fk_line_items_order_id.childColumn": "order_id",
    "tables.line_items.foreignKeys.fk_line_items_order_id.parentColumn": "id"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "line_items"
  }
}
```

## Test 3-level join

```sql
INSERT INTO line_items (order_id, product_name, quantity) VALUES (100, 'Widget', 5);
SELECT c.name, o.order_date, li.product_name, li.quantity
FROM customers c
JOIN orders o ON c.id = o.customer_id
JOIN line_items li ON o.id = li.order_id;
```

## Verify 3-level data

```json
[
  {"name": "Alice", "order_date": "2025-01-15T00:00:00.000Z", "product_name": "Widget", "quantity": 5}
]
```

## Step 3: Add multiple FKs to same parent table

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100)

  orders:
    columns:
      id: serial primary key
      customer_id: FK customers
      order_date: date

  line_items:
    columns:
      id: serial primary key
      order_id: FK orders
      product_name: varchar(100)
      quantity: integer

  shipments:
    columns:
      id: serial primary key
      order_id: FK orders
      customer_id: FK customers
      ship_date: date
```

## Verify multiple FKs to same parent

```json
{
  "newSchema": {
    "tables.shipments": "@exists",
    "tables.shipments.foreignKeys.fk_shipments_order_id": "@exists",
    "tables.shipments.foreignKeys.fk_shipments_order_id.parentTable": "orders",
    "tables.shipments.foreignKeys.fk_shipments_customer_id": "@exists",
    "tables.shipments.foreignKeys.fk_shipments_customer_id.parentTable": "customers"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "shipments"
  }
}
```

## Test multiple FK constraints

```sql
INSERT INTO shipments (order_id, customer_id, ship_date) VALUES (100, 100, '2025-01-16');
SELECT s.ship_date, c.name, o.order_date
FROM shipments s
JOIN customers c ON s.customer_id = c.id
JOIN orders o ON s.order_id = o.id;
```

## Verify multiple FK data

```json
[
  {"ship_date": "2025-01-16T00:00:00.000Z", "name": "Alice", "order_date": "2025-01-15T00:00:00.000Z"}
]
```

## Step 4: Add self-referential FK

```yaml
tables:
  customers:
    columns:
      id: serial primary key
      name: varchar(100)

  orders:
    columns:
      id: serial primary key
      customer_id: FK customers
      order_date: date

  line_items:
    columns:
      id: serial primary key
      order_id: FK orders
      product_name: varchar(100)
      quantity: integer

  shipments:
    columns:
      id: serial primary key
      order_id: FK orders
      customer_id: FK customers
      ship_date: date

  employees:
    columns:
      id: serial primary key
      name: varchar(100)
      manager_id: FK employees
```

## Verify self-referential FK

```json
{
  "newSchema": {
    "tables.employees": "@exists",
    "tables.employees.foreignKeys.fk_employees_manager_id": "@exists",
    "tables.employees.foreignKeys.fk_employees_manager_id.parentTable": "employees",
    "tables.employees.foreignKeys.fk_employees_manager_id.childColumn": "manager_id",
    "tables.employees.foreignKeys.fk_employees_manager_id.parentColumn": "id"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "employees"
  }
}
```

## Test self-referential FK

```sql
INSERT INTO employees (name, manager_id) VALUES ('Boss', NULL);
INSERT INTO employees (name, manager_id) VALUES ('Manager', 100);
INSERT INTO employees (name, manager_id) VALUES ('Worker', 101);
SELECT e.name as employee, m.name as manager
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id
ORDER BY e.id;
```

## Verify self-referential data

```json
[
  {"employee": "Boss", "manager": null},
  {"employee": "Manager", "manager": "Boss"},
  {"employee": "Worker", "manager": "Manager"}
]
```
