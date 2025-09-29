# Simple Foreign Key Example

Demonstrates basic foreign key relationships.

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
#
# Usage:
# INSERT INTO users (username, email) VALUES ('john_doe', 'john@example.com');
# INSERT INTO posts (title, content, author_fk) VALUES ('My First Post', 'Hello world!', 1);
```