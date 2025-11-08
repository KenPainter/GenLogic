# Test: Reusable Column Reference Not Found

This test verifies that the processor detects when a column references a reusable column ($ref) that doesn't exist.

## Expected Error

```
Reusable column not found: email_addr
```

## Input Schema

```yaml
columns:
  email_address:
    definition: varchar(255) not null
    format: email

  phone_number:
    definition: varchar(20)
    format: phone

tables:
  users:
    columns:
      id: serial primary key
      email:
        $ref: email_addr
      phone:
        $ref: phone_number
```

## Notes

This test validates:
- $ref resolution happens during PASS 1 column processing
- Typos in reusable column names are caught (email_addr vs email_address)
- Valid $ref references (like phone_number) work correctly
- Error message clearly identifies the missing reusable column

Processing point: schema-populator.ts lines 444-461, 563-565
