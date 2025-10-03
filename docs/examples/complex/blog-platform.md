Previous: [Multiple Automations](../automations/multiple-automations.md) | Next: [E-commerce System](../complex/e-commerce-system.md)

# Blog Platform Example

## Overview

A comprehensive blog platform schema demonstrating users, posts, comments, categories, tags, and social features like likes. This example showcases complex relationships including many-to-many (posts-tags), self-referencing (nested comments, hierarchical categories), and extensive automation for real-time metrics.

**Prerequisites:** Before studying this complex example, familiarize yourself with:
- [../basic/simple-blog.md](../basic/simple-blog.md) - Basic blog schema
- [../automations/count-automation.md](../automations/count-automation.md) - COUNT automation
- [../foreign-keys/self-referencing.md](../foreign-keys/self-referencing.md) - Self-referencing relationships

## Key Concepts

- Many-to-Many Relationships: Junction tables for posts and tags
- Self-Referencing: Nested comment threads and category hierarchies
- Social Features: Like tracking with unique constraints
- Automated Metrics: Real-time counts for posts, comments, likes, and tags
- Content Management: Status tracking, categorization, and engagement metrics

## YAML Configuration

```yaml
# Blog Platform Example
# Demonstrates users, posts, comments, categories, tags, and social features
# Shows many-to-many relationships and content management patterns

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

  username:
    type: varchar
    size: 50

  slug:
    type: varchar
    size: 100

  content:
    type: text

  url:
    type: varchar
    size: 500

tables:
  users:
    columns:
      user_id:
        $ref: id

      username: null

      email: null

      display_name:
        $ref: name

      bio:
        $ref: content

      avatar_url:
        $ref: url

      # Automation: count published posts
      post_count:
        type: integer
        automation:
          type: COUNT
          table: posts
          foreign_key: author_fk
          column: post_id
          # Could add condition: WHERE status = 'published'

      # Automation: count comments made
      comment_count:
        type: integer
        automation:
          type: COUNT
          table: comments
          foreign_key: user_fk
          column: comment_id

      # Automation: total likes received on all posts
      total_likes:
        type: integer
        automation:
          type: SUM
          table: posts
          foreign_key: author_fk
          column: like_count

      joined_at:
        type: timestamp

  categories:
    foreign_keys:
      parent_fk:
        table: categories

    columns:
      category_id:
        $ref: id

      category_name:
        $ref: name

      slug: null

      description:
        $ref: content

      parent_fk:
        type: integer
        required: false

      # Automation: count posts in category
      post_count:
        type: integer
        automation:
          type: COUNT
          table: posts
          foreign_key: category_fk
          column: post_id

  tags:
    columns:
      tag_id:
        $ref: id

      tag_name:
        $ref: name

      slug: null

      # Automation: count posts with this tag
      usage_count:
        type: integer
        automation:
          type: COUNT
          table: post_tags
          foreign_key: tag_fk
          column: post_tag_id

  posts:
    foreign_keys:
      author_fk:
        table: users
      category_fk:
        table: categories

    columns:
      post_id:
        $ref: id

      title:
        $ref: name

      slug: null

      content: null

      excerpt:
        type: varchar
        size: 500

      author_fk:
        type: integer
        required: true

      category_fk:
        type: integer
        required: false

      status:
        type: varchar
        size: 20
        # draft, published, archived

      # Automation: count comments on this post
      comment_count:
        type: integer
        automation:
          type: COUNT
          table: comments
          foreign_key: post_fk
          column: comment_id

      # Automation: count likes
      like_count:
        type: integer
        automation:
          type: COUNT
          table: post_likes
          foreign_key: post_fk
          column: like_id

      # Automation: count tags
      tag_count:
        type: integer
        automation:
          type: COUNT
          table: post_tags
          foreign_key: post_fk
          column: post_tag_id

      published_at:
        type: timestamp

      created_at:
        type: timestamp

  # Many-to-many: posts <-> tags
  post_tags:
    foreign_keys:
      post_fk:
        table: posts
        on_delete: CASCADE
      tag_fk:
        table: tags
        on_delete: CASCADE

    columns:
      post_tag_id:
        $ref: id

      post_fk:
        type: integer
        required: true

      tag_fk:
        type: integer
        required: true

      created_at:
        type: timestamp

  comments:
    foreign_keys:
      post_fk:
        table: posts
        on_delete: CASCADE
      user_fk:
        table: users
      parent_fk:
        table: comments  # Self-referencing for nested comments

    columns:
      comment_id:
        $ref: id

      post_fk:
        type: integer
        required: true

      user_fk:
        type: integer
        required: true

      parent_fk:
        type: integer
        required: false  # NULL for top-level comments

      content: null

      # Automation: count replies to this comment
      reply_count:
        type: integer
        automation:
          type: COUNT
          table: comments
          foreign_key: parent_fk
          column: comment_id

      # Automation: count likes on this comment
      like_count:
        type: integer
        automation:
          type: COUNT
          table: comment_likes
          foreign_key: comment_fk
          column: like_id

      created_at:
        type: timestamp

  post_likes:
    foreign_keys:
      post_fk:
        table: posts
        on_delete: CASCADE
      user_fk:
        table: users
        on_delete: CASCADE

    columns:
      like_id:
        $ref: id

      post_fk:
        type: integer
        required: true

      user_fk:
        type: integer
        required: true

      created_at:
        type: timestamp

    # Unique constraint to prevent duplicate likes
    unique_constraints:
      - [post_fk, user_fk]

  comment_likes:
    foreign_keys:
      comment_fk:
        table: comments
        on_delete: CASCADE
      user_fk:
        table: users
        on_delete: CASCADE

    columns:
      like_id:
        $ref: id

      comment_fk:
        type: integer
        required: true

      user_fk:
        type: integer
        required: true

      created_at:
        type: timestamp

    unique_constraints:
      - [comment_fk, user_fk]

# Complex interaction patterns:
#
# 1. User publishes a post:
#    - users.post_count increases
#    - categories.post_count increases
#    - Each tag.usage_count increases (via post_tags)
#
# 2. User adds comment:
#    - posts.comment_count increases
#    - users.comment_count increases
#    - If nested, parent comment.reply_count increases
#
# 3. User likes a post:
#    - posts.like_count increases
#    - author's users.total_likes increases
#
# 4. Post gets tagged:
#    - posts.tag_count increases
#    - tags.usage_count increases
#
# This creates a living system where metrics update in real-time:
# - Popular posts/tags are immediately identifiable
# - User engagement metrics stay current
# - Content categorization maintains accurate counts
# - Social features (likes, comments) drive real-time engagement metrics
```

## Generated SQL (Simplified)

Key tables with automation triggers:

```sql
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50),
    email VARCHAR(255),
    display_name VARCHAR(100),
    bio TEXT,
    avatar_url VARCHAR(500),
    post_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    total_likes INTEGER DEFAULT 0,
    joined_at TIMESTAMP
);

CREATE TABLE posts (
    post_id SERIAL PRIMARY KEY,
    title VARCHAR(100),
    slug VARCHAR(100),
    content TEXT,
    excerpt VARCHAR(500),
    author_fk INTEGER REFERENCES users(user_id),
    category_fk INTEGER REFERENCES categories(category_id),
    status VARCHAR(20),
    comment_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    tag_count INTEGER DEFAULT 0,
    published_at TIMESTAMP,
    created_at TIMESTAMP
);

CREATE TABLE comments (
    comment_id SERIAL PRIMARY KEY,
    post_fk INTEGER REFERENCES posts(post_id) ON DELETE CASCADE,
    user_fk INTEGER REFERENCES users(user_id),
    parent_fk INTEGER REFERENCES comments(comment_id),
    content TEXT,
    reply_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    created_at TIMESTAMP
);

CREATE TABLE post_tags (
    post_tag_id SERIAL PRIMARY KEY,
    post_fk INTEGER REFERENCES posts(post_id) ON DELETE CASCADE,
    tag_fk INTEGER REFERENCES tags(tag_id) ON DELETE CASCADE,
    created_at TIMESTAMP,
    UNIQUE(post_fk, tag_fk)
);

-- Automation triggers maintain all count columns automatically
```

## Usage Examples

```sql
-- Create users
INSERT INTO users (username, email, display_name)
VALUES ('john_blogger', 'john@example.com', 'John Doe'),
       ('jane_writer', 'jane@example.com', 'Jane Smith');

-- Create categories
INSERT INTO categories (category_name, slug, description)
VALUES ('Technology', 'technology', 'Tech articles'),
       ('Programming', 'programming', 'Code tutorials');

UPDATE categories SET parent_fk = 1 WHERE category_name = 'Programming';

-- Create tags
INSERT INTO tags (tag_name, slug)
VALUES ('javascript', 'javascript'),
       ('python', 'python'),
       ('tutorial', 'tutorial');

-- Create a blog post
INSERT INTO posts (title, slug, content, excerpt, author_fk, category_fk, status)
VALUES ('Getting Started with GenLogic', 'genlogic-intro',
        'Full article content...', 'Learn GenLogic basics',
        1, 2, 'published');
-- Automatically: users.post_count for user 1 increments
-- Automatically: categories.post_count for category 2 increments

-- Tag the post
INSERT INTO post_tags (post_fk, tag_fk)
VALUES (1, 1), (1, 3);  -- javascript, tutorial
-- Automatically: posts.tag_count for post 1 = 2
-- Automatically: tags.usage_count for tag 1 and 3 increment

-- Add comments
INSERT INTO comments (post_fk, user_fk, content)
VALUES (1, 2, 'Great article!');
-- Automatically: posts.comment_count for post 1 increments
-- Automatically: users.comment_count for user 2 increments

-- Add nested reply
INSERT INTO comments (post_fk, user_fk, parent_fk, content)
VALUES (1, 1, 1, 'Thanks for reading!');
-- Automatically: posts.comment_count increments
-- Automatically: comments.reply_count for comment 1 increments

-- Like a post
INSERT INTO post_likes (post_fk, user_fk)
VALUES (1, 2);
-- Automatically: posts.like_count for post 1 increments
-- Automatically: users.total_likes for post author (user 1) increments

-- Like a comment
INSERT INTO comment_likes (comment_fk, user_fk)
VALUES (1, 1);
-- Automatically: comments.like_count for comment 1 increments

-- Query popular posts with all metrics
SELECT p.title, u.display_name as author,
       p.comment_count, p.like_count, p.tag_count
FROM posts p
JOIN users u ON p.author_fk = u.user_id
WHERE p.status = 'published'
ORDER BY p.like_count DESC, p.comment_count DESC
LIMIT 10;

-- Query user engagement metrics
SELECT username, display_name, post_count, comment_count, total_likes
FROM users
ORDER BY total_likes DESC;

-- Query tag popularity
SELECT tag_name, usage_count
FROM tags
ORDER BY usage_count DESC;

-- Query category hierarchy with post counts
WITH RECURSIVE cat_tree AS (
    SELECT category_id, category_name, parent_fk, post_count, 0 as level
    FROM categories WHERE parent_fk IS NULL
    UNION ALL
    SELECT c.category_id, c.category_name, c.parent_fk, c.post_count, ct.level + 1
    FROM categories c
    JOIN cat_tree ct ON c.parent_fk = ct.category_id
)
SELECT category_name, post_count, level
FROM cat_tree
ORDER BY level, category_name;
```

---

Previous: [Multiple Automations](../automations/multiple-automations.md) | Next: [E-commerce System](../complex/e-commerce-system.md)
