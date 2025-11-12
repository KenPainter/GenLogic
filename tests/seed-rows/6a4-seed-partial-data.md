# 6A4: Partial Seed Data

Tests that omitting columns in seed data correctly uses DEFAULT values or NULL.

Covers: seed-rows with omitted columns, DEFAULT values, nullable columns.

## Build Schema

```yaml
tables:
  users:
    columns:
      user_id: serial primary key
      username: varchar(50)
      email: varchar(100)
      created_at: timestamp default CURRENT_TIMESTAMP
      is_active: boolean default true
      login_count: integer default 0
      bio: text
    seed-rows:
      # Full row - all columns specified
      - user_id: 1
        username: admin
        email: admin@example.com
        created_at: '2025-01-01 00:00:00'
        is_active: true
        login_count: 0
        bio: System administrator

      # Omit columns with defaults - should get default values
      - user_id: 2
        username: alice
        email: alice@example.com

      # Omit nullable columns - should get NULL
      - user_id: 3
        username: bob
        is_active: true
        login_count: 5

      # Minimal - only required columns
      - user_id: 4
        username: charlie
```

## Verify Full Row Seeded

```sql
SELECT user_id, username, email, is_active, login_count, bio
FROM users
WHERE user_id = 1;
```

```json
[
  {
    "user_id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "is_active": true,
    "login_count": 0,
    "bio": "System administrator"
  }
]
```

## Verify Defaults Applied

User 2 should have default values for created_at, is_active, and login_count.

```sql
SELECT user_id, username, email, is_active, login_count, bio,
       created_at IS NOT NULL as has_created_at
FROM users
WHERE user_id = 2;
```

```json
[
  {
    "user_id": 2,
    "username": "alice",
    "email": "alice@example.com",
    "is_active": true,
    "login_count": 0,
    "bio": null,
    "has_created_at": true
  }
]
```

## Verify NULL for Omitted Columns

User 3 omits email and bio - should be NULL.

```sql
SELECT user_id, username, email, is_active, login_count, bio
FROM users
WHERE user_id = 3;
```

```json
[
  {
    "user_id": 3,
    "username": "bob",
    "email": null,
    "is_active": true,
    "login_count": 5,
    "bio": null
  }
]
```

## Verify Minimal Seed Row

User 4 has only required columns - others should be defaults or NULL.

```sql
SELECT user_id, username, email, is_active, login_count, bio,
       created_at IS NOT NULL as has_created_at
FROM users
WHERE user_id = 4;
```

```json
[
  {
    "user_id": 4,
    "username": "charlie",
    "email": null,
    "is_active": true,
    "login_count": 0,
    "bio": null,
    "has_created_at": true
  }
]
```

## Verify All Seed Rows Created

```sql
SELECT user_id, username, email
FROM users
ORDER BY user_id;
```

```json
[
  {
    "user_id": 1,
    "username": "admin",
    "email": "admin@example.com"
  },
  {
    "user_id": 2,
    "username": "alice",
    "email": "alice@example.com"
  },
  {
    "user_id": 3,
    "username": "bob",
    "email": null
  },
  {
    "user_id": 4,
    "username": "charlie",
    "email": null
  }
]
```

## Insert Row Without Omitted Columns

Verify that defaults work for regular inserts too.

```sql
INSERT INTO users (username)
VALUES ('david');
```

## Verify Regular Insert Gets Defaults

```sql
SELECT user_id, username, email, is_active, login_count, bio,
       created_at IS NOT NULL as has_created_at
FROM users
WHERE username = 'david';
```

```json
[
  {
    "user_id": 100,
    "username": "david",
    "email": null,
    "is_active": true,
    "login_count": 0,
    "bio": null,
    "has_created_at": true
  }
]
```
