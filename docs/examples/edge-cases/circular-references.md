Previous: [NULL Handling](null-handling.md) | Next: [Performance Considerations](performance-considerations.md)

# Circular Reference Edge Cases

Demonstrates potential circular dependencies and how GenLogic handles them.

```yaml
# Circular Reference Edge Cases
# Demonstrates potential circular dependencies and how GenLogic handles them

columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  name:
    type: varchar
    size: 100

  amount:
    type: numeric
    size: 10
    decimal: 2

# CASE 1: Direct circular automation (INVALID)
# This would create an infinite loop and should be rejected by validation
tables:
  invalid_circular_example:
    # DON'T DO THIS - Circular automation dependency
    columns:
      table_a_id:
        $ref: id

      # This automation depends on table_b
      sum_from_b:
        $ref: amount
        automation:
          type: SUM
          table: table_b
          foreign_key: a_fk
          column: calculated_value

  table_b:
    foreign_keys:
      a_fk:
        table: invalid_circular_example

    columns:
      table_b_id:
        $ref: id

      a_fk:
        type: integer
        required: true

      # This automation depends on table_a - CIRCULAR!
      calculated_value:
        $ref: amount
        automation:
          type: SUM
          table: invalid_circular_example
          foreign_key: table_a_id  # This creates a circular dependency
          column: sum_from_b

# CASE 2: Valid circular foreign keys (VALID)
# Foreign key circles are fine - it's automation circles that are problematic
  orders:
    foreign_keys:
      latest_item_fk:
        table: order_items
        required: false

    columns:
      order_id:
        $ref: id

      order_total:
        $ref: amount
        automation:
          type: SUM
          table: order_items
          foreign_key: order_fk
          column: line_total

      # This creates a circular FK relationship but is semantically valid
      latest_item_fk:
        type: integer
        required: false

  order_items:
    foreign_keys:
      order_fk:
        table: orders

    columns:
      item_id:
        $ref: id

      order_fk:
        type: integer
        required: true

      line_total:
        $ref: amount

# CASE 3: Indirect circular automation (INVALID)
# A -> B -> C -> A automation chain
  table_c:
    columns:
      c_id:
        $ref: id

      value_from_d:
        $ref: amount
        automation:
          type: SUM
          table: table_d
          foreign_key: c_fk
          column: value_from_e

  table_d:
    foreign_keys:
      c_fk:
        table: table_c

    columns:
      d_id:
        $ref: id

      c_fk:
        type: integer
        required: true

      value_from_e:
        $ref: amount
        automation:
          type: SUM
          table: table_e
          foreign_key: d_fk
          column: value_from_c

  table_e:
    foreign_keys:
      d_fk:
        table: table_d

    columns:
      e_id:
        $ref: id

      d_fk:
        type: integer
        required: true

      # This completes the circular automation: C -> D -> E -> C
      value_from_c:
        $ref: amount
        automation:
          type: SUM
          table: table_c
          foreign_key: c_id
          column: value_from_d

# CASE 4: Self-referencing with automation (VALID but requires care)
  categories:
    foreign_keys:
      parent_fk:
        table: categories

    columns:
      category_id:
        $ref: id

      category_name:
        $ref: name

      parent_fk:
        type: integer
        required: false

      # This is valid - counting children doesn't create circular automation
      child_count:
        type: integer
        automation:
          type: COUNT
          table: categories
          foreign_key: parent_fk
          column: category_id

      # This would be INVALID if it existed:
      # parent_name:
      #   $ref: name
      #   automation:
      #     type: LATEST
      #     table: categories
      #     foreign_key: parent_fk  # This would be circular!
      #     column: category_name

# GenLogic validation rules for circular detection:
#
# 1. Build dependency graph of all automations
# 2. Detect cycles in the automation dependency graph
# 3. Reject schemas with circular automation dependencies
# 4. Allow circular foreign key relationships (they're structurally valid)
#
# Valid patterns:
# - A has FK to B, B has FK to A (mutual references)
# - A counts children in A (self-referencing COUNT/SUM/etc.)
# - A -> B (automation), B -> C (automation), no cycle back to A
#
# Invalid patterns:
# - A -> B (automation), B -> A (automation)
# - A -> B -> C -> A (automation chain cycle)
# - A -> A (automation on self via different FK path)

# Detection algorithm:
# 1. For each automation, record: source_table -> target_table dependency
# 2. Build directed graph of these dependencies
# 3. Run cycle detection (DFS with coloring or topological sort)
# 4. If cycles found, reject schema with specific error messages
# 5. Suggest breaking cycles by removing problematic automations
```

---

Previous: [NULL Handling](null-handling.md) | Next: [Performance Considerations](performance-considerations.md)
