# 4B1: Formula Dependency Chains

Tests formulas that depend on other formulas.
Covers: multi-level formula chains, correct evaluation order, dependency tracking.

## Build Schema

```yaml
tables:
  invoices:
    columns:
      invoice_id: serial primary key
      customer_name: varchar(100)
      hours_worked: numeric(10,2)
      hourly_rate: numeric(10,2)
      bonus_percent: numeric(5,2)
      expense_reimbursement: numeric(10,2)

      # Level 1: Base labor cost
      labor_cost:
        definition: numeric(10,2)
        formula: "hours_worked * hourly_rate"

      # Level 2: Bonus depends on labor_cost
      bonus_amount:
        definition: numeric(10,2)
        formula: "labor_cost * bonus_percent / 100"

      # Level 3: Subtotal depends on labor_cost and bonus_amount
      subtotal:
        definition: numeric(10,2)
        formula: "labor_cost + bonus_amount"

      # Level 4: Total depends on subtotal
      total:
        definition: numeric(10,2)
        formula: "subtotal + COALESCE(expense_reimbursement, 0)"

      # Level 5: Effective hourly rate depends on total
      effective_hourly_rate:
        definition: numeric(10,2)
        formula: "total / hours_worked"
```

## Insert Invoice

```sql
INSERT INTO invoices (customer_name, hours_worked, hourly_rate, bonus_percent, expense_reimbursement)
VALUES ('TechCorp', 40.00, 150.00, 10.00, 500.00);
```

## Verify All Formula Levels

```sql
SELECT customer_name, hours_worked, hourly_rate,
       labor_cost, bonus_amount, subtotal, total, effective_hourly_rate
FROM invoices;
```

```json
[
  {
    "customer_name": "TechCorp",
    "hours_worked": "40.00",
    "hourly_rate": "150.00",
    "labor_cost": "6000.00",
    "bonus_amount": "600.00",
    "subtotal": "6600.00",
    "total": "7100.00",
    "effective_hourly_rate": "177.50"
  }
]
```

## Insert Multiple Invoices

```sql
INSERT INTO invoices (customer_name, hours_worked, hourly_rate, bonus_percent, expense_reimbursement)
VALUES
  ('StartupXYZ', 25.50, 175.00, 15.00, NULL),
  ('BigCo', 80.00, 125.00, 5.00, 1000.00),
  ('SmallBiz', 15.00, 200.00, 20.00, 250.00);
```

## Verify All Invoices

```sql
SELECT customer_name, hours_worked, hourly_rate,
       labor_cost, bonus_amount, subtotal, total, effective_hourly_rate
FROM invoices
ORDER BY invoice_id;
```

```json
[
  {
    "customer_name": "TechCorp",
    "hours_worked": "40.00",
    "hourly_rate": "150.00",
    "labor_cost": "6000.00",
    "bonus_amount": "600.00",
    "subtotal": "6600.00",
    "total": "7100.00",
    "effective_hourly_rate": "177.50"
  },
  {
    "customer_name": "StartupXYZ",
    "hours_worked": "25.50",
    "hourly_rate": "175.00",
    "labor_cost": "4462.50",
    "bonus_amount": "669.38",
    "subtotal": "5131.88",
    "total": "5131.88",
    "effective_hourly_rate": "201.25"
  },
  {
    "customer_name": "BigCo",
    "hours_worked": "80.00",
    "hourly_rate": "125.00",
    "labor_cost": "10000.00",
    "bonus_amount": "500.00",
    "subtotal": "10500.00",
    "total": "11500.00",
    "effective_hourly_rate": "143.75"
  },
  {
    "customer_name": "SmallBiz",
    "hours_worked": "15.00",
    "hourly_rate": "200.00",
    "labor_cost": "3000.00",
    "bonus_amount": "600.00",
    "subtotal": "3600.00",
    "total": "3850.00",
    "effective_hourly_rate": "256.67"
  }
]
```

## Update Base Input (hourly_rate)

```sql
UPDATE invoices
SET hourly_rate = 160.00
WHERE customer_name = 'TechCorp';
```

## Verify Entire Chain Recalculated

```sql
SELECT customer_name, hourly_rate,
       labor_cost, bonus_amount, subtotal, total, effective_hourly_rate
FROM invoices
WHERE customer_name = 'TechCorp';
```

```json
[
  {
    "customer_name": "TechCorp",
    "hourly_rate": "160.00",
    "labor_cost": "6400.00",
    "bonus_amount": "640.00",
    "subtotal": "7040.00",
    "total": "7540.00",
    "effective_hourly_rate": "188.50"
  }
]
```

## Update Mid-Chain Input (bonus_percent)

```sql
UPDATE invoices
SET bonus_percent = 25.00
WHERE customer_name = 'StartupXYZ';
```

## Verify Dependent Formulas Recalculated

```sql
SELECT customer_name, labor_cost, bonus_percent, bonus_amount, subtotal, total
FROM invoices
WHERE customer_name = 'StartupXYZ';
```

```json
[
  {
    "customer_name": "StartupXYZ",
    "labor_cost": "4462.50",
    "bonus_percent": "25.00",
    "bonus_amount": "1115.63",
    "subtotal": "5578.13",
    "total": "5578.13"
  }
]
```

## Update Hours (affects all dependent formulas)

```sql
UPDATE invoices
SET hours_worked = 100.00
WHERE customer_name = 'BigCo';
```

## Verify Complete Recalculation

```sql
SELECT customer_name, hours_worked,
       labor_cost, bonus_amount, subtotal, total, effective_hourly_rate
FROM invoices
WHERE customer_name = 'BigCo';
```

```json
[
  {
    "customer_name": "BigCo",
    "hours_worked": "100.00",
    "labor_cost": "12500.00",
    "bonus_amount": "625.00",
    "subtotal": "13125.00",
    "total": "14125.00",
    "effective_hourly_rate": "141.25"
  }
]
```
