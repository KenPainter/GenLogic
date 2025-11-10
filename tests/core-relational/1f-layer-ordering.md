# Test: 1F - Layer Ordering

Tests that tables are created in correct dependency order based on foreign key relationships.

## Step 1: Create 4-level hierarchy

```yaml
tables:
  level0_countries:
    columns:
      id: serial primary key
      name: varchar(100)

  level1_states:
    columns:
      id: serial primary key
      country_id: FK level0_countries
      name: varchar(100)

  level2_cities:
    columns:
      id: serial primary key
      state_id: FK level1_states
      name: varchar(100)

  level3_addresses:
    columns:
      id: serial primary key
      city_id: FK level2_cities
      street: varchar(200)
```

## Verify all tables created

```json
{
  "newSchema": {
    "tables.level0_countries": "@exists",
    "tables.level0_countries.pkColumn": "id",
    "tables.level1_states": "@exists",
    "tables.level1_states.foreignKeys.fk_level1_states_country_id.parentTable": "level0_countries",
    "tables.level2_cities": "@exists",
    "tables.level2_cities.foreignKeys.fk_level2_cities_state_id.parentTable": "level1_states",
    "tables.level3_addresses": "@exists",
    "tables.level3_addresses.foreignKeys.fk_level3_addresses_city_id.parentTable": "level2_cities",
    "errors.length": 0
  }
}
```

## Insert data in layer order (level 0 first)

```sql
INSERT INTO level0_countries (name) VALUES ('USA');
INSERT INTO level1_states (country_id, name) VALUES (100, 'California');
INSERT INTO level2_cities (state_id, name) VALUES (100, 'San Francisco');
INSERT INTO level3_addresses (city_id, street) VALUES (100, '123 Main St');
```

## Verify 4-level join works

```sql
SELECT
  co.name as country,
  st.name as state,
  ci.name as city,
  ad.street
FROM level0_countries co
JOIN level1_states st ON co.id = st.country_id
JOIN level2_cities ci ON st.id = ci.state_id
JOIN level3_addresses ad ON ci.id = ad.city_id;
```

## Verify all levels joined

```json
[
  {
    "country": "USA",
    "state": "California",
    "city": "San Francisco",
    "street": "123 Main St"
  }
]
```

## Step 2: Add another level 0 table (no dependencies)

```yaml
tables:
  level0_countries:
    columns:
      id: serial primary key
      name: varchar(100)

  level0_currencies:
    columns:
      id: serial primary key
      code: varchar(3)
      name: varchar(50)

  level1_states:
    columns:
      id: serial primary key
      country_id: FK level0_countries
      name: varchar(100)

  level2_cities:
    columns:
      id: serial primary key
      state_id: FK level1_states
      name: varchar(100)

  level3_addresses:
    columns:
      id: serial primary key
      city_id: FK level2_cities
      street: varchar(200)
```

## Verify level 0 table added

```json
{
  "newSchema": {
    "tables.level0_currencies": "@exists",
    "tables.level0_currencies.pkColumn": "id"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "level0_currencies"
  }
}
```

## Verify both level 0 tables exist

```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'level0_%'
ORDER BY tablename;
```

## Both level 0 tables present

```json
[
  {"tablename": "level0_countries"},
  {"tablename": "level0_currencies"}
]
```

## Step 3: Add table with FK to level 2 (creates level 3 sibling)

```yaml
tables:
  level0_countries:
    columns:
      id: serial primary key
      name: varchar(100)

  level0_currencies:
    columns:
      id: serial primary key
      code: varchar(3)
      name: varchar(50)

  level1_states:
    columns:
      id: serial primary key
      country_id: FK level0_countries
      name: varchar(100)

  level2_cities:
    columns:
      id: serial primary key
      state_id: FK level1_states
      name: varchar(100)

  level3_addresses:
    columns:
      id: serial primary key
      city_id: FK level2_cities
      street: varchar(200)

  level3_landmarks:
    columns:
      id: serial primary key
      city_id: FK level2_cities
      name: varchar(100)
```

## Verify level 3 sibling added

```json
{
  "newSchema": {
    "tables.level3_landmarks": "@exists",
    "tables.level3_landmarks.foreignKeys.fk_level3_landmarks_city_id.parentTable": "level2_cities"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "level3_landmarks"
  }
}
```

## Test both level 3 tables reference level 2

```sql
INSERT INTO level3_landmarks (city_id, name) VALUES (100, 'Golden Gate Bridge');
SELECT
  ci.name as city,
  ad.street,
  lm.name as landmark
FROM level2_cities ci
LEFT JOIN level3_addresses ad ON ci.id = ad.city_id
LEFT JOIN level3_landmarks lm ON ci.id = lm.city_id
ORDER BY ad.street, lm.name;
```

## Verify both level 3 children

```json
[
  {
    "city": "San Francisco",
    "street": null,
    "landmark": "Golden Gate Bridge"
  },
  {
    "city": "San Francisco",
    "street": "123 Main St",
    "landmark": null
  }
]
```

## Step 4: Add complex cross-layer dependencies

```yaml
tables:
  level0_countries:
    columns:
      id: serial primary key
      name: varchar(100)

  level0_currencies:
    columns:
      id: serial primary key
      code: varchar(3)
      name: varchar(50)

  level1_states:
    columns:
      id: serial primary key
      country_id: FK level0_countries
      name: varchar(100)

  level2_cities:
    columns:
      id: serial primary key
      state_id: FK level1_states
      name: varchar(100)

  level3_addresses:
    columns:
      id: serial primary key
      city_id: FK level2_cities
      street: varchar(200)

  level3_landmarks:
    columns:
      id: serial primary key
      city_id: FK level2_cities
      name: varchar(100)

  transactions:
    columns:
      id: serial primary key
      country_id: FK level0_countries
      currency_id: FK level0_currencies
      city_id: FK level2_cities
      amount: numeric(10,2)
```

## Verify table with multiple FK dependencies

```json
{
  "newSchema": {
    "tables.transactions": "@exists",
    "tables.transactions.foreignKeys.fk_transactions_country_id.parentTable": "level0_countries",
    "tables.transactions.foreignKeys.fk_transactions_currency_id.parentTable": "level0_currencies",
    "tables.transactions.foreignKeys.fk_transactions_city_id.parentTable": "level2_cities"
  },
  "diff": {
    "tablesToCreate.length": 1,
    "tablesToCreate[0]": "transactions"
  }
}
```

## Test cross-layer FK dependencies

```sql
INSERT INTO level0_currencies (code, name) VALUES ('USD', 'US Dollar');
INSERT INTO transactions (country_id, currency_id, city_id, amount) VALUES (100, 100, 100, 250.00);
SELECT
  co.name as country,
  cu.code as currency,
  ci.name as city,
  t.amount
FROM transactions t
JOIN level0_countries co ON t.country_id = co.id
JOIN level0_currencies cu ON t.currency_id = cu.id
JOIN level2_cities ci ON t.city_id = ci.id;
```

## Verify cross-layer join

```json
[
  {
    "country": "USA",
    "currency": "USD",
    "city": "San Francisco",
    "amount": "250.00"
  }
]
```

## Query to verify layer structure

```sql
SELECT
  t.tablename,
  CASE
    WHEN t.tablename LIKE 'level0_%' THEN 0
    WHEN t.tablename LIKE 'level1_%' THEN 1
    WHEN t.tablename LIKE 'level2_%' THEN 2
    WHEN t.tablename LIKE 'level3_%' THEN 3
    ELSE 99
  END as layer
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND (t.tablename LIKE 'level%' OR t.tablename = 'transactions')
ORDER BY layer, t.tablename;
```

## Verify all layers present

```json
[
  {"tablename": "level0_countries", "layer": 0},
  {"tablename": "level0_currencies", "layer": 0},
  {"tablename": "level1_states", "layer": 1},
  {"tablename": "level2_cities", "layer": 2},
  {"tablename": "level3_addresses", "layer": 3},
  {"tablename": "level3_landmarks", "layer": 3},
  {"tablename": "transactions", "layer": 99}
]
```
