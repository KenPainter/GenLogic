# 3A4: SUM on FK Change (Moving Between Parents)

Tests that SUM aggregations update correctly when child FK(changes), moving the child from one parent to another.
Critical path: subtract from old parent, add to new parent.

## Build Schema

```yaml
tables:
  projects:
    columns:
      project_id: serial primary key
      project_name: varchar(100)

      # SUM: Total hours allocated to this project
      total_hours:
        definition: numeric(8,2)
        automation: SUM tasks.hours_allocated

  tasks:
    columns:
      task_id: serial primary key
      project_id: FK(projects)
      task_name: varchar(200)
      hours_allocated: numeric(8,2)
```

## Insert Parent Rows

```sql
INSERT INTO projects (project_name)
VALUES ('Project Alpha'), ('Project Beta'), ('Project Gamma');
```

## Insert Tasks

```sql
INSERT INTO tasks (project_id, task_name, hours_allocated)
VALUES
  ((SELECT project_id FROM projects WHERE project_name = 'Project Alpha'), 'Design mockups', 20.00),
  ((SELECT project_id FROM projects WHERE project_name = 'Project Alpha'), 'User research', 15.00),
  ((SELECT project_id FROM projects WHERE project_name = 'Project Alpha'), 'Prototyping', 30.00),
  ((SELECT project_id FROM projects WHERE project_name = 'Project Beta'), 'Backend API', 40.00),
  ((SELECT project_id FROM projects WHERE project_name = 'Project Beta'), 'Database schema', 10.00);
```

## Verify Initial Totals

```sql
SELECT project_name, total_hours
FROM projects
ORDER BY project_id;
```

```json
[
  {
    "project_name": "Project Alpha",
    "total_hours": "65.00"
  },
  {
    "project_name": "Project Beta",
    "total_hours": "50.00"
  },
  {
    "project_name": "Project Gamma",
    "total_hours": "0.00"
  }
]
```

## Move Task from Alpha to Beta

```sql
UPDATE tasks
SET project_id = (SELECT project_id FROM projects WHERE project_name = 'Project Beta')
WHERE task_name = 'Prototyping';
```

## Verify Both Projects Updated

Alpha should decrease by 30.00, Beta should increase by 30.00.

```sql
SELECT project_name, total_hours
FROM projects
ORDER BY project_id;
```

```json
[
  {
    "project_name": "Project Alpha",
    "total_hours": "35.00"
  },
  {
    "project_name": "Project Beta",
    "total_hours": "80.00"
  },
  {
    "project_name": "Project Gamma",
    "total_hours": "0.00"
  }
]
```

## Move Task from Beta to Gamma

```sql
UPDATE tasks
SET project_id = (SELECT project_id FROM projects WHERE project_name = 'Project Gamma')
WHERE task_name = 'Backend API';
```

## Verify All Three Projects

```sql
SELECT project_name, total_hours
FROM projects
ORDER BY project_id;
```

```json
[
  {
    "project_name": "Project Alpha",
    "total_hours": "35.00"
  },
  {
    "project_name": "Project Beta",
    "total_hours": "40.00"
  },
  {
    "project_name": "Project Gamma",
    "total_hours": "40.00"
  }
]
```

## Move Multiple Tasks in Sequence

```sql
UPDATE tasks
SET project_id = (SELECT project_id FROM projects WHERE project_name = 'Project Gamma')
WHERE task_name = 'Design mockups';

UPDATE tasks
SET project_id = (SELECT project_id FROM projects WHERE project_name = 'Project Gamma')
WHERE task_name = 'Database schema';
```

## Verify Final Distribution

```sql
SELECT project_name, total_hours
FROM projects
ORDER BY project_id;
```

```json
[
  {
    "project_name": "Project Alpha",
    "total_hours": "15.00"
  },
  {
    "project_name": "Project Beta",
    "total_hours": "30.00"
  },
  {
    "project_name": "Project Gamma",
    "total_hours": "70.00"
  }
]
```

## Verify Task Assignments

```sql
SELECT
  p.project_name,
  t.task_name,
  t.hours_allocated
FROM tasks t
JOIN projects p ON p.project_id = t.project_id
ORDER BY p.project_id, t.task_id;
```

```json
[
  {
    "project_name": "Project Alpha",
    "task_name": "User research",
    "hours_allocated": "15.00"
  },
  {
    "project_name": "Project Beta",
    "task_name": "Prototyping",
    "hours_allocated": "30.00"
  },
  {
    "project_name": "Project Gamma",
    "task_name": "Design mockups",
    "hours_allocated": "20.00"
  },
  {
    "project_name": "Project Gamma",
    "task_name": "Backend API",
    "hours_allocated": "40.00"
  },
  {
    "project_name": "Project Gamma",
    "task_name": "Database schema",
    "hours_allocated": "10.00"
  }
]
```
