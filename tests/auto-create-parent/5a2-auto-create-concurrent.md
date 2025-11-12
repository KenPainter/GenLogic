# 5A2: Auto-Create Parent with Multiple Concurrent Children

Tests auto-create parent when multiple children reference the same non-existent parent in a single transaction.
Covers: deduplication, race conditions, idempotency.

## Build Schema

```yaml
tables:
  departments:
    columns:
      dept_id: serial primary key
      dept_name: varchar(100)

  employees:
    columns:
      employee_id: serial primary key
      employee_name: varchar(100)
      dept_id: FK(departments) auto create parent
```

## Insert Multiple Employees with Same Non-Existent Department

```sql
INSERT INTO employees (employee_name, dept_id)
VALUES
  ('Alice', 10),
  ('Bob', 10),
  ('Carol', 10);
```

## Verify All Employees Created

```sql
SELECT employee_id, employee_name, dept_id
FROM employees
ORDER BY employee_id;
```

```json
[
  {
    "employee_id": 100,
    "employee_name": "Alice",
    "dept_id": 10
  },
  {
    "employee_id": 101,
    "employee_name": "Bob",
    "dept_id": 10
  },
  {
    "employee_id": 102,
    "employee_name": "Carol",
    "dept_id": 10
  }
]
```

## Verify Only One Department Created

```sql
SELECT dept_id, dept_name
FROM departments;
```

```json
[
  {
    "dept_id": 10,
    "dept_name": null
  }
]
```

## Insert Employees Across Multiple Departments

```sql
INSERT INTO employees (employee_name, dept_id)
VALUES
  ('David', 20),
  ('Eve', 30),
  ('Frank', 20);
```

## Verify All Employees Inserted

```sql
SELECT employee_id, employee_name, dept_id
FROM employees
ORDER BY employee_id;
```

```json
[
  {
    "employee_id": 100,
    "employee_name": "Alice",
    "dept_id": 10
  },
  {
    "employee_id": 101,
    "employee_name": "Bob",
    "dept_id": 10
  },
  {
    "employee_id": 102,
    "employee_name": "Carol",
    "dept_id": 10
  },
  {
    "employee_id": 103,
    "employee_name": "David",
    "dept_id": 20
  },
  {
    "employee_id": 104,
    "employee_name": "Eve",
    "dept_id": 30
  },
  {
    "employee_id": 105,
    "employee_name": "Frank",
    "dept_id": 20
  }
]
```

## Verify Correct Departments Created

```sql
SELECT dept_id, dept_name
FROM departments
ORDER BY dept_id;
```

```json
[
  {
    "dept_id": 10,
    "dept_name": null
  },
  {
    "dept_id": 20,
    "dept_name": null
  },
  {
    "dept_id": 30,
    "dept_name": null
  }
]
```

## Update Employee Department (FK Change)

```sql
UPDATE employees
SET dept_id = 40
WHERE employee_name = 'Alice';
```

## Verify New Department Auto-Created on UPDATE

```sql
SELECT dept_id, dept_name
FROM departments
ORDER BY dept_id;
```

```json
[
  {
    "dept_id": 10,
    "dept_name": null
  },
  {
    "dept_id": 20,
    "dept_name": null
  },
  {
    "dept_id": 30,
    "dept_name": null
  },
  {
    "dept_id": 40,
    "dept_name": null
  }
]
```

## Verify Employee FK Updated

```sql
SELECT employee_name, dept_id
FROM employees
WHERE employee_name = 'Alice';
```

```json
[
  {
    "employee_name": "Alice",
    "dept_id": 40
  }
]
```
