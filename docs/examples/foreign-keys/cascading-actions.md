Previous: [Self-Referencing](../foreign-keys/self-referencing.md) | Next: [SUM Automation](../automations/sum-automation.md)

# Cascading Actions Example

## Overview

Cascading actions control what happens to child records when parent records are modified or deleted. GenLogic supports CASCADE (propagate changes), RESTRICT (prevent changes), and SET NULL (nullify references). These actions maintain referential integrity while providing flexibility in how relationships are managed.

## Key Concepts

- CASCADE: Automatically propagate deletions/updates to child records
- RESTRICT: Prevent parent modifications if children exist (default behavior)
- SET NULL: Set foreign key to NULL when parent is deleted/updated
- on_delete: Specifies action when parent record is deleted
- on_update: Specifies action when parent primary key is updated

## YAML Configuration

```yaml
# Cascading Actions Example
# Demonstrates foreign keys with CASCADE, RESTRICT, SET NULL actions

columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  name:
    type: varchar
    size: 100

tables:
  departments:
    columns:
      department_id:
        $ref: id

      department_name:
        $ref: name

  employees:
    foreign_keys:
      department_fk:
        table: departments
        # When department is deleted, SET NULL on employees
        on_delete: SET NULL
        # When department ID changes, CASCADE the change
        on_update: CASCADE

    columns:
      employee_id:
        $ref: id

      employee_name:
        $ref: name

      department_fk:
        type: integer
        required: false  # Can be NULL due to SET NULL

  orders:
    foreign_keys:
      employee_fk:
        table: employees
        # When employee is deleted, don't allow if they have orders
        on_delete: RESTRICT
        on_update: CASCADE

    columns:
      order_id:
        $ref: id

      order_date:
        type: date

      employee_fk:
        type: integer
        required: true

  order_items:
    foreign_keys:
      order_fk:
        table: orders
        # When order is deleted, delete all its items
        on_delete: CASCADE
        on_update: CASCADE

    columns:
      item_id:
        $ref: id

      order_fk:
        type: integer
        required: true

      product_name:
        $ref: name

      quantity:
        type: integer

# Cascading Action Types:
# CASCADE: When parent deleted, delete all children
# RESTRICT: Prevent parent deletion if children exist
# SET NULL: When parent deleted, set child FK to NULL
```

## Generated SQL

This schema creates tables with different cascading actions:

```sql
CREATE TABLE departments (
    department_id SERIAL PRIMARY KEY,
    department_name VARCHAR(100)
);

CREATE TABLE employees (
    employee_id SERIAL PRIMARY KEY,
    employee_name VARCHAR(100),
    department_fk INTEGER REFERENCES departments(department_id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    order_date DATE,
    employee_fk INTEGER NOT NULL REFERENCES employees(employee_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);

CREATE TABLE order_items (
    item_id SERIAL PRIMARY KEY,
    order_fk INTEGER NOT NULL REFERENCES orders(order_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    product_name VARCHAR(100),
    quantity INTEGER
);

CREATE INDEX idx_employees_department_fk ON employees(department_fk);
CREATE INDEX idx_orders_employee_fk ON orders(employee_fk);
CREATE INDEX idx_order_items_order_fk ON order_items(order_fk);
```

## Usage Examples

```sql
-- Create test data
INSERT INTO departments (department_name)
VALUES ('Sales'), ('Engineering'), ('Marketing');

INSERT INTO employees (employee_name, department_fk)
VALUES ('Alice', 1), ('Bob', 2), ('Carol', 1);

INSERT INTO orders (order_date, employee_fk)
VALUES ('2024-01-15', 1), ('2024-01-16', 2);

INSERT INTO order_items (order_fk, product_name, quantity)
VALUES (1, 'Widget A', 5), (1, 'Widget B', 3), (2, 'Gadget X', 2);

-- Example 1: SET NULL action
-- Delete department 1 (Sales)
DELETE FROM departments WHERE department_id = 1;
-- Result: Alice and Carol's department_fk becomes NULL
-- They remain in employees table but have no department

SELECT employee_name, department_fk FROM employees;
-- Alice  | NULL
-- Bob    | 2
-- Carol  | NULL

-- Example 2: RESTRICT action
-- Try to delete an employee with orders
DELETE FROM employees WHERE employee_id = 1;
-- ERROR: Cannot delete employee because orders exist
-- RESTRICT prevents deletion

-- Example 3: CASCADE action
-- Delete an order with items
DELETE FROM orders WHERE order_id = 1;
-- Result: All order_items with order_fk = 1 are automatically deleted
-- Both "Widget A" and "Widget B" items are removed

SELECT * FROM order_items;
-- Only order_id 2 items remain

-- Example 4: UPDATE CASCADE
-- Change an employee's ID (rare but demonstrates UPDATE CASCADE)
UPDATE employees SET employee_id = 100 WHERE employee_id = 2;
-- Result: All orders with employee_fk = 2 now have employee_fk = 100

-- Demonstrate workflow with all actions
INSERT INTO departments (department_name) VALUES ('Support');
INSERT INTO employees (employee_name, department_fk) VALUES ('Diana', 4);
INSERT INTO orders (order_date, employee_fk) VALUES ('2024-01-17', 4);
INSERT INTO order_items (order_fk, product_name, quantity) VALUES (3, 'Tool Z', 1);

-- Now if we delete the order:
DELETE FROM orders WHERE order_id = 3;
-- CASCADE: order_items for order 3 are deleted
-- Diana (employee 4) remains in database

-- If we delete the department:
DELETE FROM departments WHERE department_id = 4;
-- SET NULL: Diana's department_fk becomes NULL
-- Diana remains in employees table

-- If we try to delete Diana:
-- Would fail with RESTRICT if she had orders
-- Would succeed if no orders exist
```

## Cascading Behavior Summary

| Action | ON DELETE | ON UPDATE | Use Case |
|--------|-----------|-----------|----------|
| CASCADE | Delete children | Update child FKs | Order items, audit logs |
| RESTRICT | Prevent deletion | Prevent PK changes | Critical references |
| SET NULL | Nullify child FKs | Nullify child FKs | Optional relationships |

---

Previous: [Self-Referencing](../foreign-keys/self-referencing.md) | Next: [SUM Automation](../automations/sum-automation.md)
