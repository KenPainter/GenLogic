Previous: [Reference: Column Automations](30-column-automations-reference.md) | Next: [Reference: Seed Rows](50-seed-data-reference.md)

# Row Automations Technical Reference

## Auto-Create Parent

Add `auto create parent` to foreign key definition.

```yaml
tables:
  parent_table:
    columns:
      parent_id: serial primary key
      parent_name: varchar(100)

  child_table:
    columns:
      child_id: serial primary key
      parent_id: FK(parent_table) auto create parent
      child_name: varchar(100)
```

Behavior:
- When inserting child with non-existent parent_id, GenLogic creates parent row
- Parent row created with only primary key populated
- Other parent columns are NULL or use default values
- No duplicate parents created (uses ON CONFLICT DO NOTHING)
- Works with existing parents (no-op if parent exists)

## Multi-Level Auto-Create

Auto-create works across multiple levels:

```yaml
tables:
  level_1:
    columns:
      id: serial primary key

  level_2:
    columns:
      id: serial primary key
      level_1_id: FK(level_1) auto create parent

  level_3:
    columns:
      id: serial primary key
      level_2_id: FK(level_2) auto create parent
```

Inserting into level_3 with non-existent level_2_id creates both level_2 and level_1 rows.

## No Auto-Delete

GenLogic does not delete parent rows when children are removed.

---

Previous: [Reference: Column Automations](30-column-automations-reference.md) | Next: [Reference: Seed Rows](50-seed-data-reference.md)
