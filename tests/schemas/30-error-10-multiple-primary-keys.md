# Test: Table Has Multiple Primary Keys

This test verifies that the processor detects when a table has multiple columns marked as primary key.

## Expected Error

```
Table users has multiple primary key columns: id, user_id
```

## Input Schema

```yaml
tables:
  users:
    columns:
      id: serial primary key
      user_id: integer primary key
      name: varchar(100)
      email: varchar(255)
```

## Notes

This test validates:
- SQL tables can only have one primary key (single column or composite)
- Multiple columns with "primary key" are detected and rejected
- The validation happens during table processing before column iteration
- Error message lists all columns that claim to be primary keys

Note: Composite primary keys (single PK across multiple columns) are not supported
in GenLogic and should be specified differently if needed in the future.

Processing point: schema-populator.ts lines 540-544 (during primary key extraction)
