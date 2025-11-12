Previous: [Tables and Columns](10-tables-and-columns.md) | Next: [Constraints and Indexes](30-constraints-and-indexes.md)

# Primary Keys and Foreign Keys

## Primary Keys

GenLogic supports single-column primary keys. 

GenLogic does not require a table to have a primary key.

### Serial Primary Key

The `serial` pattern is common for auto-incrementing integer primary keys,
and these are sometimes called 'surrogate keys'.

Postgres also supports bigserial and smallserial.  The value ranges are:
- smallserial: 1 to 32,767
- serial: 1 to 2,147,483,647
- bigserial: 1 to 9,223,372,036,854,775,807

GenLogic sets the first value of serial columns to 100.

```yaml
tables:
  users:
    columns:
      id: serial primary key
      username: varchar(50)
```

```sql
INSERT INTO users (username) VALUES ('alice');
INSERT INTO users (username) VALUES ('bob');
-- Results in id values 100, 101
```

### Natural Primary Keys

A natural primary key requires the user/app
to provide the primary key value.

```yaml
tables:
  codes:
    columns:
      code_id: integer primary key
      code_value: varchar(20)
  postal_codes:
    columns:
      postal_code: char(6) primary key

```

You must provide the ID value on insert:

```sql
INSERT INTO codes (code_id, code_value) VALUES (100, 'ALPHA');
INSERT INTO codes (code_id, code_value) VALUES (200, 'BETA');
INSERT INTO postal_codes (postal_code) VALUES ('16075')
```

## Foreign Keys

Define a foreign key with the 'FK(parent_table_name)' syntax.

GenLogic infers the column type from the parent table's primary key.

For each foreign key, GenLogic creates:
1. The column with the correct type (matching parent PK type)
2. A foreign key constraint named `fk_<child_table>_<child_column>`
3. An index on the FK column for join performance

### Foreign Key Syntax

```yaml
tables:
  customers:
    columns:
      customer_id: serial primary key
      name: varchar(100)

  orders:
    columns:
      order_id: serial primary key

      # customer_id becomes an integer (serial creates integer)
      customer_id: FK(customers)

      order_date: date
```

### Multiple Foreign Keys to One Table

Multiple foreign keys to the same table require different
column names for each foreign key.

```yaml
tables:
  accounts:
    account_id: serial primary key

  ledger:
    account_id_debit: FK(accounts)
    account_id_credit: FK(accounts)
```

### Self-Referential Foreign Keys

A table can reference itself:

```yaml
tables:
  employees:
    columns:
      id: serial primary key
      name: varchar(100)
      manager_id: FK(employees)
```

### Default Foreign Keys

Use the object syntax to provide a default for a foreign key:

```yaml
tables:
  citizenship:
    columns:
      country: varchar(50) primary key

  users:
    columns:
      country: FK(citizenship) default 'Unknown'
      # Assumes a valid entry in table citizenship
      # See 'seed-rows' for more complete case
```

### Nullable and Not Null Foreign Keys

Foreign keys are by default nullable.  Foreign keys
do not inherit the nullable status of the parent 
table's primary key.

```yaml
tables:
  citizenship:
    columns:
      country: varchar(50) primary key

  users:
    columns:
      country: FK(citizenship) not null
```

### Delete Actions

A foreign key by default is 'delete restrict'.  GenLogic
supports the other Postgres options:
- delete cascade
- delete set null
- delete set default

```yaml
tables:
  categories:
    columns:
      id: serial primary key
      name: varchar(50)

  products:
    columns:
      id: serial primary key
      category_id: FK(categories) delete cascade
      # Also allowed:
      # category_id: FK(categories) delete set null
      # category_id: FK(categories) delete set default
      #
      # Allowed but redundant
      # category_id: FK(categories) delete restrict
```

---

Previous: [Tables and Columns](10-tables-and-columns.md) | Next: [Constraints and Indexes](30-constraints-and-indexes.md)
