# 10a1. INSERT Subversion Attempts

Tests that automated columns cannot be subverted by direct INSERT with bogus values.
All four column types (SYNC, SNAPSHOT, Formula, Aggregate) should reject user input.

## Build Schema

```yaml
tables:
  vendors:
    columns:
      vendor_id: serial primary key
      vendor_name: varchar(100)
      tax_rate: numeric(5,4)

      # Aggregation columns (should be initialized to 0 on INSERT)
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

      # SYNC column (should pull from vendor on INSERT)
      vendor_tax_rate:
        definition: numeric(5,4)
        automation: SYNC vendors.tax_rate

      # SNAPSHOT column (should pull from vendor on INSERT)
      snapshot_tax_rate:
        definition: numeric(5,4)
        automation: SNAPSHOT vendors.tax_rate

      # Formula column (should calculate on INSERT)
      total_with_tax:
        definition: numeric(10,2)
        formula: order_amount * (1 + vendor_tax_rate)
```

## Insert Vendor with Valid Data

```sql
INSERT INTO vendors (vendor_id, vendor_name, tax_rate)
VALUES (1, 'ACME Corp', 0.0825);
```

## Verify Vendor Inserted with Initialized Aggregations

```sql
SELECT vendor_id, vendor_name, tax_rate, order_count, order_total
FROM vendors;
```

```json
[
  {
    "vendor_id": 1,
    "vendor_name": "ACME Corp",
    "tax_rate": "0.0825",
    "order_count": 0,
    "order_total": "0.00"
  }
]
```

## Test: Attempt INSERT with Bogus Aggregation Values

User tries to subvert order_count and order_total with bogus values.
Aggregation initialization should overwrite these to 0.

```sql
INSERT INTO vendors (vendor_id, vendor_name, tax_rate, order_count, order_total)
VALUES (2, 'Evil Vendor', 0.1000, 999, 88888.88);
```

## Verify Aggregations Initialized to Zero

```sql
SELECT vendor_id, vendor_name, order_count, order_total
FROM vendors
WHERE vendor_name = 'Evil Vendor';
```

```json
[
  {
    "vendor_id": 2,
    "vendor_name": "Evil Vendor",
    "order_count": 0,
    "order_total": "0.00"
  }
]
```

## Insert Order with Valid Data

```sql
INSERT INTO orders (order_id, vendor_id, order_date, order_amount, quantity)
VALUES (1, 1, '2025-01-15', 100.00, 5);
```

## Verify Order Inserted with Automated Values

```sql
SELECT order_id, vendor_id, order_amount, vendor_tax_rate, snapshot_tax_rate, total_with_tax
FROM orders;
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
  }
]
```

## Test: Attempt INSERT with Bogus SYNC Value

User tries to subvert vendor_tax_rate (SYNC column) with bogus value.
Trigger should overwrite this by pulling from vendor.

```sql
INSERT INTO orders (order_id, vendor_id, order_date, order_amount, quantity, vendor_tax_rate)
VALUES (2, 1, '2025-01-16', 200.00, 10, 0.9999);
```

## Verify SYNC Column Overwritten

```sql
SELECT order_id, vendor_id, order_amount, vendor_tax_rate
FROM orders
WHERE order_id = 2;
```

```json
[
  {
    "order_id": 2,
    "vendor_id": 1,
    "order_amount": "200.00",
    "vendor_tax_rate": "0.0825"
  }
]
```

## Test: Attempt INSERT with Bogus SNAPSHOT Value

User tries to subvert snapshot_tax_rate (SNAPSHOT column) with bogus value.
Trigger should overwrite this by pulling from vendor.

```sql
INSERT INTO orders (order_id, vendor_id, order_date, order_amount, quantity, snapshot_tax_rate)
VALUES (3, 1, '2025-01-17', 300.00, 15, 0.8888);
```

## Verify SNAPSHOT Column Overwritten

```sql
SELECT order_id, vendor_id, order_amount, snapshot_tax_rate
FROM orders
WHERE order_id = 3;
```

```json
[
  {
    "order_id": 3,
    "vendor_id": 1,
    "order_amount": "300.00",
    "snapshot_tax_rate": "0.0825"
  }
]
```

## Test: Attempt INSERT with Bogus Formula Value

User tries to subvert total_with_tax (formula column) with bogus value.
Trigger should overwrite this with calculated value.

```sql
INSERT INTO orders (order_id, vendor_id, order_date, order_amount, quantity, total_with_tax)
VALUES (4, 1, '2025-01-18', 400.00, 20, 999999.99);
```

## Verify Formula Column Calculated

```sql
SELECT order_id, vendor_id, order_amount, vendor_tax_rate, total_with_tax
FROM orders
WHERE order_id = 4;
```

```json
[
  {
    "order_id": 4,
    "vendor_id": 1,
    "order_amount": "400.00",
    "vendor_tax_rate": "0.0825",
    "total_with_tax": "433.00"
  }
]
```

## Test: Attempt INSERT with ALL Bogus Values at Once

User tries to subvert all automated columns simultaneously.
All should be overwritten by triggers.

```sql
INSERT INTO orders (order_id, vendor_id, order_date, order_amount, quantity, vendor_tax_rate, snapshot_tax_rate, total_with_tax)
VALUES (5, 1, '2025-01-19', 500.00, 25, 0.1111, 0.2222, 777777.77);
```

## Verify All Automated Columns Correct

```sql
SELECT order_id, vendor_id, order_amount, vendor_tax_rate, snapshot_tax_rate, total_with_tax
FROM orders
WHERE order_id = 5;
```

```json
[
  {
    "order_id": 5,
    "vendor_id": 1,
    "order_amount": "500.00",
    "vendor_tax_rate": "0.0825",
    "snapshot_tax_rate": "0.0825",
    "total_with_tax": "541.25"
  }
]
```

## Verify Aggregations Updated Correctly

After 5 orders inserted, vendor aggregations should reflect reality (not bogus initial values).

```sql
SELECT vendor_id, vendor_name, order_count, order_total
FROM vendors
WHERE vendor_id = 1;
```

```json
[
  {
    "vendor_id": 1,
    "vendor_name": "ACME Corp",
    "order_count": 5,
    "order_total": "1500.00"
  }
]
```
