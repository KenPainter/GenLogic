Previous: [Composite Foreign Keys](composite-foreign-keys.md) | Next: [Cascading Actions](cascading-actions.md)

# Self-Referencing Foreign Key Example

## Overview

Self-referencing foreign keys allow a table to create relationships with itself, enabling hierarchical tree structures like organizational charts, category hierarchies, or comment threads. Each record can reference another record in the same table as its parent.

## Key Concepts

- Self-Referencing: A table's foreign key points back to the same table
- Tree Structures: Build parent-child hierarchies within a single table
- Nullable Parents: Root nodes have NULL parent references
- Recursive Queries: Use WITH RECURSIVE to traverse hierarchies

## YAML Configuration

```yaml
# Self-Referencing Foreign Key Example
# Demonstrates tables that reference themselves (hierarchical data)

columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  name:
    type: varchar
    size: 100

tables:
  categories:
    # Self-referencing foreign key
    foreign_keys:
      parent_fk:
        table: categories  # References the same table

    columns:
      category_id:
        $ref: id

      category_name:
        $ref: name

      # Foreign key column pointing to parent category
      parent_fk:
        type: integer
        # NULL allowed - root categories have no parent
        required: false

      description:
        type: text

  employees:
    # Another self-referencing example
    foreign_keys:
      manager_fk:
        table: employees

    columns:
      employee_id:
        $ref: id

      employee_name:
        $ref: name

      # Manager is also an employee
      manager_fk:
        type: integer
        required: false  # CEO has no manager

      department:
        type: varchar
        size: 50

      salary:
        type: numeric
        size: 10
        decimal: 2

# What this generates:
# 1. categories table with self-referencing parent_fk
# 2. employees table with self-referencing manager_fk
# 3. Foreign key constraints:
#    - categories.parent_fk REFERENCES categories(category_id)
#    - employees.manager_fk REFERENCES employees(employee_id)
```

## Generated SQL

This schema creates self-referencing tables for hierarchical data:

```sql
CREATE TABLE categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(100),
    parent_fk INTEGER REFERENCES categories(category_id),
    description TEXT
);

CREATE TABLE employees (
    employee_id SERIAL PRIMARY KEY,
    employee_name VARCHAR(100),
    manager_fk INTEGER REFERENCES employees(employee_id),
    department VARCHAR(50),
    salary NUMERIC(10,2)
);

CREATE INDEX idx_categories_parent_fk ON categories(parent_fk);
CREATE INDEX idx_employees_manager_fk ON employees(manager_fk);
```

## Usage Examples

```sql
-- Create category hierarchy
INSERT INTO categories (category_name, parent_fk, description)
VALUES ('Electronics', NULL, 'All electronic products');  -- id=1, root

INSERT INTO categories (category_name, parent_fk, description)
VALUES ('Computers', 1, 'Computing devices'),              -- id=2, child of 1
       ('Mobile Devices', 1, 'Phones and tablets');        -- id=3, child of 1

INSERT INTO categories (category_name, parent_fk, description)
VALUES ('Laptops', 2, 'Portable computers'),               -- id=4, child of 2
       ('Desktops', 2, 'Desktop computers'),               -- id=5, child of 2
       ('Smartphones', 3, 'Smart mobile phones');          -- id=6, child of 3

-- Create employee hierarchy
INSERT INTO employees (employee_name, manager_fk, department, salary)
VALUES ('Alice CEO', NULL, 'Executive', 200000.00);        -- id=1, CEO

INSERT INTO employees (employee_name, manager_fk, department, salary)
VALUES ('Bob VP', 1, 'Engineering', 150000.00),            -- id=2, reports to Alice
       ('Carol VP', 1, 'Sales', 145000.00);                -- id=3, reports to Alice

INSERT INTO employees (employee_name, manager_fk, department, salary)
VALUES ('David Manager', 2, 'Engineering', 100000.00),     -- id=4, reports to Bob
       ('Eve Manager', 3, 'Sales', 95000.00);              -- id=5, reports to Carol

-- Find all subcategories of Electronics
SELECT c1.category_name as parent, c2.category_name as child
FROM categories c1
LEFT JOIN categories c2 ON c2.parent_fk = c1.category_id
WHERE c1.category_id = 1;

-- Find all employees reporting to Bob
SELECT employee_name, department, salary
FROM employees
WHERE manager_fk = 2;

-- Get full category path using recursive query
WITH RECURSIVE category_path AS (
  SELECT category_id, category_name, parent_fk, category_name as path, 0 as level
  FROM categories
  WHERE parent_fk IS NULL

  UNION ALL

  SELECT c.category_id, c.category_name, c.parent_fk,
         cp.path || ' > ' || c.category_name, cp.level + 1
  FROM categories c
  JOIN category_path cp ON c.parent_fk = cp.category_id
)
SELECT category_name, path, level
FROM category_path
ORDER BY path;

-- Get employee org chart with recursive query
WITH RECURSIVE org_chart AS (
  SELECT employee_id, employee_name, manager_fk, employee_name as chain, 0 as level
  FROM employees
  WHERE manager_fk IS NULL

  UNION ALL

  SELECT e.employee_id, e.employee_name, e.manager_fk,
         oc.chain || ' > ' || e.employee_name, oc.level + 1
  FROM employees e
  JOIN org_chart oc ON e.manager_fk = oc.employee_id
)
SELECT employee_name, chain, level
FROM org_chart
ORDER BY level, employee_name;

-- Count direct reports for each employee
SELECT e1.employee_name, COUNT(e2.employee_id) as direct_reports
FROM employees e1
LEFT JOIN employees e2 ON e2.manager_fk = e1.employee_id
GROUP BY e1.employee_id, e1.employee_name
ORDER BY direct_reports DESC;
```

---

Previous: [Composite Foreign Keys](composite-foreign-keys.md) | Next: [Cascading Actions](cascading-actions.md)
