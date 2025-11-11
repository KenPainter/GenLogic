# 10a2. UPDATE Subversion Attempts

Tests that automated columns cannot be subverted by direct UPDATE.
- Formula columns: Trigger overwrites user input
- SYNC columns: Permission denied (column-level grant restriction)
- SNAPSHOT columns: Permission denied (column-level grant restriction)
- Aggregate columns: Permission denied (column-level grant restriction)

## Build Schema

```yaml
tables:
  vendors:
    columns:
      vendor_id: serial primary key
      vendor_name: varchar(100)
      tax_rate: numeric(5,4)

      # Aggregation columns
      order_count:
        definition: integer
        automation: COUNT orders.order_id
      order_total:
        definition: numeric(12,2)
        automation: SUM orders.order_amount

  orders:
    columns:
      order_id: serial primary key
      vendor_id: FK vendors
      order_date: date
      order_amount: numeric(10,2)
      quantity: integer

      # SYNC column
      vendor_tax_rate:
        definition: numeric(5,4)
        automation: SYNC vendors.tax_rate

      # SNAPSHOT column
      snapshot_tax_rate:
        definition: numeric(5,4)
        automation: SNAPSHOT vendors.tax_rate

      # Formula column
      total_with_tax:
        definition: numeric(10,2)
        formula: order_amount * (1 + vendor_tax_rate)
```

## Insert Test Data

```sql
INSERT INTO vendors (vendor_id, vendor_name, tax_rate)
VALUES (1, 'ACME Corp', 0.0825);

INSERT INTO orders (order_id, vendor_id, order_date, order_amount, quantity)
VALUES
  (1, 1, '2025-01-15', 100.00, 5),
  (2, 1, '2025-01-16', 200.00, 10);
```

## Verify Test Data Inserted

```sql
SELECT order_id, vendor_id, order_amount, vendor_tax_rate, snapshot_tax_rate, total_with_tax
FROM orders
ORDER BY order_id;
```

```json
[
  {
    "order_id": 1,
    "vendor_id": 1,
    "order_amount": "100.00",
    "vendor_tax_rate": "0.0825",
    "snapshot_tax_rate": "0.0825",
    "total_with_tax": "108.25"
  },
  {
    "order_id": 2,
    "vendor_id": 1,
    "order_amount": "200.00",
    "vendor_tax_rate": "0.0825",
    "snapshot_tax_rate": "0.0825",
    "total_with_tax": "216.50"
  }
]
```

## Verify Initial Aggregations

```sql
SELECT vendor_id, vendor_name, order_count, order_total
FROM vendors;
```

```json
[
  {
    "vendor_id": 1,
    "vendor_name": "ACME Corp",
    "order_count": 2,
    "order_total": "300.00"
  }
]
```

## Test: Attempt UPDATE of Formula Column

User tries to subvert total_with_tax (formula column).
Trigger should recalculate and overwrite the bogus value.

```sql
UPDATE orders
SET order_amount = 150.00,
    total_with_tax = 999999.99
WHERE order_id = 1;
```

## Verify Formula Overwrite

```sql
SELECT order_id, order_amount, vendor_tax_rate, total_with_tax
FROM orders
WHERE order_id = 1;
```

```json
[
  {
    "order_id": 1,
    "order_amount": "150.00",
    "vendor_tax_rate": "0.0825",
    "total_with_tax": "162.38"
  }
]
```

## Test: Attempt UPDATE of SYNC Column (Should Fail)

User tries to subvert vendor_tax_rate (SYNC column) without changing FK.
Column-level permissions should block this with permission denied error.

```sql
UPDATE orders
SET vendor_tax_rate = 0.9999
WHERE order_id = 1;
```

```json
{
  "error": "permission denied"
}
```

## Test: Attempt UPDATE of SNAPSHOT Column (Should Fail)

User tries to subvert snapshot_tax_rate (SNAPSHOT column) without changing FK.
Column-level permissions should block this with permission denied error.

```sql
UPDATE orders
SET snapshot_tax_rate = 0.8888
WHERE order_id = 1;
```

```json
{
  "error": "permission denied"
}
```

## Test: Attempt UPDATE of Aggregate Column (Should Fail)

User tries to subvert order_count (aggregate column).
Column-level permissions should block this with permission denied error.

```sql
UPDATE vendors
SET order_count = 999
WHERE vendor_id = 1;
```

```json
{
  "error": "permission denied"
}
```

## Test: Attempt UPDATE of Another Aggregate Column (Should Fail)

User tries to subvert order_total (aggregate column).
Column-level permissions should block this with permission denied error.

```sql
UPDATE vendors
SET order_total = 88888.88
WHERE vendor_id = 1;
```

```json
{
  "error": "permission denied"
}
```

## Test: User Can Still UPDATE Non-Automated Columns

Verify that column-level permissions don't break legitimate updates.

```sql
UPDATE orders
SET order_date = '2025-01-20',
    quantity = 99
WHERE order_id = 1;
```

## Verify Non-Automated Update Succeeded

```sql
SELECT order_id, order_date, quantity
FROM orders
WHERE order_id = 1;
```

```json
[
  {
    "order_id": 1,
    "order_date": "2025-01-20",
    "quantity": 99
  }
]
```

## Test: User Can UPDATE Vendor Name

Verify that non-automated columns on parent tables work too.

```sql
UPDATE vendors
SET vendor_name = 'ACME Corporation'
WHERE vendor_id = 1;
```

## Verify Vendor Update Succeeded

```sql
SELECT vendor_id, vendor_name
FROM vendors;
```

```json
[
  {
    "vendor_id": 1,
    "vendor_name": "ACME Corporation"
  }
]
```

## Verify Data Integrity After All Tests

All automated columns should still have correct values (not subverted).

```sql
SELECT order_id, order_amount, vendor_tax_rate, snapshot_tax_rate, total_with_tax
FROM orders
ORDER BY order_id;
```

```json
[
  {
    "order_id": 1,
    "order_amount": "150.00",
    "vendor_tax_rate": "0.0825",
    "snapshot_tax_rate": "0.0825",
    "total_with_tax": "162.38"
  },
  {
    "order_id": 2,
    "order_amount": "200.00",
    "vendor_tax_rate": "0.0825",
    "snapshot_tax_rate": "0.0825",
    "total_with_tax": "216.50"
  }
]
```

```sql
SELECT vendor_id, order_count, order_total
FROM vendors;
```

```json
[
  {
    "vendor_id": 1,
    "order_count": 2,
    "order_total": "350.00"
  }
]
```
