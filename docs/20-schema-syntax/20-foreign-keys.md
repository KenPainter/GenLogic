Previous: [Label, Format, and Comment](13-label-format-comment.md) | Next: [Indexes and Unique Constraints](30-indexes-and-constraints.md)

# Foreign Keys

Foreign keys establish relationships between tables.  GenLogic depends
on foreign keys for automated transfer of values between tables.

GenLogic specifies foreign keys differently than SQL. In SQL, you define columns then add 
constraints. In GenLogic, you declare a foreign key relationship and GenLogic
creates the column(s), constraint, and index.

## Basic Syntax

Declare a foreign key in the `foreign_keys` section.
The shorthand below is useful when the parent table
has a single-column primary key.

```yaml
tables:
  users:
    columns:
      id: serial primary key
      username: varchar(100)

  posts:
    foreign_keys:
      user_id: users  # creates user_id from users.id 

    columns:
      id: serial primary key
      title: varchar(200)
      #  user_id: integer  # created automatically
```

GenLogic automatically creates:
- Foreign key column(s)
- Foreign key constraint
- Index on the foreign key column

## Column Naming

Use `prefix` and `suffix` to control the foreign key column name.
The prefix and suffix are both optional.  If the parent table
has a compound primary key, the prefix and suffix are added to
all created columns.

```yaml
tables:
  users:
    columns:
      id: integer primary key

  posts:
    foreign_keys:
      owner:
        table: users
        prefix: owner_  # Creates column: owner_id

      author:
        table: users
        suffix: _author  # Creates column: id_author

      creator:
        table: users
        prefix: created_
        suffix: _by  # Creates column: created_id_by
```

## Nullable vs Required

Foreign key columns are nullable by default. Declare the column explicitly to make it required:

```yaml
tables:
  categories:
    columns:
      id: serial primary key

  products:
    foreign_keys:
      category_id: categories

    columns:
      id: serial primary key
      name: varchar(100)
      category_id: integer not null  # redefine column and set not null
```

## Comment

Document foreign key relationships with the `comment` property:

```yaml
tables:
  users:
    columns:
      id: integer primary key

  posts:
    columns:
      id: integer primary key
    foreign_keys:
      user:
        table: users
        comment: Link to author
```

## Delete Actions

Control what happens when a parent row is deleted:

```yaml
tables:
  customers:
    columns:
      id: serial primary key

  orders:
    foreign_keys:
      customer_id:
        table: customers
        delete: cascade  # or 'restrict' (default)

    columns:
      id: serial primary key
      customer_id: integer
```

Delete actions:
- `cascade` - Delete child rows when parent is deleted
- `restrict` - Prevent parent deletion if child rows exist (default)

## Composite Foreign Keys

Foreign keys can reference composite primary keys:

```yaml
tables:
  order_headers:
    columns:
      order_id: integer primary key
      order_year: integer primary key

  order_lines:
    foreign_keys:
      order_fk: order_headers

    columns:
      line_id: serial primary key
      #order_id: integer    # automatically created
      #order_year: integer  # automatically created
```

## Self-Referencing Foreign Keys

Tables can reference themselves for hierarchical data:

```yaml
tables:
  employees:
    foreign_keys:
      manager_id: employees

    columns:
      id: serial primary key
      name: varchar(100)
      manager_id: integer
```

## Auto-Create Parent

GenLogic can create summary tables that serve the same purpose
as materialized views.  The "auto-create_parent" feature
allows all such "views" to be embedded and automatically
updated within the database.

Automatically create parent rows when inserting child rows with non-existent foreign key values:

```yaml
tables:
  categories:
    columns:
      category_name: varchar(100) primary key
      total_amount:
        automation: SUM @transactions.amount

  transactions:
    foreign_keys:
      category_name:
        table: categories
        auto_create_parent: true

    columns:
      transaction_id: serial primary key
      amount: integer not null
      category_name: varchar(100)
```

When inserting a transaction with a new category name, GenLogic creates the category row
automatically with only the primary key populated. Other columns receive default values.

## Example

```yaml
tables:
  users:
    columns:
      id: serial primary key
      username: varchar(100)

  categories:
    columns:
      id: serial primary key
      name: varchar(100)

  posts:
    foreign_keys:
      user_id: users
      category_id:
        table: categories
        delete: cascade

    columns:
      id: serial primary key
      title: varchar(200)
      user_id: integer not null  # Required
      category_id: integer        # Nullable
```

## Test Coverage

This section lists tests that verify foreign key features work correctly.

### Validation (Runtime)

These tests verify that GenLogic catches invalid foreign key definitions:

- [x] [Circular FK dependencies](../../tests/04-validation/circular-foreign-keys) - Cycle detection in foreign key graph
- [x] [FK to non-existent table](../../tests/04-validation/fk-to-nonexistent-table) - Error when FK references non-existent table
- [x] [FK to table without primary key](../../tests/04-validation/fk-to-table-without-pk) - Error when FK references table with no PK
- [x] [Multiple FKs without explicit name](../../tests/04-validation/fk-multiple-without-name) - Error when multiple FKs create naming conflict
- [x] [Self-referential FK](../../tests/04-validation/fk-self-referential) - Self-referential FKs are valid (should pass)

### Schema Features (Isolated Tests)

These tests verify that GenLogic generates correct foreign key DDL and database schema:

- [x] [Foreign keys](../../tests/05-schema-features/foreign-keys) - Basic FK generation with constraint creation
- [x] [Simple FK](../../tests/05-schema-features/fk-simple) - No prefix/suffix, single column
- [x] [FK with prefix](../../tests/05-schema-features/fk-with-prefix) - FK column named with prefix
- [x] [FK with suffix](../../tests/05-schema-features/fk-with-suffix) - FK column named with suffix
- [x] [FK with prefix and suffix](../../tests/05-schema-features/fk-with-prefix-and-suffix) - FK column with both prefix and suffix
- [x] [Composite FK with prefix](../../tests/05-schema-features/fk-composite-with-prefix) - Prefix applied to all columns in composite FK
- [x] [Nullable FK](../../tests/05-schema-features/fk-nullable) - FK with not_null: false
- [x] [Required FK](../../tests/05-schema-features/fk-required) - FK with not_null: true
- [x] [FK delete: restrict](../../tests/05-schema-features/fk-delete-restrict) - ON DELETE RESTRICT
- [x] [FK delete: cascade](../../tests/05-schema-features/fk-delete-cascade) - ON DELETE CASCADE
- [x] [FK to SERIAL PK](../../tests/05-schema-features/fk-to-serial) - FK from child table to parent with SERIAL PK
- [x] [Comment on FK](../../tests/05-schema-features/comment-fk) - Foreign key comments

### Behavior (End-to-End Tests)

These tests verify foreign key behavior with actual data:

- [x] [Composite FKs](../../tests/06-behavior/foreign-keys-composite) - Composite primary key support
- [x] [Nullable FKs](../../tests/06-behavior/foreign-keys-nullable) - Optional foreign key relationships

---

Previous: [Label, Format, and Comment](13-label-format-comment.md) | Next: [Indexes and Unique Constraints](30-indexes-and-constraints.md)
