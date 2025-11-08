# Test: Invalid Column Definition Type

This test verifies that the processor detects when a column definition contains invalid Postgres type syntax.

## Expected Error

```
Invalid Postgres type: "this is not a valid type!!!" (after extracting keywords from "this is not a valid type!!!")
```

## Input Schema

```yaml
tables:
  users:
    columns:
      id: serial primary key
      name: varchar(100)
      invalid_column: this is not a valid type!!!
      email: varchar(255)
```

## Notes

This test validates:
- Column definitions must contain valid Postgres type syntax
- The parser extracts keywords (NOT NULL, DEFAULT, etc.) first, then validates the type
- Invalid type syntax is caught after keyword extraction
- Error message shows both the invalid type and the original definition

Processing point: schema-populator.ts line 224
