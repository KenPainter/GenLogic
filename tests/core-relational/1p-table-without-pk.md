# 1P: Table Without Primary Key

Tests that GenLogic does not require tables to have a primary key.
Some tables (like lookup tables, junction tables, or log tables) may not need a PK.

## Build Schema with Table Without Primary Key

```yaml
tables:
  status_codes:
    columns:
      code: varchar(20)
      description: text
      category: varchar(50)
      # No primary key defined

  events_log:
    columns:
      event_timestamp: timestamp default CURRENT_TIMESTAMP
      event_type: varchar(50)
      event_data: jsonb
      # No primary key - logs don't need unique identification
```

## Insert Data Into Table Without PK

```sql
INSERT INTO status_codes (code, description, category)
VALUES
  ('ACTIVE', 'Item is active', 'Status'),
  ('PENDING', 'Item is pending approval', 'Status'),
  ('ARCHIVED', 'Item is archived', 'Status');
```

## Verify Data Inserted Successfully

```sql
SELECT code, description
FROM status_codes
ORDER BY code;
```

```json
[
  {
    "code": "ACTIVE",
    "description": "Item is active"
  },
  {
    "code": "ARCHIVED",
    "description": "Item is archived"
  },
  {
    "code": "PENDING",
    "description": "Item is pending approval"
  }
]
```

## Insert Events Into Log Table

```sql
INSERT INTO events_log (event_type, event_data)
VALUES
  ('USER_LOGIN', '{"user_id": 123, "ip": "192.168.1.1"}'::jsonb),
  ('USER_LOGOUT', '{"user_id": 123}'::jsonb),
  ('USER_LOGIN', '{"user_id": 456, "ip": "10.0.0.1"}'::jsonb);
```

## Verify Log Data

```sql
SELECT event_type, event_data->>'user_id' as user_id
FROM events_log
ORDER BY event_timestamp;
```

```json
[
  {
    "event_type": "USER_LOGIN",
    "user_id": "123"
  },
  {
    "event_type": "USER_LOGOUT",
    "user_id": "123"
  },
  {
    "event_type": "USER_LOGIN",
    "user_id": "456"
  }
]
```

## Update Works Without PK

```sql
UPDATE status_codes
SET description = 'Item is currently active'
WHERE code = 'ACTIVE';

SELECT code, description
FROM status_codes
WHERE code = 'ACTIVE';
```

```json
[
  {
    "code": "ACTIVE",
    "description": "Item is currently active"
  }
]
```

## Delete Works Without PK

```sql
DELETE FROM status_codes
WHERE code = 'ARCHIVED';

SELECT code FROM status_codes ORDER BY code;
```

```json
[
  {
    "code": "ACTIVE"
  },
  {
    "code": "PENDING"
  }
]
```
