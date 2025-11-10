# Test: 1C - Primary Keys

Tests different primary key configurations and behavior.

## Step 1: Single column PK (serial)

```yaml
tables:
  users:
    columns:
      id: serial primary key
      username: varchar(50)
```

## Verify serial PK created

```json
{
  "newSchema": {
    "tables.users.pkColumn": "id",
    "tables.users.columns.id.type": "integer"
  }
}
```

## Test serial auto-increment

```sql
INSERT INTO users (username) VALUES ('alice');
INSERT INTO users (username) VALUES ('bob');
SELECT id, username FROM users ORDER BY id;
```

## Verify IDs auto-assigned

```json
[
  {"id": 100, "username": "alice"},
  {"id": 101, "username": "bob"}
]
```

## Step 2: Integer PK (manual)

```yaml
tables:
  users:
    columns:
      id: serial primary key
      username: varchar(50)

  codes:
    columns:
      code_id: integer primary key
      code_value: varchar(20)
```

## Verify integer PK created

```json
{
  "newSchema": {
    "tables.codes.pkColumn": "code_id",
    "tables.codes.columns.code_id.type": "integer"
  }
}
```

## Test manual PK insertion

```sql
INSERT INTO codes (code_id, code_value) VALUES (100, 'ALPHA');
INSERT INTO codes (code_id, code_value) VALUES (200, 'BETA');
SELECT code_id, code_value FROM codes ORDER BY code_id;
```

## Verify manual PKs work

```json
[
  {"code_id": 100, "code_value": "ALPHA"},
  {"code_id": 200, "code_value": "BETA"}
]
```

## Step 3: Bigint PK (for large tables)

```yaml
tables:
  users:
    columns:
      id: serial primary key
      username: varchar(50)

  codes:
    columns:
      code_id: integer primary key
      code_value: varchar(20)

  events:
    columns:
      event_id: bigserial primary key
      event_type: varchar(50)
```

## Verify bigserial PK created

```json
{
  "newSchema": {
    "tables.events.pkColumn": "event_id",
    "tables.events.columns.event_id.type": "bigint"
  }
}
```

## Test bigserial

```sql
INSERT INTO events (event_type) VALUES ('login');
INSERT INTO events (event_type) VALUES ('logout');
SELECT event_id, event_type FROM events ORDER BY event_id;
```

## Verify bigserial IDs

```json
[
  {"event_id": 100, "event_type": "login"},
  {"event_id": 101, "event_type": "logout"}
]
```

## Step 4: Smallint PK (for small lookup tables)

```yaml
tables:
  users:
    columns:
      id: serial primary key
      username: varchar(50)

  codes:
    columns:
      code_id: integer primary key
      code_value: varchar(20)

  events:
    columns:
      event_id: bigserial primary key
      event_type: varchar(50)

  status_codes:
    columns:
      status_id: smallint primary key
      status_name: varchar(20)
```

## Verify smallint PK created

```json
{
  "newSchema": {
    "tables.status_codes.pkColumn": "status_id",
    "tables.status_codes.columns.status_id.type": "smallint"
  }
}
```

## Test smallint PK

```sql
INSERT INTO status_codes (status_id, status_name) VALUES (1, 'Active');
INSERT INTO status_codes (status_id, status_name) VALUES (2, 'Inactive');
SELECT status_id, status_name FROM status_codes ORDER BY status_id;
```

## Verify smallint PKs work

```json
[
  {"status_id": 1, "status_name": "Active"},
  {"status_id": 2, "status_name": "Inactive"}
]
```

## Step 5: Table without PK (lookup table pattern)

```yaml
tables:
  users:
    columns:
      id: serial primary key
      username: varchar(50)

  codes:
    columns:
      code_id: integer primary key
      code_value: varchar(20)

  events:
    columns:
      event_id: bigserial primary key
      event_type: varchar(50)

  status_codes:
    columns:
      status_id: smallint primary key
      status_name: varchar(20)

  config:
    columns:
      key: varchar(50)
      value: text
```

## Verify table without PK is allowed

```json
{
  "newSchema": {
    "tables.config": "@exists",
    "errors.length": 0
  }
}
```

## Test table without PK

```sql
INSERT INTO config (key, value) VALUES ('app_name', 'MyApp');
INSERT INTO config (key, value) VALUES ('version', '1.0');
INSERT INTO config (key, value) VALUES ('app_name', 'MyApp Updated');
SELECT key, value FROM config ORDER BY key, value;
```

## Verify duplicate keys allowed (no PK)

```json
[
  {"key": "app_name", "value": "MyApp"},
  {"key": "app_name", "value": "MyApp Updated"},
  {"key": "version", "value": "1.0"}
]
```
