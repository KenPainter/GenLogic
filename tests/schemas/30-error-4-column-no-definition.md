# Test: Column Has No Definition After Resolution

This test verifies that the processor detects when a column has no definition after all resolution attempts ($ref, FK inference, direct).

## Expected Error

```
Column users.name has no definition after resolution
```

## Input Schema

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name:
        comment: "User's full name"
        label: "Full Name"
      email: varchar(255)
```

## Notes

This test validates:
- Columns must have a definition from at least one source
- Columns with only metadata (comment, label) but no definition are rejected
- The error occurs after all resolution attempts have been exhausted
- Error message includes full diagnostic information about the column

Processing point: schema-populator.ts lines 608-613
