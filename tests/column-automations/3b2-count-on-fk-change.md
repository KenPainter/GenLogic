# 3B2: COUNT on FK Change

Tests that COUNT aggregations update correctly when child FK(changes), moving the child from one parent to another.
Critical path: decrement old parent count, increment new parent count.

## Build Schema

```yaml
tables:
  departments:
    columns:
      department_id: serial primary key
      department_name: varchar(100)

      # COUNT: Number of employees in this department
      employee_count:
        definition: integer
        automation: COUNT employees.employee_id

  employees:
    columns:
      employee_id: serial primary key
      department_id: FK(departments)
      employee_name: varchar(100)
      hire_date: date
```

## Insert Parent Rows

```sql
INSERT INTO departments (department_name)
VALUES ('Engineering'), ('Sales'), ('Marketing');
```

## Insert Employees

```sql
INSERT INTO employees (department_id, employee_name, hire_date)
VALUES
  ((SELECT department_id FROM departments WHERE department_name = 'Engineering'), 'Alice Smith', '2024-01-15'),
  ((SELECT department_id FROM departments WHERE department_name = 'Engineering'), 'Bob Johnson', '2024-02-01'),
  ((SELECT department_id FROM departments WHERE department_name = 'Engineering'), 'Carol White', '2024-03-10'),
  ((SELECT department_id FROM departments WHERE department_name = 'Sales'), 'David Brown', '2024-01-20'),
  ((SELECT department_id FROM departments WHERE department_name = 'Sales'), 'Eve Davis', '2024-04-05');
```

## Verify Initial Counts

```sql
SELECT department_name, employee_count
FROM departments
ORDER BY department_id;
```

```json
[
  {
    "department_name": "Engineering",
    "employee_count": 3
  },
  {
    "department_name": "Sales",
    "employee_count": 2
  },
  {
    "department_name": "Marketing",
    "employee_count": 0
  }
]
```

## Transfer Employee from Engineering to Marketing

```sql
UPDATE employees
SET department_id = (SELECT department_id FROM departments WHERE department_name = 'Marketing')
WHERE employee_name = 'Alice Smith';
```

## Verify Both Departments Updated

```sql
SELECT department_name, employee_count
FROM departments
ORDER BY department_id;
```

```json
[
  {
    "department_name": "Engineering",
    "employee_count": 2
  },
  {
    "department_name": "Sales",
    "employee_count": 2
  },
  {
    "department_name": "Marketing",
    "employee_count": 1
  }
]
```

## Transfer Employee from Sales to Engineering

```sql
UPDATE employees
SET department_id = (SELECT department_id FROM departments WHERE department_name = 'Engineering')
WHERE employee_name = 'David Brown';
```

## Verify All Three Departments

```sql
SELECT department_name, employee_count
FROM departments
ORDER BY department_id;
```

```json
[
  {
    "department_name": "Engineering",
    "employee_count": 3
  },
  {
    "department_name": "Sales",
    "employee_count": 1
  },
  {
    "department_name": "Marketing",
    "employee_count": 1
  }
]
```

## Transfer Multiple Employees

```sql
UPDATE employees
SET department_id = (SELECT department_id FROM departments WHERE department_name = 'Sales')
WHERE employee_name IN ('Bob Johnson', 'Carol White');
```

## Verify Final Distribution

```sql
SELECT department_name, employee_count
FROM departments
ORDER BY department_id;
```

```json
[
  {
    "department_name": "Engineering",
    "employee_count": 1
  },
  {
    "department_name": "Sales",
    "employee_count": 3
  },
  {
    "department_name": "Marketing",
    "employee_count": 1
  }
]
```

## Verify Employee Assignments

```sql
SELECT
  d.department_name,
  e.employee_name,
  e.hire_date
FROM employees e
JOIN departments d ON d.department_id = e.department_id
ORDER BY d.department_id, e.employee_name;
```

```json
[
  {
    "department_name": "Engineering",
    "employee_name": "David Brown",
    "hire_date": "2024-01-20T00:00:00.000Z"
  },
  {
    "department_name": "Sales",
    "employee_name": "Bob Johnson",
    "hire_date": "2024-02-01T00:00:00.000Z"
  },
  {
    "department_name": "Sales",
    "employee_name": "Carol White",
    "hire_date": "2024-03-10T00:00:00.000Z"
  },
  {
    "department_name": "Sales",
    "employee_name": "Eve Davis",
    "hire_date": "2024-04-05T00:00:00.000Z"
  },
  {
    "department_name": "Marketing",
    "employee_name": "Alice Smith",
    "hire_date": "2024-01-15T00:00:00.000Z"
  }
]
```
