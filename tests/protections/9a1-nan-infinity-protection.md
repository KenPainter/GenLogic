# 9a1. NaN/Infinity Protection

Tests that GenLogic properly protects numeric columns from NaN and Infinity values.

## Build Schema

```yaml
tables:
  measurements:
    columns:
      measurement_id: integer primary key
      amount_numeric: numeric(10,2)
      amount_decimal: decimal(12,4)
      temperature_real: real
      precise_double: double precision
```

## Test Normal Values Work

```sql
INSERT INTO measurements (measurement_id, amount_numeric, amount_decimal, temperature_real, precise_double)
VALUES
  (1, 123.45, 6789.1234, 98.6, 3.14159265358979),
  (2, -999.99, -1234.5678, -40.0, -273.15);

SELECT * FROM measurements ORDER BY measurement_id;
```

```json
[
  {
    "measurement_id": 1,
    "amount_numeric": "123.45",
    "amount_decimal": "6789.1234",
    "temperature_real": 98.6,
    "precise_double": 3.14159265358979
  },
  {
    "measurement_id": 2,
    "amount_numeric": "-999.99",
    "amount_decimal": "-1234.5678",
    "temperature_real": -40,
    "precise_double": -273.15
  }
]
```

## Test NULL Values Work

```sql
INSERT INTO measurements (measurement_id, amount_numeric, amount_decimal, temperature_real, precise_double)
VALUES (3, NULL, NULL, NULL, NULL);

SELECT * FROM measurements WHERE measurement_id = 3;
```

```json
[
  {
    "measurement_id": 3,
    "amount_numeric": null,
    "amount_decimal": null,
    "temperature_real": null,
    "precise_double": null
  }
]
```

## Test NaN is Blocked - numeric

```sql
INSERT INTO measurements (measurement_id, amount_numeric)
VALUES (100, 'NaN'::numeric);
```

```json
{
  "error": "check constraint"
}
```

## Test NaN is Blocked - decimal

```sql
INSERT INTO measurements (measurement_id, amount_decimal)
VALUES (101, 'NaN'::decimal);
```

```json
{
  "error": "check constraint"
}
```

## Test NaN is Blocked - real

```sql
INSERT INTO measurements (measurement_id, temperature_real)
VALUES (102, 'NaN'::real);
```

```json
{
  "error": "check constraint"
}
```

## Test NaN is Blocked - double precision

```sql
INSERT INTO measurements (measurement_id, precise_double)
VALUES (103, 'NaN'::double precision);
```

```json
{
  "error": "check constraint"
}
```

## Test Infinity is Blocked - numeric

```sql
INSERT INTO measurements (measurement_id, amount_numeric)
VALUES (104, 'Infinity'::numeric);
```

```json
{
  "error": "numeric field overflow"
}
```

## Test Infinity is Blocked - real

```sql
INSERT INTO measurements (measurement_id, temperature_real)
VALUES (105, 'Infinity'::real);
```

```json
{
  "error": "check constraint"
}
```

## Test Infinity is Blocked - double precision

```sql
INSERT INTO measurements (measurement_id, precise_double)
VALUES (106, 'Infinity'::double precision);
```

```json
{
  "error": "check constraint"
}
```

## Test Negative Infinity is Blocked - numeric

```sql
INSERT INTO measurements (measurement_id, amount_numeric)
VALUES (107, '-Infinity'::numeric);
```

```json
{
  "error": "numeric field overflow"
}
```

## Test Negative Infinity is Blocked - real

```sql
INSERT INTO measurements (measurement_id, temperature_real)
VALUES (108, '-Infinity'::real);
```

```json
{
  "error": "check constraint"
}
```

## Test Negative Infinity is Blocked - double precision

```sql
INSERT INTO measurements (measurement_id, precise_double)
VALUES (109, '-Infinity'::double precision);
```

```json
{
  "error": "check constraint"
}
```

## Test Update to NaN is Blocked

```sql
UPDATE measurements
SET amount_numeric = 'NaN'::numeric
WHERE measurement_id = 1;
```

```json
{
  "error": "check constraint"
}
```

## Test Update to Infinity is Blocked

```sql
UPDATE measurements
SET temperature_real = 'Infinity'::real
WHERE measurement_id = 2;
```

```json
{
  "error": "check constraint"
}
```

## Verify Original Data Unchanged

```sql
SELECT measurement_id, amount_numeric, temperature_real
FROM measurements
WHERE measurement_id IN (1, 2)
ORDER BY measurement_id;
```

```json
[
  {
    "measurement_id": 1,
    "amount_numeric": "123.45",
    "temperature_real": 98.6
  },
  {
    "measurement_id": 2,
    "amount_numeric": "-999.99",
    "temperature_real": -40
  }
]
```
