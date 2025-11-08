# Test: Four-Level Table Hierarchy

This test verifies that the processor correctly handles deep foreign key hierarchies with four levels of parent->child relationships.

## Input Schema

```yaml
# Two separate 4-level hierarchies to test layer assignment
tables:
  # First hierarchy: continents -> countries -> states -> cities
  continents:
    columns:
      continent_id: serial primary key
      name: varchar(50)

  countries:
    columns:
      country_id: serial primary key
      continent_id: FK continents
      name: varchar(100)

  states:
    columns:
      state_id: serial primary key
      country_id: FK countries
      name: varchar(100)

  cities:
    columns:
      city_id: serial primary key
      state_id: FK states
      name: varchar(100)

  # Second hierarchy: companies -> departments -> teams -> employees
  companies:
    columns:
      company_id: serial primary key
      name: varchar(100)

  departments:
    columns:
      department_id: serial primary key
      company_id: FK companies
      name: varchar(100)

  teams:
    columns:
      team_id: serial primary key
      department_id: FK departments
      name: varchar(100)

  employees:
    columns:
      employee_id: serial primary key
      team_id: FK teams
      name: varchar(100)
```

## Assertions

```json
{
  "extracted": {
    "tableLayers.0": ["companies", "continents"],
    "tableLayers.1": ["countries", "departments"],
    "tableLayers.2": ["states", "teams"],
    "tableLayers.3": ["cities", "employees"],
    "cycles": []
  }
}
```

## Notes

This test validates:
- Correct layer assignment for deep hierarchies (4 levels)
- Multiple independent hierarchies can coexist
- No cycles are detected in valid hierarchies
