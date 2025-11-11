# 7A2: Multiple Constants

Tests multiple constant definitions and usage.
Covers: numeric constants, string constants, using multiple constants together.

## Build Schema

```yaml
constants:
  # Base constants
  BASE_HOURLY_RATE: 100.00
  OVERTIME_MULTIPLIER: 1.5
  WEEKEND_MULTIPLIER: 2.0

  # Derived constants (pre-calculated values)
  OVERTIME_RATE: 150.00
  WEEKEND_RATE: 200.00

  # String constants
  COMPANY_NAME: TechCorp
  FULL_COMPANY_NAME: TechCorp Industries

  # Numeric values
  STANDARD_LENGTH: 100
  EXTENDED_LENGTH: 200

tables:
  timesheets:
    columns:
      timesheet_id: serial primary key
      employee_name: varchar(${STANDARD_LENGTH})
      company: varchar(${EXTENDED_LENGTH}) default '${FULL_COMPANY_NAME}'
      regular_hours: numeric(10,2)
      overtime_hours: numeric(10,2)
      weekend_hours: numeric(10,2)

      # Formulas using recursive constants
      regular_pay:
        definition: numeric(10,2)
        formula: "regular_hours * ${BASE_HOURLY_RATE}"

      overtime_pay:
        definition: numeric(10,2)
        formula: "overtime_hours * (${OVERTIME_RATE})"

      weekend_pay:
        definition: numeric(10,2)
        formula: "weekend_hours * (${WEEKEND_RATE})"

      total_pay:
        definition: numeric(10,2)
        formula: "regular_pay + overtime_pay + weekend_pay"
```

## Insert Timesheet

```sql
INSERT INTO timesheets (employee_name, regular_hours, overtime_hours, weekend_hours)
VALUES ('Alice', 40.00, 5.00, 8.00);
```

## Verify Recursive Constants in Formulas

```sql
SELECT employee_name, company, regular_hours, overtime_hours, weekend_hours,
       regular_pay, overtime_pay, weekend_pay, total_pay
FROM timesheets;
```

```json
[
  {
    "employee_name": "Alice",
    "company": "TechCorp Industries",
    "regular_hours": "40.00",
    "overtime_hours": "5.00",
    "weekend_hours": "8.00",
    "regular_pay": "4000.00",
    "overtime_pay": "750.00",
    "weekend_pay": "1600.00",
    "total_pay": "6350.00"
  }
]
```

## Insert Another Timesheet

```sql
INSERT INTO timesheets (employee_name, regular_hours, overtime_hours, weekend_hours)
VALUES ('Bob', 35.00, 0.00, 10.00);
```

## Verify All Timesheets

```sql
SELECT employee_name, regular_hours, overtime_hours, weekend_hours,
       regular_pay, overtime_pay, weekend_pay, total_pay
FROM timesheets
ORDER BY timesheet_id;
```

```json
[
  {
    "employee_name": "Alice",
    "regular_hours": "40.00",
    "overtime_hours": "5.00",
    "weekend_hours": "8.00",
    "regular_pay": "4000.00",
    "overtime_pay": "750.00",
    "weekend_pay": "1600.00",
    "total_pay": "6350.00"
  },
  {
    "employee_name": "Bob",
    "regular_hours": "35.00",
    "overtime_hours": "0.00",
    "weekend_hours": "10.00",
    "regular_pay": "3500.00",
    "overtime_pay": "0.00",
    "weekend_pay": "2000.00",
    "total_pay": "5500.00"
  }
]
```

## Update Hours

```sql
UPDATE timesheets
SET overtime_hours = 10.00
WHERE employee_name = 'Bob';
```

## Verify Formulas Recalculated with Recursive Constants

```sql
SELECT employee_name, overtime_hours, overtime_pay, total_pay
FROM timesheets
WHERE employee_name = 'Bob';
```

```json
[
  {
    "employee_name": "Bob",
    "overtime_hours": "10.00",
    "overtime_pay": "1500.00",
    "total_pay": "7000.00"
  }
]
```

## Verify String Constant Length

```sql
SELECT LENGTH(company) as company_length, company
FROM timesheets
LIMIT 1;
```

```json
[
  {
    "company_length": 19,
    "company": "TechCorp Industries"
  }
]
```
