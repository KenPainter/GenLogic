Previous: [Multiple Foreign Keys](multiple-foreign-keys.md) | Next: [Self-Referencing](self-referencing.md)

# Composite Foreign Keys Example

## Overview

Composite foreign keys reference tables that have composite (multi-column) primary keys. This pattern is common in hierarchical data structures and multi-tenant systems where natural keys span multiple columns. This example demonstrates geographic hierarchy with countries, states, and cities.

## Key Concepts

- Composite Primary Keys: Primary keys composed of multiple columns working together
- Composite Foreign Keys: Foreign keys that reference all columns of a composite primary key
- Column Mapping: Explicit mapping between local and referenced columns
- Hierarchical Relationships: Building multi-level data hierarchies with composite keys

## YAML Configuration

```yaml
# Composite Foreign Keys Example
# Demonstrates foreign keys that reference composite primary keys

columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  name:
    type: varchar
    size: 100

  code:
    type: varchar
    size: 10

tables:
  countries:
    columns:
      country_code:
        $ref: code
        primary_key: true

      country_name:
        $ref: name

  states:
    # Composite primary key
    columns:
      country_code:
        $ref: code
        primary_key: true

      state_code:
        $ref: code
        primary_key: true

      state_name:
        $ref: name

    foreign_keys:
      # Simple FK to countries
      country_fk:
        table: countries
        columns:
          country_code: country_code

  cities:
    foreign_keys:
      # Composite foreign key referencing states table
      state_fk:
        table: states
        columns:
          country_code: country_code  # local_column: referenced_column
          state_code: state_code

    columns:
      city_id:
        $ref: id

      city_name:
        $ref: name

      # Foreign key columns (composite)
      country_code:
        $ref: code
        required: true

      state_code:
        $ref: code
        required: true

      population:
        type: integer

# Alternative syntax for composite FKs with different column names:
  addresses:
    foreign_keys:
      location_fk:
        table: states
        columns:
          addr_country: country_code  # addr_country references states.country_code
          addr_state: state_code      # addr_state references states.state_code

    columns:
      address_id:
        $ref: id

      street_address:
        type: varchar
        size: 200

      # Different column names for the FK
      addr_country:
        $ref: code
        required: true

      addr_state:
        $ref: code
        required: true

# What this generates:
# 1. countries: country_code (PK), country_name
# 2. states: (country_code, state_code) composite PK, state_name
# 3. cities: city_id (PK), city_name, country_code, state_code, population
# 4. addresses: address_id (PK), street_address, addr_country, addr_state
#
# Foreign key constraints:
# - states.country_code REFERENCES countries(country_code)
# - cities.(country_code, state_code) REFERENCES states(country_code, state_code)
# - addresses.(addr_country, addr_state) REFERENCES states(country_code, state_code)
```

## Generated SQL

This schema creates tables with composite primary and foreign keys:

```sql
CREATE TABLE countries (
    country_code VARCHAR(10) PRIMARY KEY,
    country_name VARCHAR(100)
);

CREATE TABLE states (
    country_code VARCHAR(10),
    state_code VARCHAR(10),
    state_name VARCHAR(100),
    PRIMARY KEY (country_code, state_code),
    FOREIGN KEY (country_code) REFERENCES countries(country_code)
);

CREATE TABLE cities (
    city_id SERIAL PRIMARY KEY,
    city_name VARCHAR(100),
    country_code VARCHAR(10) NOT NULL,
    state_code VARCHAR(10) NOT NULL,
    population INTEGER,
    FOREIGN KEY (country_code, state_code) REFERENCES states(country_code, state_code)
);

CREATE TABLE addresses (
    address_id SERIAL PRIMARY KEY,
    street_address VARCHAR(200),
    addr_country VARCHAR(10) NOT NULL,
    addr_state VARCHAR(10) NOT NULL,
    FOREIGN KEY (addr_country, addr_state) REFERENCES states(country_code, state_code)
);

CREATE INDEX idx_cities_state_fk ON cities(country_code, state_code);
CREATE INDEX idx_addresses_location_fk ON addresses(addr_country, addr_state);
```

## Usage Examples

```sql
-- Create countries
INSERT INTO countries (country_code, country_name)
VALUES ('US', 'United States'), ('CA', 'Canada');

-- Create states with composite keys
INSERT INTO states (country_code, state_code, state_name)
VALUES ('US', 'NY', 'New York'),
       ('US', 'CA', 'California'),
       ('CA', 'ON', 'Ontario'),
       ('CA', 'BC', 'British Columbia');

-- Create cities referencing states via composite FK
INSERT INTO cities (city_name, country_code, state_code, population)
VALUES ('New York City', 'US', 'NY', 8000000),
       ('Los Angeles', 'US', 'CA', 4000000),
       ('Toronto', 'CA', 'ON', 2900000),
       ('Vancouver', 'CA', 'BC', 675000);

-- Create addresses with custom column names
INSERT INTO addresses (street_address, addr_country, addr_state)
VALUES ('123 Broadway', 'US', 'NY'),
       ('456 Sunset Blvd', 'US', 'CA'),
       ('789 King St', 'CA', 'ON');

-- Query cities with state and country information
SELECT ci.city_name, ci.population, s.state_name, co.country_name
FROM cities ci
JOIN states s ON ci.country_code = s.country_code AND ci.state_code = s.state_code
JOIN countries co ON s.country_code = co.country_code
ORDER BY ci.population DESC;

-- Find all cities in a specific state
SELECT city_name, population
FROM cities
WHERE country_code = 'US' AND state_code = 'CA';

-- Query addresses with full location details
SELECT a.street_address, s.state_name, co.country_name
FROM addresses a
JOIN states s ON a.addr_country = s.country_code AND a.addr_state = s.state_code
JOIN countries co ON s.country_code = co.country_code;

-- Get states by country
SELECT s.state_code, s.state_name, COUNT(ci.city_id) as city_count
FROM states s
LEFT JOIN cities ci ON s.country_code = ci.country_code AND s.state_code = ci.state_code
WHERE s.country_code = 'US'
GROUP BY s.country_code, s.state_code, s.state_name;
```

---

Previous: [Multiple Foreign Keys](multiple-foreign-keys.md) | Next: [Self-Referencing](self-referencing.md)
