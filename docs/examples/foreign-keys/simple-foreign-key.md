Previous: [SUM Automation](../automations/sum-automation.md)

# Simple Foreign Key Example

## Overview

Foreign keys are fundamental to relational database design, establishing relationships between tables. This example demonstrates the simplest form of a foreign key relationship in GenLogic, where one table (posts) references another table (users) through a foreign key column.

## Key Concepts

- Foreign Key Declaration: Use the `foreign_keys` section to define relationships between tables
- Automatic Indexing: GenLogic automatically creates indexes on foreign key columns for query performance
- Referential Integrity: Foreign keys ensure that relationships between tables remain valid
- Column Naming: Foreign key columns typically follow the pattern `tablename_fk`

## YAML Configuration

```yaml
# Simple Foreign Key Example
# Demonstrates basic foreign key relationships

columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  name:
    type: varchar
    size: 100

  email:
    type: varchar
    size: 255

tables:
  users:
    columns:
      user_id:
        $ref: id

      username:
        $ref: name

      email: null

  posts:
    # Foreign key declaration - establishes relationship
    foreign_keys:
      author_fk:
        table: users  # Points to the users table

    columns:
      post_id:
        $ref: id

      title:
        $ref: name

      content:
        type: text

      # This column will be created to hold the foreign key value
      author_fk:
        type: integer
        # Optional: add NOT NULL constraint
        required: true

      created_at:
        type: timestamp

# What this generates:
# 1. users table with user_id (PK), username, email
# 2. posts table with post_id (PK), title, content, author_fk, created_at
# 3. Foreign key constraint: posts.author_fk REFERENCES users(user_id)
# 4. Index on posts.author_fk for performance
```

## Generated SQL

This schema generates two tables with a foreign key relationship:

```sql
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(100),
    email VARCHAR(255)
);

CREATE TABLE posts (
    post_id SERIAL PRIMARY KEY,
    title VARCHAR(100),
    content TEXT,
    author_fk INTEGER NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMP
);

CREATE INDEX idx_posts_author_fk ON posts(author_fk);
```

## Usage Examples

```sql
-- Create users
INSERT INTO users (username, email)
VALUES ('john_doe', 'john@example.com');

INSERT INTO users (username, email)
VALUES ('jane_smith', 'jane@example.com');

-- Create posts with foreign key references
INSERT INTO posts (title, content, author_fk, created_at)
VALUES ('My First Post', 'Hello world!', 1, NOW());

INSERT INTO posts (title, content, author_fk, created_at)
VALUES ('GenLogic Tutorial', 'Learning foreign keys', 2, NOW());

-- Query posts with author information
SELECT p.title, p.content, u.username, u.email
FROM posts p
JOIN users u ON p.author_fk = u.user_id;

-- Referential integrity prevents orphaned posts
DELETE FROM users WHERE user_id = 1;
-- ERROR: Cannot delete user with existing posts

-- Find all posts by a specific user
SELECT * FROM posts WHERE author_fk = 2;
```

---

Previous: [SUM Automation](../automations/sum-automation.md)
