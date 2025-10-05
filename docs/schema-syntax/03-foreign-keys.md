# Foreign Keys

Foreign keys establish relationships between tables.

## Basic Structure

```yaml
tables:
  parent_table:
    columns:
      id: { type: integer, primary_key: true }

  child_table:
    foreign_keys:
      fk_name:
        table: parent_table
    columns:
      id: { type: integer, primary_key: true }
      fk_name: { type: integer }
```

## Simple Example

```yaml
columns:
  id:
    type: integer
    sequence: true
    primary_key: true

tables:
  users:
    columns:
      user_id: id
      username: { type: varchar, size: 100 }

  posts:
    foreign_keys:
      user_fk:
        table: users

    columns:
      post_id: id
      title: { type: varchar, size: 200 }
      user_fk: { type: integer }
```

## Generated SQL

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

CREATE INDEX idx_posts_user_fk ON posts(user_fk);
```

## Foreign Key Column Creation

GenLogic automatically creates the foreign key column if it does not exist:

```yaml
tables:
  categories:
    columns:
      id: { type: integer, primary_key: true, sequence: true }
      name: { type: varchar, size: 100 }

  products:
    foreign_keys:
      category_fk:
        table: categories

    columns:
      id: { type: integer, primary_key: true, sequence: true }
      name: { type: varchar, size: 100 }
      # category_fk column automatically created as INTEGER
```

To control the foreign key column properties, declare it explicitly:

```yaml
  products:
    foreign_keys:
      category_fk:
        table: categories

    columns:
      id: { type: integer, primary_key: true, sequence: true }
      name: { type: varchar, size: 100 }
      category_fk: { type: integer }  # Explicit declaration
```

## Multiple Foreign Keys

A table can have multiple foreign keys:

```yaml
tables:
  users:
    columns:
      id: { type: integer, primary_key: true, sequence: true }

  categories:
    columns:
      id: { type: integer, primary_key: true, sequence: true }

  products:
    foreign_keys:
      user_fk:
        table: users
      category_fk:
        table: categories

    columns:
      id: { type: integer, primary_key: true, sequence: true }
      name: { type: varchar, size: 100 }
      user_fk: { type: integer }
      category_fk: { type: integer }
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
      order_id: { type: integer, primary_key: true }
      order_year: { type: integer, primary_key: true }

  order_lines:
    foreign_keys:
      order_fk:
        table: order_headers

    columns:
      line_id: { type: integer, primary_key: true }
      order_id: { type: integer }
      order_year: { type: integer }
```

Generated SQL:

```sql
ALTER TABLE order_lines
  ADD CONSTRAINT fk_order_lines_order_fk
  FOREIGN KEY (order_id, order_year)
  REFERENCES order_headers(order_id, order_year);
```

## Self-Referencing Foreign Keys

Tables can reference themselves for hierarchical data:

```yaml
tables:
  employees:
    foreign_keys:
      manager_fk:
        table: employees

    columns:
      id: { type: integer, primary_key: true, sequence: true }
      name: { type: varchar, size: 100 }
      manager_fk: { type: integer }
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
```

## Delete Actions

Control what happens when a parent row is deleted:

```yaml
tables:
  customers:
    columns:
      id: { type: integer, primary_key: true, sequence: true }

  orders:
    foreign_keys:
      customer_fk:
        table: customers
        delete: cascade  # or 'restrict'

    columns:
      id: { type: integer, primary_key: true, sequence: true }
      customer_fk: { type: integer }
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
