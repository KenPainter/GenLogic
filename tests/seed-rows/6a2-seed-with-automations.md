# 6A2: Seed Rows with Automations

Tests that seed rows trigger SYNC, SNAPSHOT, and aggregation automations.
Covers: seed data with triggers, automation columns calculated on seed.

## Build Schema

```yaml
tables:
  warehouses:
    columns:
      warehouse_id: serial primary key
      warehouse_name: varchar(100)
      total_quantity:
        definition: integer
        automation: SUM inventory.quantity
    seed-rows:
      - warehouse_id: 1
        warehouse_name: Main Warehouse
      - warehouse_id: 2
        warehouse_name: Backup Warehouse

  inventory:
    columns:
      inventory_id: serial primary key
      warehouse_id: FK warehouses
      product_name: varchar(100)
      quantity: integer

      # SYNC: Pull warehouse name
      warehouse_name_sync:
        definition: varchar(100)
        automation: SYNC warehouses.warehouse_name
    seed-rows:
      - inventory_id: 1
        warehouse_id: 1
        product_name: Widget A
        quantity: 100
      - inventory_id: 2
        warehouse_id: 1
        product_name: Widget B
        quantity: 50
      - inventory_id: 3
        warehouse_id: 2
        product_name: Widget C
        quantity: 75
```

## Verify Warehouses Seeded

```sql
SELECT warehouse_id, warehouse_name, total_quantity
FROM warehouses
ORDER BY warehouse_id;
```

```json
[
  {
    "warehouse_id": 1,
    "warehouse_name": "Main Warehouse",
    "total_quantity": 150
  },
  {
    "warehouse_id": 2,
    "warehouse_name": "Backup Warehouse",
    "total_quantity": 75
  }
]
```

## Verify Inventory Seeded with SYNC

```sql
SELECT inventory_id, product_name, warehouse_id, warehouse_name_sync, quantity
FROM inventory
ORDER BY inventory_id;
```

```json
[
  {
    "inventory_id": 1,
    "product_name": "Widget A",
    "warehouse_id": 1,
    "warehouse_name_sync": "Main Warehouse",
    "quantity": 100
  },
  {
    "inventory_id": 2,
    "product_name": "Widget B",
    "warehouse_id": 1,
    "warehouse_name_sync": "Main Warehouse",
    "quantity": 50
  },
  {
    "inventory_id": 3,
    "product_name": "Widget C",
    "warehouse_id": 2,
    "warehouse_name_sync": "Backup Warehouse",
    "quantity": 75
  }
]
```

## Insert New Inventory (Verify Triggers Still Work)

```sql
INSERT INTO inventory (product_name, warehouse_id, quantity)
VALUES ('Widget D', 1, 25);
```

## Verify Aggregation Updated

```sql
SELECT warehouse_id, warehouse_name, total_quantity
FROM warehouses
WHERE warehouse_id = 1;
```

```json
[
  {
    "warehouse_id": 1,
    "warehouse_name": "Main Warehouse",
    "total_quantity": 175
  }
]
```

## Verify SYNC Populated

```sql
SELECT product_name, warehouse_name_sync, quantity
FROM inventory
WHERE product_name = 'Widget D';
```

```json
[
  {
    "product_name": "Widget D",
    "warehouse_name_sync": "Main Warehouse",
    "quantity": 25
  }
]
```

## Update Warehouse Name

```sql
UPDATE warehouses
SET warehouse_name = 'Primary Distribution Center'
WHERE warehouse_id = 1;
```

## Verify SYNC Cascaded to All Inventory

```sql
SELECT inventory_id, product_name, warehouse_name_sync
FROM inventory
WHERE warehouse_id = 1
ORDER BY inventory_id;
```

```json
[
  {
    "inventory_id": 1,
    "product_name": "Widget A",
    "warehouse_name_sync": "Primary Distribution Center"
  },
  {
    "inventory_id": 2,
    "product_name": "Widget B",
    "warehouse_name_sync": "Primary Distribution Center"
  },
  {
    "inventory_id": 100,
    "product_name": "Widget D",
    "warehouse_name_sync": "Primary Distribution Center"
  }
]
```
