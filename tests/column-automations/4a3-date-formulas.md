# 4A3: Date Calculation Formulas

Tests date and timestamp formulas.
Covers: date arithmetic, INTERVAL, date extraction, age calculations.

## Build Schema

```yaml
tables:
  subscriptions:
    columns:
      subscription_id: serial primary key
      customer_name: varchar(100)
      start_date: date
      duration_months: integer

      # Formula: Calculate end date
      end_date:
        definition: date
        formula: "start_date + (duration_months || ' months')::interval"

      # Formula: Calculate days until end
      days_remaining:
        definition: integer
        formula: "end_date - CURRENT_DATE"

      # Formula: Extract year from start
      start_year:
        definition: integer
        formula: "EXTRACT(YEAR FROM start_date)"

      # Formula: Extract month from start
      start_month:
        definition: integer
        formula: "EXTRACT(MONTH FROM start_date)"
```

## Insert Subscription

```sql
INSERT INTO subscriptions (customer_name, start_date, duration_months)
VALUES ('Alice Corp', '2025-01-01', 12);
```

## Verify Date Formulas

```sql
SELECT customer_name, start_date, duration_months,
       end_date, start_year, start_month
FROM subscriptions;
```

```json
[
  {
    "customer_name": "Alice Corp",
    "start_date": "2025-01-01T00:00:00.000Z",
    "duration_months": 12,
    "end_date": "2026-01-01T00:00:00.000Z",
    "start_year": 2025,
    "start_month": 1
  }
]
```

## Insert Multiple Subscriptions

```sql
INSERT INTO subscriptions (customer_name, start_date, duration_months)
VALUES
  ('Bob Industries', '2025-03-15', 6),
  ('Carol LLC', '2024-12-01', 24),
  ('David Co', '2025-06-01', 3);
```

## Verify All Subscriptions

```sql
SELECT customer_name, start_date, duration_months, end_date
FROM subscriptions
ORDER BY subscription_id;
```

```json
[
  {
    "customer_name": "Alice Corp",
    "start_date": "2025-01-01T00:00:00.000Z",
    "duration_months": 12,
    "end_date": "2026-01-01T00:00:00.000Z"
  },
  {
    "customer_name": "Bob Industries",
    "start_date": "2025-03-15T00:00:00.000Z",
    "duration_months": 6,
    "end_date": "2025-09-15T00:00:00.000Z"
  },
  {
    "customer_name": "Carol LLC",
    "start_date": "2024-12-01T00:00:00.000Z",
    "duration_months": 24,
    "end_date": "2026-12-01T00:00:00.000Z"
  },
  {
    "customer_name": "David Co",
    "start_date": "2025-06-01T00:00:00.000Z",
    "duration_months": 3,
    "end_date": "2025-09-01T00:00:00.000Z"
  }
]
```

## Update Duration

```sql
UPDATE subscriptions
SET duration_months = 18
WHERE customer_name = 'Bob Industries';
```

## Verify End Date Recalculated

```sql
SELECT customer_name, start_date, duration_months, end_date
FROM subscriptions
WHERE customer_name = 'Bob Industries';
```

```json
[
  {
    "customer_name": "Bob Industries",
    "start_date": "2025-03-15T00:00:00.000Z",
    "duration_months": 18,
    "end_date": "2026-09-15T00:00:00.000Z"
  }
]
```

## Update Start Date

```sql
UPDATE subscriptions
SET start_date = '2025-01-15'
WHERE customer_name = 'Alice Corp';
```

## Verify All Date Fields Updated

```sql
SELECT customer_name, start_date, duration_months, end_date, start_year, start_month
FROM subscriptions
WHERE customer_name = 'Alice Corp';
```

```json
[
  {
    "customer_name": "Alice Corp",
    "start_date": "2025-01-15T00:00:00.000Z",
    "duration_months": 12,
    "end_date": "2026-01-15T00:00:00.000Z",
    "start_year": 2025,
    "start_month": 1
  }
]
```
