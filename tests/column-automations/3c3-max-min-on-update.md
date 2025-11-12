# 3C3: MAX and MIN on UPDATE

Tests that MAX and MIN aggregations update correctly when child values change.
Covers: updating to new MAX, updating to new MIN, updating current MAX/MIN to different value.

## Build Schema

```yaml
tables:
  sensors:
    columns:
      sensor_id: serial primary key
      sensor_name: varchar(100)
      location: varchar(100)

      # MAX: Highest temperature reading
      max_temperature:
        definition: numeric(5,2)
        automation: MAX readings.temperature

      # MIN: Lowest temperature reading
      min_temperature:
        definition: numeric(5,2)
        automation: MIN readings.temperature

  readings:
    columns:
      reading_id: serial primary key
      sensor_id: FK(sensors)
      timestamp: timestamp
      temperature: numeric(5,2)
```

## Insert Parent Rows

```sql
INSERT INTO sensors (sensor_name, location)
VALUES ('Sensor A', 'Room 101'), ('Sensor B', 'Room 102');
```

## Insert Readings for Sensor A

```sql
INSERT INTO readings (sensor_id, timestamp, temperature)
VALUES
  ((SELECT sensor_id FROM sensors WHERE sensor_name = 'Sensor A'), '2025-01-15 08:00:00', 20.5),
  ((SELECT sensor_id FROM sensors WHERE sensor_name = 'Sensor A'), '2025-01-15 09:00:00', 21.0),
  ((SELECT sensor_id FROM sensors WHERE sensor_name = 'Sensor A'), '2025-01-15 10:00:00', 22.5),
  ((SELECT sensor_id FROM sensors WHERE sensor_name = 'Sensor A'), '2025-01-15 11:00:00', 23.0),
  ((SELECT sensor_id FROM sensors WHERE sensor_name = 'Sensor A'), '2025-01-15 12:00:00', 24.5);
```

## Verify Initial MAX/MIN

```sql
SELECT sensor_name, max_temperature, min_temperature
FROM sensors
WHERE sensor_name = 'Sensor A';
```

```json
[
  {
    "sensor_name": "Sensor A",
    "max_temperature": "24.50",
    "min_temperature": "20.50"
  }
]
```

## Update to New Maximum

```sql
UPDATE readings
SET temperature = 26.0
WHERE sensor_id = (SELECT sensor_id FROM sensors WHERE sensor_name = 'Sensor A')
  AND timestamp = '2025-01-15 12:00:00';
```

## Verify MAX Updated

```sql
SELECT sensor_name, max_temperature, min_temperature
FROM sensors
WHERE sensor_name = 'Sensor A';
```

```json
[
  {
    "sensor_name": "Sensor A",
    "max_temperature": "26.00",
    "min_temperature": "20.50"
  }
]
```

## Update to New Minimum

```sql
UPDATE readings
SET temperature = 18.5
WHERE sensor_id = (SELECT sensor_id FROM sensors WHERE sensor_name = 'Sensor A')
  AND timestamp = '2025-01-15 08:00:00';
```

## Verify MIN Updated

```sql
SELECT sensor_name, max_temperature, min_temperature
FROM sensors
WHERE sensor_name = 'Sensor A';
```

```json
[
  {
    "sensor_name": "Sensor A",
    "max_temperature": "26.00",
    "min_temperature": "18.50"
  }
]
```

## Update Current MAX to Lower Value (Requires Recalculation)

```sql
UPDATE readings
SET temperature = 23.0
WHERE sensor_id = (SELECT sensor_id FROM sensors WHERE sensor_name = 'Sensor A')
  AND timestamp = '2025-01-15 12:00:00';
```

## Verify MAX Recalculated

```sql
SELECT sensor_name, max_temperature, min_temperature
FROM sensors
WHERE sensor_name = 'Sensor A';
```

```json
[
  {
    "sensor_name": "Sensor A",
    "max_temperature": "23.00",
    "min_temperature": "18.50"
  }
]
```

## Update Current MIN to Higher Value (Requires Recalculation)

```sql
UPDATE readings
SET temperature = 20.0
WHERE sensor_id = (SELECT sensor_id FROM sensors WHERE sensor_name = 'Sensor A')
  AND timestamp = '2025-01-15 08:00:00';
```

## Verify MIN Recalculated

```sql
SELECT sensor_name, max_temperature, min_temperature
FROM sensors
WHERE sensor_name = 'Sensor A';
```

```json
[
  {
    "sensor_name": "Sensor A",
    "max_temperature": "23.00",
    "min_temperature": "20.00"
  }
]
```

## Insert Readings for Sensor B

```sql
INSERT INTO readings (sensor_id, timestamp, temperature)
VALUES
  ((SELECT sensor_id FROM sensors WHERE sensor_name = 'Sensor B'), '2025-01-15 08:00:00', 15.0),
  ((SELECT sensor_id FROM sensors WHERE sensor_name = 'Sensor B'), '2025-01-15 09:00:00', 16.5),
  ((SELECT sensor_id FROM sensors WHERE sensor_name = 'Sensor B'), '2025-01-15 10:00:00', 18.0);
```

## Update Multiple Readings

```sql
UPDATE readings
SET temperature = temperature + 2.0
WHERE sensor_id = (SELECT sensor_id FROM sensors WHERE sensor_name = 'Sensor B');
```

## Verify Sensor B MAX/MIN Updated

```sql
SELECT sensor_name, max_temperature, min_temperature
FROM sensors
WHERE sensor_name = 'Sensor B';
```

```json
[
  {
    "sensor_name": "Sensor B",
    "max_temperature": "20.00",
    "min_temperature": "17.00"
  }
]
```

## Verify Final State

```sql
SELECT sensor_name, max_temperature, min_temperature
FROM sensors
ORDER BY sensor_id;
```

```json
[
  {
    "sensor_name": "Sensor A",
    "max_temperature": "23.00",
    "min_temperature": "20.00"
  },
  {
    "sensor_name": "Sensor B",
    "max_temperature": "20.00",
    "min_temperature": "17.00"
  }
]
```
