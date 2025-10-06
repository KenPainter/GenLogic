Previous: [Reusable Columns](02-reusable-columns.md) | Next: [Moving Values from Parent to Child](04-parent-to-child.md)

# Foreign Keys

Foreign keys establish relationships between tables.

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
      user_fk: users  # Simple string shorthand

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

To control the foreign key column properties, declare it explicitly:

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

---

Previous: [Reusable Columns](02-reusable-columns.md) | Next: [Moving Values from Parent to Child](04-parent-to-child.md)
