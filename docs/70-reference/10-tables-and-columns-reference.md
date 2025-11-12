Previous: [Multiple Round Trips Through Parent-Child Pair with Termination](../60-advanced/parent-child-multiple-round-trips-with-termination.md) | Next: [Reference: Column Automations](30-column-automations-reference.md)

# Tables and Columns Technical Reference

## Top level Objects

GenLogic supports three top-level YAML objects:

```yaml
constants:
columns:
tables:
```

Constants are key-value pairs that can reference 
each other and can be used anywhere in the schema.

Columns are re-usable columns that can be placed
into tables.

```yaml
constants:
    DEFAULT_COUNTRY: US
    DEFAULT_LOCALE_IDENTIFIER: en_${DEFAULT-COUNTRY}

columns:
    locale: char(6)

tables:
    users:
        # ...other columns...
        locale: locale default '${DEFAULT_LOCALE_IDENTIFIER}'
```

## Column Definition String

A column definition string specifies:
- Type (required) - any valid PostgreSQL type
- `primary key` (optional) - at most one per table, automatically not null
- `not null` (optional) - columns are nullable by default
- `default <value>` (optional)
- `unique` (optional)

Examples:
```yaml
email: varchar(255)                    # nullable
user_id: serial primary key            # not null (automatic)
age: integer not null
status: varchar(20) default 'active'
username: varchar(50) not null unique
```

## Foreign Key Definition

A foreign key definition starts with `FK(parent_table)` followed by optional modifiers:
- `not null` - foreign keys are nullable by default
- `default <value>`
- `delete <action>` - cascade, restrict, set null, set default (restrict is default)
- `auto create parent`

Examples:
```yaml
category_id: FK(categories)                           # nullable, delete restrict
user_id: FK(users) not null                          # required FK
parent_id: FK(nodes) delete cascade                  # cascade deletes
region_id: FK(regions) delete set null               # nullify on parent delete
status_id: FK(statuses) default 1                    # default FK(value)
tag_id: FK(tags) auto create parent                  # create missing parents
```

## Column Syntax - Short Form

The short form of a column entry provides either no
value or one of 3 types of specification as string values.

String values are an overloaded value that can mean:
- the name of a re-usable column
- a foreign key definition
- a GenLogic column definition string

```yaml
tables:
    my_table:
        # ...other columsn...

        # Bare column name
        # A re-usable column 'business_name' must exist
        business_name:

        # Renaming a re-usable column
        company_name: business_name

        # A definition string
        email: varchar(255) not null unique

        # A foreign key definition
        account_id: FK(accounts)
```

## Column Syntax - Object Form

The object form is required when the column:
- overrides the definition of a re-usable column
- has an automation or formula
- is an FK(with) a formula

```yaml
columns:
    name: varchar(50)


tables: 
    my_table:
        # inline reusable with modifiers
        name1: name not null

        # object form to add formula to re-usable column
        name2:
            definition: name
            formula: case when other_column > 5 then name1 else '' end

        # object form to add formula to foreign-key
        name3:
            definition: FK(parent_table) not null
            formula: coalesce(name1,name2)
```

## Indexes

Indexes are an array of arrays on a table.

Indexes are not necessary for primary keys or foreign keys.

```yaml
tables:
    my_table:
        columns:
            # ...other columns...
        indexes:
            - [ column1, column2 ]
            - [ columnA, columnB, columnC]

```

## Unique Constraints

Unique constraints are an array of arrays on a table.

Unique constraints are not necessary for primary keys.

```yaml
tables:
    my_table:
        columns:
            # ...other columns...
        unique-constraints:
            - [ column1, column2 ]
            - [ columnA, columnB, columnC]

```

## Check Constraints

Check constraints are an array of strings on a table

Unique constraints are not necessary for primary keys.

```yaml
tables:
    my_table:
        columns:
            # ...other columns...
        constraints:
            - column1 >= 0
            - date2 <= date1

```

---

Previous: [Multiple Round Trips Through Parent-Child Pair with Termination](../60-advanced/parent-child-multiple-round-trips-with-termination.md) | Next: [Reference: Column Automations](30-column-automations-reference.md)
