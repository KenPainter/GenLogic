# 6A3: Seed Rows with Formulas

Tests that seed rows trigger formula calculations.
Covers: seed data with formulas, formula dependency chains.

## Build Schema

```yaml
tables:
  invoices:
    columns:
      invoice_id: serial primary key
      customer_name: varchar(100)
      hours_worked: numeric(10,2)
      hourly_rate: numeric(10,2)
      tax_rate: numeric(5,4)

      # Formula: Labor cost
      labor_cost:
        definition: numeric(10,2)
        formula: "hours_worked * hourly_rate"

      # Formula: Tax amount (depends on labor_cost)
      tax_amount:
        definition: numeric(10,2)
        formula: "labor_cost * tax_rate"

      # Formula: Total (depends on labor_cost and tax_amount)
      total:
        definition: numeric(10,2)
        formula: "labor_cost + tax_amount"
    seed-rows:
      - invoice_id: 1
        customer_name: Acme Corp
        hours_worked: 40.00
        hourly_rate: 100.00
        tax_rate: 0.0825
      - invoice_id: 2
        customer_name: TechStart Inc
        hours_worked: 25.50
        hourly_rate: 150.00
        tax_rate: 0.0825
      - invoice_id: 3
        customer_name: Global Industries
        hours_worked: 60.00
        hourly_rate: 125.00
        tax_rate: 0.0725
```

## Verify Invoices Seeded with Formulas Calculated

```sql
SELECT invoice_id, customer_name, hours_worked, hourly_rate,
       labor_cost, tax_rate, tax_amount, total
FROM invoices
ORDER BY invoice_id;
```

```json
[
  {
    "invoice_id": 1,
    "customer_name": "Acme Corp",
    "hours_worked": "40.00",
    "hourly_rate": "100.00",
    "labor_cost": "4000.00",
    "tax_rate": "0.0825",
    "tax_amount": "330.00",
    "total": "4330.00"
  },
  {
    "invoice_id": 2,
    "customer_name": "TechStart Inc",
    "hours_worked": "25.50",
    "hourly_rate": "150.00",
    "labor_cost": "3825.00",
    "tax_rate": "0.0825",
    "tax_amount": "315.56",
    "total": "4140.56"
  },
  {
    "invoice_id": 3,
    "customer_name": "Global Industries",
    "hours_worked": "60.00",
    "hourly_rate": "125.00",
    "labor_cost": "7500.00",
    "tax_rate": "0.0725",
    "tax_amount": "543.75",
    "total": "8043.75"
  }
]
```

## Insert New Invoice (Verify Formulas Still Work)

```sql
INSERT INTO invoices (customer_name, hours_worked, hourly_rate, tax_rate)
VALUES ('StartupXYZ', 15.00, 200.00, 0.0825);
```

## Verify New Invoice Formulas Calculated

```sql
SELECT invoice_id, customer_name, hours_worked, hourly_rate,
       labor_cost, tax_amount, total
FROM invoices
WHERE customer_name = 'StartupXYZ';
```

```json
[
  {
    "invoice_id": 100,
    "customer_name": "StartupXYZ",
    "hours_worked": "15.00",
    "hourly_rate": "200.00",
    "labor_cost": "3000.00",
    "tax_amount": "247.50",
    "total": "3247.50"
  }
]
```

## Update Seeded Invoice

```sql
UPDATE invoices
SET hourly_rate = 110.00
WHERE invoice_id = 1;
```

## Verify Formula Chain Recalculated

```sql
SELECT invoice_id, customer_name, hourly_rate,
       labor_cost, tax_amount, total
FROM invoices
WHERE invoice_id = 1;
```

```json
[
  {
    "invoice_id": 1,
    "customer_name": "Acme Corp",
    "hourly_rate": "110.00",
    "labor_cost": "4400.00",
    "tax_amount": "363.00",
    "total": "4763.00"
  }
]
```

## Verify All Invoices Summary

```sql
SELECT customer_name, labor_cost, tax_amount, total
FROM invoices
ORDER BY invoice_id;
```

```json
[
  {
    "customer_name": "Acme Corp",
    "labor_cost": "4400.00",
    "tax_amount": "363.00",
    "total": "4763.00"
  },
  {
    "customer_name": "TechStart Inc",
    "labor_cost": "3825.00",
    "tax_amount": "315.56",
    "total": "4140.56"
  },
  {
    "customer_name": "Global Industries",
    "labor_cost": "7500.00",
    "tax_amount": "543.75",
    "total": "8043.75"
  },
  {
    "customer_name": "StartupXYZ",
    "labor_cost": "3000.00",
    "tax_amount": "247.50",
    "total": "3247.50"
  }
]
```
