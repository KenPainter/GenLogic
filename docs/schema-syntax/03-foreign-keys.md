Previous: [Reusable Columns](02-reusable-columns.md) | Next: [Moving Values from Parent to Child](04-parent-to-child.md)

# Foreign Keys

Foreign keys establish relationships between tables.

GenLogic defines foreign keys differently than traditional SQL syntax.

In SQL, we define the columns in the table, then we establish the
constraint.

By contrast, in GenLogic we specify that we need a foreign key to
a table, and GenLogic copies the primary key columns into the
child table's definition.

## Basic Structure

```yaml
tables:
  parent_table:
    columns:
      id: serial primary key

  child_table:
    foreign_keys:
      fk_name: parent_table  # Simple shorthand - auto-generates FK column
    columns:
      name: *any valid PostgreSQL type*
```

## Simple Example

```yaml
columns:
  id:
    type: serial primary key

tables:
  users:
    columns:
      user_id: id
      username: varchar(100)

  posts:
    foreign_keys:
      user_fk: users  # creates column 'user_fk' automatically

    columns:
      post_id: id
      title: varchar(200)
      user_fk: integer
```

## Generated SQL

GenLogic automatically creates:
1. Foreign key constraint (referential integrity)
2. Index on foreign key columns (query performance)

```sql
CREATE TABLE users (
  user_id SERIAL PRIMARY KEY,
  username VARCHAR(100)
);

CREATE TABLE posts (
  post_id SERIAL PRIMARY KEY,
  title VARCHAR(200),
  user_fk INTEGER
);

ALTER TABLE posts
  ADD CONSTRAINT fk_posts_user_fk
  FOREIGN KEY (user_fk)
  REFERENCES users(user_id);

-- Index automatically created for query performance
CREATE INDEX idx_posts_user_fk ON posts(user_fk);
```

## Foreign Key Column Creation

GenLogic automatically creates the foreign key column if it does not exist:

```yaml
tables:
  categories:
    columns:
      id: serial primary key
      name: varchar(100)

  products:
    foreign_keys:
      category_fk: categories  # Shorthand syntax

    columns:
      id: serial primary key
      name: varchar(100)
      # category_fk column automatically created as INTEGER
```

To control the foreign key column properties, re-declare it explicitly:

```yaml
  products:
    foreign_keys:
      category_fk: categories

    columns:
      id: serial primary key
      name: varchar(100)
      category_fk: integer not null  # Explicit declaration with constraints
```

## Multiple Foreign Keys

A table can have multiple foreign keys:

```yaml
tables:
  users:
    columns:
      id: serial primary key

  categories:
    columns:
      id: serial primary key

  products:
    foreign_keys:
      user_fk: users        # Shorthand
      category_fk: categories  # Shorthand

    columns:
      id: serial primary key
      name: varchar(100)
      user_fk: integer
      category_fk: integer not null
```

Generated SQL:

```sql
ALTER TABLE products
  ADD CONSTRAINT fk_products_user_fk
  FOREIGN KEY (user_fk)
  REFERENCES users(id);

ALTER TABLE products
  ADD CONSTRAINT fk_products_category_fk
  FOREIGN KEY (category_fk)
  REFERENCES categories(id);

CREATE INDEX idx_products_user_fk ON products(user_fk);
CREATE INDEX idx_products_category_fk ON products(category_fk);
```

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
      order_id: integer
      order_year: integer
```

Generated SQL:

```sql
ALTER TABLE order_lines
  ADD CONSTRAINT fk_order_lines_order_fk
  FOREIGN KEY (order_id, order_year)
  REFERENCES order_headers(order_id, order_year);

-- Composite index for multi-column FK
CREATE INDEX idx_order_lines_order_id_order_year ON order_lines(order_id, order_year);
```

## Self-Referencing Foreign Keys

Tables can reference themselves for hierarchical data:

```yaml
tables:
  employees:
    foreign_keys:
      manager_fk: employees  # Self-referencing

    columns:
      id: serial primary key
      name: varchar(100)
      manager_fk: integer
```

Generated SQL:

```sql
CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  manager_fk INTEGER
);

ALTER TABLE employees
  ADD CONSTRAINT fk_employees_manager_fk
  FOREIGN KEY (manager_fk)
  REFERENCES employees(id);

CREATE INDEX idx_employees_manager_fk ON employees(manager_fk);
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
      customer_fk:
        table: customers
        delete: cascade  # or 'restrict'

    columns:
      id: serial primary key
      customer_fk: integer
```

Generated SQL with CASCADE:

```sql
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_customer_fk
  FOREIGN KEY (customer_fk)
  REFERENCES customers(id)
  ON DELETE CASCADE;
```

Generated SQL with RESTRICT:

```sql
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_customer_fk
  FOREIGN KEY (customer_fk)
  REFERENCES customers(id)
  ON DELETE RESTRICT;
```

Delete actions:
- cascade: Delete child rows when parent is deleted
- restrict: Prevent parent deletion if child rows exist (default)

## Auto-Create Parent

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

Generated SQL includes a BEFORE INSERT trigger:

```sql
CREATE OR REPLACE FUNCTION transactions_before_insert_genlogic()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-create parent 'categories' if it doesn't exist
  IF NEW.category_name IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM categories WHERE category_name = NEW.category_name
  ) THEN
    INSERT INTO categories (category_name)
    VALUES (NEW.category_name)
    ON CONFLICT DO NOTHING;  -- Handle race conditions
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transactions_before_insert_genlogic
  BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION transactions_before_insert_genlogic();
```

### How It Works

When inserting a child row:
1. BEFORE INSERT trigger checks if parent row exists
2. If parent doesn't exist, creates it with only the primary key populated
3. Other parent columns (like aggregations) get their default values
4. FK constraint validation then succeeds because parent exists

Example:

```sql
-- Parent table is empty
SELECT * FROM categories;
-- (no rows)

-- Insert transaction with new category
INSERT INTO transactions (amount, category_name)
VALUES (100, 'Office Supplies');

-- Parent row automatically created
SELECT * FROM categories;
-- category_name    | total_amount
-- -----------------|-------------
-- Office Supplies  | 100
```

### Use Cases

**Auto-create parent** is useful for:
- Summary tables where parent only contains PK + aggregations
- Automatic category creation (categories are just labels with counts/totals)
- Data entry simplification (no need to pre-create parent records)
- Denormalized reporting tables

### Requirements

- Parent table **must have a primary key**
- Parent columns (except PK) should have defaults or allow NULL
- Best for summary tables where parent row has no user-entered data

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

Previous: [Reusable Columns](02-reusable-columns.md) | Next: [Moving Values from Parent to Child](04-parent-to-child.md)
