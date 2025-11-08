# Test: Automation References Non-Existent Table

This test verifies that the processor detects when an automation references a table that doesn't exist.

## Expected Error

```
references non-existent child table: nonexistent_table
```

## Input Schema

```yaml
tables:
  accounts:
    columns:
      id: serial primary key
      total:
        definition: numeric(12,2)
        automation: "SUM nonexistent_table.amount"
```

## Notes

This test validates:
- Automation expressions must reference tables that exist in the schema
- The automation parser successfully extracts table names
- Non-existent table references are caught and reported clearly
- Error message identifies both the automation column and the missing table
- Valid automations (referencing real tables) would work correctly

Processing point: schema-populator.ts lines 656-672 (after automation parsing, during edge creation)
