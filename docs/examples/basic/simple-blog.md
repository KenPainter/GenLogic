Previous: [Minimal Schema](minimal-schema.md) | Next: [Type Showcase](type-showcase.md)

# Simple Blog Schema

A basic blog schema demonstrating table relationships with foreign keys. This example shows how to create related tables with proper referential integrity.

## Key Concepts

- Foreign Keys: Establish relationships between tables
- Null Inheritance: Use `null` to inherit column definitions with the same name
- Unique Constraints: Ensure data integrity with unique columns
- Mixed Column Definition: Combine inherited and explicitly defined columns

## Schema

```yaml
# Simple Blog Schema
# Demonstrates basic table relationships with foreign keys

columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  title:
    type: varchar
    size: 200

  content:
    type: text

  created_at:
    type: timestamp

tables:
  authors:
    columns:
      author_id: id
      name:
        type: varchar
        size: 100
      email:
        type: varchar
        size: 255
        unique: true

  posts:
    foreign_keys:
      author_fk:
        table: authors
    columns:
      post_id: id
      title: null        # Null reference - inherits 'title' with same name
      content: null      # Null reference - inherits 'content' with same name
      created_at: null   # Null reference - inherits 'created_at' with same name
```

## Generated SQL

This schema creates two related tables with proper foreign key constraints:

```sql
CREATE TABLE authors (
    author_id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(255) UNIQUE
);

CREATE TABLE posts (
    post_id SERIAL PRIMARY KEY,
    title VARCHAR(200),
    content TEXT,
    created_at TIMESTAMP,
    author_fk INTEGER REFERENCES authors(author_id)
);

CREATE INDEX idx_posts_author_fk ON posts(author_fk);
```

## Usage

```sql
-- Add authors
INSERT INTO authors (name, email) VALUES ('John Doe', 'john@example.com');
INSERT INTO authors (name, email) VALUES ('Jane Smith', 'jane@example.com');

-- Add posts
INSERT INTO posts (title, content, author_fk, created_at)
VALUES ('My First Post', 'Hello world!', 1, NOW());

INSERT INTO posts (title, content, author_fk, created_at)
VALUES ('Using GenLogic', 'Working with automated schemas', 2, NOW());

-- Query with joins
SELECT p.title, p.content, a.name as author_name
FROM posts p
JOIN authors a ON p.author_fk = a.author_id;
```

This example demonstrates how GenLogic makes it easy to define related tables with proper foreign key relationships while maintaining clean, readable schemas.

---

Previous: [Minimal Schema](minimal-schema.md) | Next: [Type Showcase](type-showcase.md)
