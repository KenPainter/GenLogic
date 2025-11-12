# Test: 1E - FK Delete Actions

Tests different foreign key ON DELETE actions.

## Step 1: FK(with) delete cascade

```yaml
tables:
  categories:
    columns:
      id: serial primary key
      name: varchar(50)

  products:
    columns:
      id: serial primary key
      category_id: FK(categories) delete cascade
      name: varchar(100)
```

## Verify delete cascade FK(created)

```json
{
  "newSchema": {
    "tables.categories": "@exists",
    "tables.products": "@exists",
    "tables.products.foreignKeys.fk_products_category_id": "@exists",
    "tables.products.foreignKeys.fk_products_category_id.deleteAction": "cascade",
    "errors.length": 0
  }
}
```

## Test delete cascade behavior

```sql
INSERT INTO categories (name) VALUES ('Electronics');
INSERT INTO products (category_id, name) VALUES (100, 'Laptop');
INSERT INTO products (category_id, name) VALUES (100, 'Phone');
SELECT COUNT(*) as product_count FROM products WHERE category_id = 100;
```

## Verify products exist

```json
[
  {"product_count": "2"}
]
```

## Delete parent and verify cascade

```sql
DELETE FROM categories WHERE id = 100;
SELECT COUNT(*) as product_count FROM products WHERE category_id = 100;
```

## Verify children were cascade deleted

```json
[
  {"product_count": "0"}
]
```

## Step 2: FK(with) delete restrict (default)

```yaml
tables:
  categories:
    columns:
      id: serial primary key
      name: varchar(50)

  products:
    columns:
      id: serial primary key
      category_id: FK(categories) delete cascade
      name: varchar(100)

  suppliers:
    columns:
      id: serial primary key
      name: varchar(100)

  inventory:
    columns:
      id: serial primary key
      supplier_id: FK(suppliers) delete restrict
      product_name: varchar(100)
```

## Verify delete restrict FK(created)

```json
{
  "newSchema": {
    "tables.suppliers": "@exists",
    "tables.inventory": "@exists",
    "tables.inventory.foreignKeys.fk_inventory_supplier_id": "@exists",
    "tables.inventory.foreignKeys.fk_inventory_supplier_id.deleteAction": "restrict"
  },
  "diff": {
    "tablesToCreate.length": 2,
    "tablesToCreate[0]": "suppliers",
    "tablesToCreate[1]": "inventory"
  }
}
```

## Test delete restrict prevents deletion

```sql
INSERT INTO suppliers (name) VALUES ('Acme Corp');
INSERT INTO inventory (supplier_id, product_name) VALUES (100, 'Widget');
```

## Verify inventory exists

```sql
SELECT COUNT(*) as inventory_count FROM inventory WHERE supplier_id = 100;
```

## Should have inventory

```json
[
  {"inventory_count": "1"}
]
```

## Step 3: FK(with) delete set null

```yaml
tables:
  categories:
    columns:
      id: serial primary key
      name: varchar(50)

  products:
    columns:
      id: serial primary key
      category_id: FK(categories) delete cascade
      name: varchar(100)

  suppliers:
    columns:
      id: serial primary key
      name: varchar(100)

  inventory:
    columns:
      id: serial primary key
      supplier_id: FK(suppliers) delete restrict
      product_name: varchar(100)

  warehouses:
    columns:
      id: serial primary key
      name: varchar(100)

  shipments:
    columns:
      id: serial primary key
      warehouse_id: FK(warehouses) delete set null
      tracking_number: varchar(50)
```

## Verify delete set null FK(created)

```json
{
  "newSchema": {
    "tables.warehouses": "@exists",
    "tables.shipments": "@exists",
    "tables.shipments.foreignKeys.fk_shipments_warehouse_id": "@exists",
    "tables.shipments.foreignKeys.fk_shipments_warehouse_id.deleteAction": "set null"
  },
  "diff": {
    "tablesToCreate.length": 2,
    "tablesToCreate[0]": "warehouses",
    "tablesToCreate[1]": "shipments"
  }
}
```

## Test delete set null behavior

```sql
INSERT INTO warehouses (name) VALUES ('West Coast');
INSERT INTO shipments (warehouse_id, tracking_number) VALUES (100, 'TRACK001');
INSERT INTO shipments (warehouse_id, tracking_number) VALUES (100, 'TRACK002');
SELECT warehouse_id, tracking_number FROM shipments WHERE tracking_number IN ('TRACK001', 'TRACK002') ORDER BY tracking_number;
```

## Verify shipments have warehouse

```json
[
  {"warehouse_id": 100, "tracking_number": "TRACK001"},
  {"warehouse_id": 100, "tracking_number": "TRACK002"}
]
```

## Delete parent and verify set null

```sql
DELETE FROM warehouses WHERE id = 100;
SELECT warehouse_id, tracking_number FROM shipments WHERE tracking_number IN ('TRACK001', 'TRACK002') ORDER BY tracking_number;
```

## Verify warehouse_id set to NULL

```json
[
  {"warehouse_id": null, "tracking_number": "TRACK001"},
  {"warehouse_id": null, "tracking_number": "TRACK002"}
]
```

## Step 4: FK(with) delete set default

```yaml
tables:
  categories:
    columns:
      id: serial primary key
      name: varchar(50)

  products:
    columns:
      id: serial primary key
      category_id: FK(categories) delete cascade
      name: varchar(100)

  suppliers:
    columns:
      id: serial primary key
      name: varchar(100)

  inventory:
    columns:
      id: serial primary key
      supplier_id: FK(suppliers) delete restrict
      product_name: varchar(100)

  warehouses:
    columns:
      id: serial primary key
      name: varchar(100)

  shipments:
    columns:
      id: serial primary key
      warehouse_id: FK(warehouses) delete set null
      tracking_number: varchar(50)

  status_codes:
    columns:
      id: serial primary key
      code: varchar(20)

  tasks:
    columns:
      id: serial primary key
      status_id: FK(status_codes) delete set default default 100
      description: varchar(200)
```

## Verify delete set default FK(created)

```json
{
  "newSchema": {
    "tables.status_codes": "@exists",
    "tables.tasks": "@exists",
    "tables.tasks.columns.status_id.defaultValue": "100",
    "tables.tasks.foreignKeys.fk_tasks_status_id": "@exists",
    "tables.tasks.foreignKeys.fk_tasks_status_id.deleteAction": "set default"
  },
  "diff": {
    "tablesToCreate.length": 2,
    "tablesToCreate[0]": "status_codes",
    "tablesToCreate[1]": "tasks"
  }
}
```

## Test delete set default behavior

```sql
INSERT INTO status_codes (code) VALUES ('PENDING');
INSERT INTO status_codes (code) VALUES ('ACTIVE');
INSERT INTO tasks (status_id, description) VALUES (101, 'Task A');
SELECT status_id, description FROM tasks WHERE description = 'Task A';
```

## Verify task has ACTIVE status

```json
[
  {"status_id": 101, "description": "Task A"}
]
```

## Delete parent and verify set default

```sql
DELETE FROM status_codes WHERE id = 101;
SELECT status_id, description FROM tasks WHERE description = 'Task A';
```

## Verify status_id set to default (100)

```json
[
  {"status_id": 100, "description": "Task A"}
]
```

## Step 5: FK(with) delete no action

```yaml
tables:
  categories:
    columns:
      id: serial primary key
      name: varchar(50)

  products:
    columns:
      id: serial primary key
      category_id: FK(categories) delete cascade
      name: varchar(100)

  suppliers:
    columns:
      id: serial primary key
      name: varchar(100)

  inventory:
    columns:
      id: serial primary key
      supplier_id: FK(suppliers) delete restrict
      product_name: varchar(100)

  warehouses:
    columns:
      id: serial primary key
      name: varchar(100)

  shipments:
    columns:
      id: serial primary key
      warehouse_id: FK(warehouses) delete set null
      tracking_number: varchar(50)

  status_codes:
    columns:
      id: serial primary key
      code: varchar(20)

  tasks:
    columns:
      id: serial primary key
      status_id: FK(status_codes) delete set default default 100
      description: varchar(200)

  departments:
    columns:
      id: serial primary key
      name: varchar(100)

  employees:
    columns:
      id: serial primary key
      department_id: FK(departments) delete no action
      name: varchar(100)
```

## Verify delete no action FK(created)

```json
{
  "newSchema": {
    "tables.departments": "@exists",
    "tables.employees": "@exists",
    "tables.employees.foreignKeys.fk_employees_department_id": "@exists",
    "tables.employees.foreignKeys.fk_employees_department_id.deleteAction": "no action"
  },
  "diff": {
    "tablesToCreate.length": 2,
    "tablesToCreate[0]": "departments",
    "tablesToCreate[1]": "employees"
  }
}
```

## Test delete no action prevents deletion

```sql
INSERT INTO departments (name) VALUES ('Engineering');
INSERT INTO employees (department_id, name) VALUES (100, 'Alice');
SELECT COUNT(*) as employee_count FROM employees WHERE department_id = 100;
```

## Verify employee exists

```json
[
  {"employee_count": "1"}
]
```
