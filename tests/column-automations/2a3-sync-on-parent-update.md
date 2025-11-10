# 2A3: SYNC on Parent UPDATE

Tests that child SYNC columns update when parent values change (push-to-children trigger).
This is the key feature that distinguishes SYNC from SNAPSHOT.

## Build Schema

```yaml
tables:
  tax_rates:
    columns:
      jurisdiction_id: serial primary key
      jurisdiction_name: varchar(100)
      sales_tax_rate: numeric(5,4)
      last_updated: date

  invoices:
    columns:
      invoice_id: serial primary key
      jurisdiction_id: FK tax_rates
      invoice_date: date
      subtotal: numeric(10,2)

      # SYNC: Updates when parent tax rate changes
      tax_rate:
        definition: numeric(5,4)
        automation: SYNC tax_rates.sales_tax_rate

      # Formula depends on SYNC'd value
      tax_amount:
        definition: numeric(10,2)
        formula: "subtotal * tax_rate"

      total:
        definition: numeric(10,2)
        formula: "subtotal + tax_amount"
```

## Insert Parent Rows

```sql
INSERT INTO tax_rates (jurisdiction_name, sales_tax_rate, last_updated)
VALUES
  ('California', 0.0725, '2025-01-01'),
  ('Texas', 0.0625, '2025-01-01');
```

## Verify Parent Data

```sql
SELECT jurisdiction_name, sales_tax_rate
FROM tax_rates
ORDER BY jurisdiction_id;
```

```json
[
  {
    "jurisdiction_name": "California",
    "sales_tax_rate": "0.0725"
  },
  {
    "jurisdiction_name": "Texas",
    "sales_tax_rate": "0.0625"
  }
]
```

## Insert Child Rows

```sql
INSERT INTO invoices (jurisdiction_id, invoice_date, subtotal)
VALUES
  ((SELECT jurisdiction_id FROM tax_rates WHERE jurisdiction_name = 'California'), '2025-01-15', 100.00),
  ((SELECT jurisdiction_id FROM tax_rates WHERE jurisdiction_name = 'California'), '2025-01-16', 200.00),
  ((SELECT jurisdiction_id FROM tax_rates WHERE jurisdiction_name = 'Texas'), '2025-01-17', 150.00);
```

## Verify Initial SYNC Values and Calculations

```sql
SELECT subtotal, tax_rate, tax_amount, total
FROM invoices
ORDER BY invoice_id;
```

```json
[
  {
    "subtotal": "100.00",
    "tax_rate": "0.0725",
    "tax_amount": "7.25",
    "total": "107.25"
  },
  {
    "subtotal": "200.00",
    "tax_rate": "0.0725",
    "tax_amount": "14.50",
    "total": "214.50"
  },
  {
    "subtotal": "150.00",
    "tax_rate": "0.0625",
    "tax_amount": "9.38",
    "total": "159.38"
  }
]
```

## Update Parent Tax Rate

California changes sales tax rate from 7.25% to 8.00%.

```sql
UPDATE tax_rates
SET sales_tax_rate = 0.0800,
    last_updated = '2025-02-01'
WHERE jurisdiction_name = 'California';
```

## Verify Parent Change

```sql
SELECT jurisdiction_name, sales_tax_rate, last_updated
FROM tax_rates
ORDER BY jurisdiction_id;
```

```json
[
  {
    "jurisdiction_name": "California",
    "sales_tax_rate": "0.0800",
    "last_updated": "2025-02-01T00:00:00.000Z"
  },
  {
    "jurisdiction_name": "Texas",
    "sales_tax_rate": "0.0625",
    "last_updated": "2025-01-01T00:00:00.000Z"
  }
]
```

## Verify All Children Updated (Push-to-Children)

SYNC columns in all California invoices should automatically update to new rate.
Formula columns that depend on SYNC'd values should recalculate.

```sql
SELECT subtotal, tax_rate, tax_amount, total
FROM invoices
ORDER BY invoice_id;
```

```json
[
  {
    "subtotal": "100.00",
    "tax_rate": "0.0800",
    "tax_amount": "8.00",
    "total": "108.00"
  },
  {
    "subtotal": "200.00",
    "tax_rate": "0.0800",
    "tax_amount": "16.00",
    "total": "216.00"
  },
  {
    "subtotal": "150.00",
    "tax_rate": "0.0625",
    "tax_amount": "9.38",
    "total": "159.38"
  }
]
```

## Update Texas Tax Rate

```sql
UPDATE tax_rates
SET sales_tax_rate = 0.0650,
    last_updated = '2025-02-01'
WHERE jurisdiction_name = 'Texas';
```

## Verify Texas Invoice Updated

```sql
SELECT subtotal, tax_rate, tax_amount, total
FROM invoices
ORDER BY invoice_id DESC
LIMIT 1;
```

```json
[
  {
    "subtotal": "150.00",
    "tax_rate": "0.0650",
    "tax_amount": "9.75",
    "total": "159.75"
  }
]
```
