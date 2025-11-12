Previous: [Tables and Columns Introduction](05-tables-and-columns-introduction.md) | Next: [Primary Keys and Foreign Keys](20-primary-and-foreing-keys.md)

# Describing Tables and Columns

GenLogic schemas are defined in YAML.  A top-level `tables` object lists
table definitions, each with a `columns` section.

## A Database of Two Tables

```yaml
tables:
  users:
    columns:
      user_id: serial primary key
      name: varchar(100)
      email: varchar(255)

  products:
    columns:
      product_id: serial primary key
      name: varchar(100)
      price: numeric(10,2)
```

## Column Definition Strings

Every column has a definition string which specifies:
- `type` is any valid postgres type including shortcuts
- 'primary key' can be on one column per table
- 'not null' (optional - columns are by default nullable)
- 'default `value`' (optional)
- 'unique' flag (optional) (redundant on 'primary key' columns)

These qualifiers can in theory be in any order, but our test suites
always specify them as:
- type first
- default last
- other qualifiers in any order between type and default

```yaml
tables:
  example_table:
    columns:
      id: serial primary key
      name: varchar(100) unique
      price: numeric(10,2) not null
      description: text
      in_stock: boolean
      created_at: timestamp default CURRENT_TIMESTAMP
```

# Reusable Column Definitions

Define a top-level `columns` object to list columns that will
be used in multiple tables.  The re-usable column's definition
is copied into the table columns' definition.

The example below demonstrates the three syntaxes available
for placing re-usable columns into a table.

```yaml
columns:
  id: serial primary key

  name: varchar(100)

  created_at: timestamp default CURRENT_TIMESTAMP

tables:
  customers:
    columns:
      # Example: rename a re-usable column
      customer_id: id

      # Example: bare column name w/o definition
      created_at: 

      # Example: definition overrides using column object form
      #  base: names the re-usable column
      #  definition: override/append to the base column's definition
      customer_name: 
        base: name
        definition: not null 

```
## Defining Constants

Constants are defined in a top level object.  They can be placed
anywhere in your schema using `${CONSTANT_NAME}`.


```yaml
constants:
  TAX_RATE: 0.0825
  MAX_NAME_LENGTH: 100

tables:
  products:
    columns:
      product_id: serial primary key
      product_name: varchar(${MAX_NAME_LENGTH})
      price: numeric(10,2)
      tax_rate: numeric(5,4) default ${TAX_RATE}
```

---

Previous: [Tables and Columns Introduction](05-tables-and-columns-introduction.md) | Next: [Primary Keys and Foreign Keys](20-primary-and-foreing-keys.md)
