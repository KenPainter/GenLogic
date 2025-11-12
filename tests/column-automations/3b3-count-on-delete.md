# 3B3: COUNT on DELETE

Tests that parent COUNT aggregation updates correctly when child rows are deleted.

## Build Schema

```yaml
tables:
  forums:
    columns:
      forum_id: serial primary key
      forum_name: varchar(100)

      # COUNT: Number of posts in this forum
      post_count:
        definition: integer
        automation: COUNT posts.post_id

  posts:
    columns:
      post_id: serial primary key
      forum_id: FK(forums)
      author: varchar(100)
      content: text
      posted_at: timestamp
```

## Insert Parent Rows

```sql
INSERT INTO forums (forum_name)
VALUES ('General Discussion'), ('Tech Support'), ('Announcements');
```

## Insert Posts

```sql
INSERT INTO posts (forum_id, author, content, posted_at)
VALUES
  ((SELECT forum_id FROM forums WHERE forum_name = 'General Discussion'), 'Alice', 'Hello everyone!', '2025-01-15 10:00:00'),
  ((SELECT forum_id FROM forums WHERE forum_name = 'General Discussion'), 'Bob', 'Welcome Alice!', '2025-01-15 10:05:00'),
  ((SELECT forum_id FROM forums WHERE forum_name = 'General Discussion'), 'Carol', 'Great to see new members', '2025-01-15 10:10:00'),
  ((SELECT forum_id FROM forums WHERE forum_name = 'General Discussion'), 'David', 'Check out the tech forum', '2025-01-15 10:15:00'),
  ((SELECT forum_id FROM forums WHERE forum_name = 'Tech Support'), 'Eve', 'Need help with installation', '2025-01-15 11:00:00'),
  ((SELECT forum_id FROM forums WHERE forum_name = 'Tech Support'), 'Frank', 'Having the same issue', '2025-01-15 11:30:00'),
  ((SELECT forum_id FROM forums WHERE forum_name = 'Announcements'), 'Admin', 'New features coming soon!', '2025-01-15 09:00:00');
```

## Verify Initial Counts

```sql
SELECT forum_name, post_count
FROM forums
ORDER BY forum_id;
```

```json
[
  {
    "forum_name": "General Discussion",
    "post_count": 4
  },
  {
    "forum_name": "Tech Support",
    "post_count": 2
  },
  {
    "forum_name": "Announcements",
    "post_count": 1
  }
]
```

## Delete Single Post from General Discussion

```sql
DELETE FROM posts
WHERE author = 'Alice';
```

## Verify Count Decreased

```sql
SELECT forum_name, post_count
FROM forums
WHERE forum_name = 'General Discussion';
```

```json
[
  {
    "forum_name": "General Discussion",
    "post_count": 3
  }
]
```

## Delete Multiple Posts from General Discussion

```sql
DELETE FROM posts
WHERE forum_id = (SELECT forum_id FROM forums WHERE forum_name = 'General Discussion')
  AND author IN ('Bob', 'Carol');
```

## Verify Count Updated

```sql
SELECT forum_name, post_count
FROM forums
WHERE forum_name = 'General Discussion';
```

```json
[
  {
    "forum_name": "General Discussion",
    "post_count": 1
  }
]
```

## Delete All Posts from Tech Support

```sql
DELETE FROM posts
WHERE forum_id = (SELECT forum_id FROM forums WHERE forum_name = 'Tech Support');
```

## Verify Tech Support Count is Zero

```sql
SELECT forum_name, post_count
FROM forums
WHERE forum_name = 'Tech Support';
```

```json
[
  {
    "forum_name": "Tech Support",
    "post_count": 0
  }
]
```

## Delete Last Post from Announcements

```sql
DELETE FROM posts
WHERE forum_id = (SELECT forum_id FROM forums WHERE forum_name = 'Announcements');
```

## Verify All Counts

```sql
SELECT forum_name, post_count
FROM forums
ORDER BY forum_id;
```

```json
[
  {
    "forum_name": "General Discussion",
    "post_count": 1
  },
  {
    "forum_name": "Tech Support",
    "post_count": 0
  },
  {
    "forum_name": "Announcements",
    "post_count": 0
  }
]
```

## Verify Remaining Posts

```sql
SELECT
  f.forum_name,
  p.author,
  p.content
FROM posts p
JOIN forums f ON f.forum_id = p.forum_id
ORDER BY p.post_id;
```

```json
[
  {
    "forum_name": "General Discussion",
    "author": "David",
    "content": "Check out the tech forum"
  }
]
```
