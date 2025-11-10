# 2B4: SNAPSHOT vs SYNC Side-by-Side Comparison

Comprehensive test demonstrating the behavioral differences between SNAPSHOT and SYNC.
Both automation types respond identically to INSERT and FK changes, but differ on parent updates.

## Build Schema

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      status: varchar(20)
      warranty_months: integer

  sales:
    columns:
      sale_id: serial primary key
      product_id: FK products
      sale_date: date
      quantity: integer

      # SNAPSHOT columns - frozen at sale time
      status_at_sale:
        definition: varchar(20)
        automation: SNAPSHOT products.status

      warranty_at_sale:
        definition: integer
        automation: SNAPSHOT products.warranty_months

      # SYNC columns - always current
      current_status:
        definition: varchar(20)
        automation: SYNC products.status

      current_warranty:
        definition: integer
        automation: SYNC products.warranty_months
```

## Insert Parent Rows

```sql
INSERT INTO products (product_name, status, warranty_months)
VALUES
  ('Laptop Model X', 'Active', 12),
  ('Tablet Pro', 'Active', 24);
```

## Insert Sales

```sql
INSERT INTO sales (product_id, sale_date, quantity)
VALUES
  ((SELECT product_id FROM products WHERE product_name = 'Laptop Model X'), '2025-01-15', 3),
  ((SELECT product_id FROM products WHERE product_name = 'Tablet Pro'), '2025-01-16', 2);
```

## Verify Initial State (SNAPSHOT and SYNC Both Match)

On INSERT, both SNAPSHOT and SYNC capture the same values.

```sql
SELECT sale_date, quantity, status_at_sale, current_status, warranty_at_sale, current_warranty
FROM sales
ORDER BY sale_id;
```

```json
[
  {
    "sale_date": "2025-01-15T00:00:00.000Z",
    "quantity": 3,
    "status_at_sale": "Active",
    "current_status": "Active",
    "warranty_at_sale": 12,
    "current_warranty": 12
  },
  {
    "sale_date": "2025-01-16T00:00:00.000Z",
    "quantity": 2,
    "status_at_sale": "Active",
    "current_status": "Active",
    "warranty_at_sale": 24,
    "current_warranty": 24
  }
]
```

## Update Parent: Discontinue Laptop Model X

```sql
UPDATE products
SET status = 'Discontinued',
    warranty_months = 6
WHERE product_name = 'Laptop Model X';
```

## Verify Divergence: SNAPSHOT Frozen, SYNC Updated

After parent update:
- SNAPSHOT columns retain original values from sale time
- SYNC columns reflect current parent values

```sql
SELECT sale_date, quantity, status_at_sale, current_status, warranty_at_sale, current_warranty
FROM sales
ORDER BY sale_id;
```

```json
[
  {
    "sale_date": "2025-01-15T00:00:00.000Z",
    "quantity": 3,
    "status_at_sale": "Active",
    "current_status": "Discontinued",
    "warranty_at_sale": 12,
    "current_warranty": 6
  },
  {
    "sale_date": "2025-01-16T00:00:00.000Z",
    "quantity": 2,
    "status_at_sale": "Active",
    "current_status": "Active",
    "warranty_at_sale": 24,
    "current_warranty": 24
  }
]
```

## Insert New Sale After Product Discontinued

```sql
INSERT INTO sales (product_id, sale_date, quantity)
VALUES ((SELECT product_id FROM products WHERE product_name = 'Laptop Model X'), '2025-02-01', 1);
```

## Verify New Sale Captures Current (Discontinued) State

New sales capture current parent state (both SNAPSHOT and SYNC start identical).

```sql
SELECT sale_date, quantity, status_at_sale, current_status, warranty_at_sale, current_warranty
FROM sales
WHERE sale_date = '2025-02-01';
```

```json
[
  {
    "sale_date": "2025-02-01T00:00:00.000Z",
    "quantity": 1,
    "status_at_sale": "Discontinued",
    "current_status": "Discontinued",
    "warranty_at_sale": 6,
    "current_warranty": 6
  }
]
```

## Update Product Back to Active

```sql
UPDATE products
SET status = 'Active',
    warranty_months = 18
WHERE product_name = 'Laptop Model X';
```

## Final Verification: Historical Audit Trail

SNAPSHOT provides historical audit trail - shows product state at time of each sale.
SYNC shows current product state across all sales.

```sql
SELECT sale_date, quantity, status_at_sale, current_status, warranty_at_sale, current_warranty
FROM sales
ORDER BY sale_id;
```

```json
[
  {
    "sale_date": "2025-01-15T00:00:00.000Z",
    "quantity": 3,
    "status_at_sale": "Active",
    "current_status": "Active",
    "warranty_at_sale": 12,
    "current_warranty": 18
  },
  {
    "sale_date": "2025-01-16T00:00:00.000Z",
    "quantity": 2,
    "status_at_sale": "Active",
    "current_status": "Active",
    "warranty_at_sale": 24,
    "current_warranty": 24
  },
  {
    "sale_date": "2025-02-01T00:00:00.000Z",
    "quantity": 1,
    "status_at_sale": "Discontinued",
    "current_status": "Active",
    "warranty_at_sale": 6,
    "current_warranty": 18
  }
]
```
