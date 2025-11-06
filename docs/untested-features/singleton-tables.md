# Singleton Tables (Untested Feature)

## Overview

Singleton tables are tables that can only contain exactly one row. This is useful for configuration, settings, or global state that should never have multiple records.

## Status

**⚠️ UNTESTED** - This feature has been implemented but not yet tested in production.

## Syntax

Add `singleton: true` to any table definition:

```yaml
tables:
  app_settings:
    singleton: true
    columns:
      id:
        definition: integer primary key
      app_name:
        definition: varchar(100)
      version:
        definition: varchar(20)
```

## How It Works

When you mark a table as `singleton: true`, GenLogic automatically:

1. **Adds DEFAULT 0 to the primary key** - The first primary key column (whether composite or single) gets `DEFAULT 0` added if not already specified
2. **Adds CHECK constraint** - A `CHECK (pk_column = 0)` constraint is added to ensure only the value 0 can exist

This effectively limits the table to a single row with primary key value 0.

## Example Generated SQL

For the YAML above, GenLogic generates:

```sql
CREATE TABLE "app_settings" (
  "id" integer DEFAULT 0,
  PRIMARY KEY ("id"),
  CHECK ("id" = 0)
);
```

## Composite Primary Keys

Singleton tables work with composite primary keys too:

```yaml
tables:
  global_config:
    singleton: true
    primary_key: [tenant_id, config_type]
    columns:
      tenant_id:
        definition: integer
      config_type:
        definition: varchar(50)
      value:
        definition: text
```

Generates:

```sql
CREATE TABLE "global_config" (
  "tenant_id" integer DEFAULT 0,
  "config_type" varchar(50),
  PRIMARY KEY ("tenant_id", "config_type"),
  CHECK ("tenant_id" = 0)
);
```

## Limitations

- Only the first primary key column is constrained to 0
- If using composite keys, only the first column gets the CHECK constraint
- The table must have a primary key defined
- Attempting to insert multiple rows will fail with constraint violation

## Testing Needed

- [ ] Create singleton table and verify only one row can be inserted
- [ ] Verify CHECK constraint prevents multiple rows
- [ ] Test with composite primary keys
- [ ] Test interaction with seed-rows
- [ ] Test with foreign key references
- [ ] Verify DEFAULT 0 is applied correctly
