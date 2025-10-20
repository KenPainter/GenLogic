Previous: [Introduction](../50-integrity-features/00-introduction.md) | Next: [Column Types](11-column-types.md)

# Tables and Columns

## YAML Structure

A GenLogic schema must contain a top level key "tables"
that lists the table definitions.  Each table contains 
a key "columns" that lists the columns.

```yaml
tables:
  table_name:
    columns:
      column_name: *Postgres definition*
```

Here is a simple example of two unrelated tables
and their column definitions.  In this example the
column definition is a string that supports
several SQL/Postgres keywords.

## Simple Example

```yaml
tables:
    customers:
        columns:
            customer_id: serial primary key
            customer_code: varchar(6) unique not null 
            customer_name: varchar(30) not null
    vendors:
        columns:
            vendor_id: serial primary key
            vendor_code: varchar(6) unique not null 
            vendor_name: varchar(30) not null

```

## Column Definitions Support and Limitations

GenLogic parses SQL definition strings and supports the following keywords and patterns:

Supported:
- Base types with optional size: `varchar(100)`, `numeric(10,2)`
- Serial types: `serial`, `bigserial`, `smallserial`
- Multi-word types: `double precision`, `character varying`
- `PRIMARY KEY`
- `UNIQUE`
- `NOT NULL`
- `DEFAULT value` - supports numbers, booleans, quoted strings, 
  and function calls. 

Using PRIMARY KEY on multiple columns will create a compound
primary key, as expected.  By contrast,
using the UNIQUE keyword on multiple columns creates
multiple single-column constraints.  If the schema needs a
compound unique constraint in addition to the primary key,
use a [Unique Constraint](./30-indexes-and-constraints.md).

GenLogic _removes_ each keyword from the string as it finds
them, and the last thing it checks for is DEFAULT.  If it finds
DEFAULT, it will include everything after as the default value.
This may produce unexpected results if the schema contains invalid
keywords like: "... DEFAULT 'x' COLLATE".

Examples:
```yaml
id: serial primary key
name: varchar(100) not null
status: varchar(20) default 'pending'
balance: numeric(10,2) not null default 0
created_at: timestamp default now()
```

Not Supported:
- Explicit `NULL` keyword (columns are nullable by default unless `NOT NULL` specified)
- `CHECK` constraints
- `REFERENCES` (use `foreign_keys` section instead)
- Array types with `[]` syntax
- `GENERATED ALWAYS AS`
- `COLLATE`

Modifier Order:
- Modifiers can appear in any order except `DEFAULT`, which
  will match to the end of the string, so it should be last.
- Valid: `varchar(100) unique not null default 'foo'`
- Valid: `varchar(100) not null unique default 'foo'`


## What GenLogic Does

GenLogic always diffs a schema against the existing
database.  Depending upon the state of the database,
GenLogic may do any of the following:

- If the database is completely empty, GenLogic will
  add both tables, each with its three columns
- If either table is missing, it will be added
- If any columns are not in the database, they will
  added.
- If any columns in the database are narrower than 
  specified in the schema, they will be widened.

GenLogic never drops tables or columns, and never shrinks
columns.

## Test Coverage

### Basic Types and Size Specification

- [x] [Base types with size](../../tests/05-schema-features/column-types)
- [x] [Base types with size and decimal](../../tests/05-schema-features/column-types)
- [x] [Serial types (serial, bigserial, smallserial)](../../tests/05-schema-features/column-types-serial)
- [x] [Multi-word types (double precision)](../../tests/05-schema-features/column-types-float)
- [x] [Multi-word types (character varying)](../../tests/05-schema-features/sql-type-character-varying)

### Column Modifiers

- [x] [PRIMARY KEY](../../tests/05-schema-features/sql-type-with-modifiers)
- [x] [UNIQUE](../../tests/05-schema-features/sql-type-with-modifiers)
- [x] [NOT NULL](../../tests/05-schema-features/sql-type-with-modifiers)
- [x] [DEFAULT with numbers](../../tests/05-schema-features/sql-type-with-modifiers)
- [x] [DEFAULT with booleans](../../tests/05-schema-features/column-types)
- [x] [DEFAULT with quoted strings](../../tests/05-schema-features/sql-default-string)
- [x] [DEFAULT with function calls](../../tests/05-schema-features/column-types)
- [x] [Modifier order variations](../../tests/05-schema-features/sql-modifier-order)

### Unsupported Keywords Validation

These keywords must be rejected with clear error messages:

- [x] [Explicit NULL keyword](../../tests/02-schema-validation/sql-explicit-null)
- [x] [CHECK constraints](../../tests/02-schema-validation/sql-check-constraint)
- [x] [REFERENCES in column definition](../../tests/02-schema-validation/sql-references-in-column)
- [x] [Array syntax with brackets](../../tests/02-schema-validation/sql-array-syntax)
- [x] [GENERATED ALWAYS AS](../../tests/02-schema-validation/sql-generated-always-as)
- [x] [COLLATE](../../tests/02-schema-validation/sql-collate)

### Additive Behavior

GenLogic diffs against the existing database and performs additive operations:

- [x] [Empty database creates all tables and columns](../../tests/05-schema-features/additive-empty-database)
- [x] [Missing table is added](../../tests/05-schema-features/additive-new-table)
- [x] [Missing column is added](../../tests/05-schema-features/additive-new-column)
- [x] [Narrow column is widened](../../tests/05-schema-features/additive-widen-column)
- [x] [Never drops tables](../../tests/05-schema-features/additive-never-drops-tables)
- [x] [Never drops columns](../../tests/05-schema-features/additive-never-drops-columns)
- [x] [Never shrinks columns](../../tests/05-schema-features/additive-never-shrinks-columns)

---

Previous: [Introduction](../50-integrity-features/00-introduction.md) | Next: [Column Types](11-column-types.md)
