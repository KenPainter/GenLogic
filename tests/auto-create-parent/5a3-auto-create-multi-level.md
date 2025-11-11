# 5A3: Auto-Create Parent Multi-Level Hierarchy

Tests auto-create parent in multi-level hierarchy where inserting a grandchild automatically creates both parent and grandparent.
Covers: cascading auto-create, multi-level FK chains.

## Build Schema

```yaml
tables:
  regions:
    columns:
      region_id: serial primary key
      region_name: varchar(100)

  countries:
    columns:
      country_id: serial primary key
      country_name: varchar(100)
      region_id: FK regions auto create parent

  cities:
    columns:
      city_id: serial primary key
      city_name: varchar(100)
      country_id: FK countries auto create parent
```

## Insert City Without Parent or Grandparent

```sql
INSERT INTO cities (city_name, country_id)
VALUES ('London', 100);
```

## Verify City Created

```sql
SELECT city_id, city_name, country_id
FROM cities;
```

```json
[
  {
    "city_id": 100,
    "city_name": "London",
    "country_id": 100
  }
]
```

## Verify Country Auto-Created

```sql
SELECT country_id, country_name, region_id
FROM countries;
```

```json
[
  {
    "country_id": 100,
    "country_name": null,
    "region_id": null
  }
]
```

## Verify No Region Created (Country Has NULL FK)

```sql
SELECT COUNT(*) as region_count
FROM regions;
```

```json
[
  {
    "region_count": "0"
  }
]
```

## Insert Country with Region

```sql
INSERT INTO countries (country_id, country_name, region_id)
VALUES (200, 'France', 10);
```

## Verify Region Auto-Created

```sql
SELECT region_id, region_name
FROM regions;
```

```json
[
  {
    "region_id": 10,
    "region_name": null
  }
]
```

## Insert City for Existing Country

```sql
INSERT INTO cities (city_name, country_id)
VALUES ('Paris', 200);
```

## Verify City References Existing Country

```sql
SELECT city_id, city_name, country_id
FROM cities
ORDER BY city_id;
```

```json
[
  {
    "city_id": 100,
    "city_name": "London",
    "country_id": 100
  },
  {
    "city_id": 101,
    "city_name": "Paris",
    "country_id": 200
  }
]
```

## Verify No Duplicate Country Created

```sql
SELECT country_id, country_name, region_id
FROM countries
ORDER BY country_id;
```

```json
[
  {
    "country_id": 100,
    "country_name": null,
    "region_id": null
  },
  {
    "country_id": 200,
    "country_name": "France",
    "region_id": 10
  }
]
```

## Insert Multiple Cities with New Country

```sql
INSERT INTO cities (city_name, country_id)
VALUES
  ('Berlin', 300),
  ('Munich', 300);
```

## Verify Both Cities Share Auto-Created Country

```sql
SELECT city_id, city_name, country_id
FROM cities
WHERE country_id = 300
ORDER BY city_id;
```

```json
[
  {
    "city_id": 102,
    "city_name": "Berlin",
    "country_id": 300
  },
  {
    "city_id": 103,
    "city_name": "Munich",
    "country_id": 300
  }
]
```

## Verify New Country Auto-Created

```sql
SELECT country_id, country_name, region_id
FROM countries
WHERE country_id = 300;
```

```json
[
  {
    "country_id": 300,
    "country_name": null,
    "region_id": null
  }
]
```

## Update Country to Link to Region

```sql
UPDATE countries
SET region_id = 20
WHERE country_id = 300;
```

## Verify Region Auto-Created on UPDATE

```sql
SELECT region_id, region_name
FROM regions
ORDER BY region_id;
```

```json
[
  {
    "region_id": 10,
    "region_name": null
  },
  {
    "region_id": 20,
    "region_name": null
  }
]
```

## Verify Country Updated

```sql
SELECT country_id, country_name, region_id
FROM countries
WHERE country_id = 300;
```

```json
[
  {
    "country_id": 300,
    "country_name": null,
    "region_id": 20
  }
]
```

## Fill in Names

```sql
UPDATE regions SET region_name = 'Europe' WHERE region_id = 10;
UPDATE regions SET region_name = 'Central Europe' WHERE region_id = 20;
UPDATE countries SET country_name = 'United Kingdom' WHERE country_id = 100;
UPDATE countries SET country_name = 'Germany' WHERE country_id = 300;
```

## Verify Complete Hierarchy

```sql
SELECT c.city_name, co.country_name, r.region_name
FROM cities c
LEFT JOIN countries co ON c.country_id = co.country_id
LEFT JOIN regions r ON co.region_id = r.region_id
ORDER BY c.city_id;
```

```json
[
  {
    "city_name": "London",
    "country_name": "United Kingdom",
    "region_name": null
  },
  {
    "city_name": "Paris",
    "country_name": "France",
    "region_name": "Europe"
  },
  {
    "city_name": "Berlin",
    "country_name": "Germany",
    "region_name": "Central Europe"
  },
  {
    "city_name": "Munich",
    "country_name": "Germany",
    "region_name": "Central Europe"
  }
]
```
