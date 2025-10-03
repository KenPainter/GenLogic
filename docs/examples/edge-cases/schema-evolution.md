Previous: [Performance Considerations](../edge-cases/performance-considerations.md) | Next: [Minimal Schema](../basic/minimal-schema.md)

# Schema Evolution Edge Cases

Demonstrates how GenLogic handles schema changes and migrations.

```yaml
# Schema Evolution Edge Cases
# Demonstrates how GenLogic handles schema changes and migrations

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

# ORIGINAL SCHEMA (v1.0)
tables:
  customers_v1:
    columns:
      customer_id:
        $ref: id

      customer_name:
        $ref: name

      # Simple automation
      total_orders:
        $ref: amount
        automation:
          type: SUM
          table: orders_v1
          foreign_key: customer_fk
          column: order_total

  orders_v1:
    foreign_keys:
      customer_fk:
        table: customers_v1

    columns:
      order_id:
        $ref: id

      customer_fk:
        type: integer
        required: true

      order_total:
        $ref: amount

# EVOLVED SCHEMA (v2.0) - Adding new automation
# Challenge: Need to calculate initial values for existing data
  customers_v2:
    columns:
      customer_id:
        $ref: id

      customer_name:
        $ref: name

      # Existing automation - no change needed
      total_orders:
        $ref: amount
        automation:
          type: SUM
          table: orders_v2
          foreign_key: customer_fk
          column: order_total

      # NEW automation - needs initial population
      order_count:
        type: integer
        automation:
          type: COUNT
          table: orders_v2
          foreign_key: customer_fk
          column: order_id
        # Migration: UPDATE customers_v2 SET order_count = (SELECT COUNT(*) FROM orders_v2 WHERE customer_fk = customer_id);

      # NEW automation with different source
      avg_order_value:
        $ref: amount
        automation:
          type: AVG
          table: orders_v2
          foreign_key: customer_fk
          column: order_total

  orders_v2:
    foreign_keys:
      customer_fk:
        table: customers_v2

    columns:
      order_id:
        $ref: id

      customer_fk:
        type: integer
        required: true

      order_total:
        $ref: amount

      # NEW column - existing records will have NULL
      order_date:
        type: date
        required: false

# SCHEMA CHANGE (v3.0) - Modifying automation source
# Challenge: Automation now points to different column
  customers_v3:
    columns:
      customer_id:
        $ref: id

      customer_name:
        $ref: name

      # CHANGED: Now sums 'final_total' instead of 'order_total'
      total_orders:
        $ref: amount
        automation:
          type: SUM
          table: orders_v3
          foreign_key: customer_fk
          column: final_total  # CHANGED from order_total
        # Migration: Recalculate all values since source column changed

      order_count:
        type: integer
        automation:
          type: COUNT
          table: orders_v3
          foreign_key: customer_fk
          column: order_id

  orders_v3:
    foreign_keys:
      customer_fk:
        table: customers_v3

    columns:
      order_id:
        $ref: id

      customer_fk:
        type: integer
        required: true

      # OLD column - might be deprecated
      order_total:
        $ref: amount

      # NEW column - becomes the automation source
      final_total:
        $ref: amount

      order_date:
        type: date
        required: false

# SCHEMA CHANGE (v4.0) - Adding foreign key constraint
# Challenge: Existing data might violate new constraints
  products_v4:
    columns:
      product_id:
        $ref: id

      product_name:
        $ref: name

      # NEW automation on existing table
      total_sold:
        type: integer
        automation:
          type: SUM
          table: order_items_v4
          foreign_key: product_fk  # NEW foreign key
          column: quantity

  order_items_v4:
    # NEW foreign key being added
    foreign_keys:
      product_fk:
        table: products_v4

    columns:
      item_id:
        $ref: id

      # This column existed but wasn't a FK before
      product_fk:
        type: integer
        required: true

      quantity:
        type: integer

# SCHEMA CHANGE (v5.0) - Removing automation
# Challenge: Dropping computed columns and their triggers
  customers_v5:
    columns:
      customer_id:
        $ref: id

      customer_name:
        $ref: name

      # REMOVED: total_orders automation deleted
      # Migration: DROP TRIGGER, ALTER TABLE DROP COLUMN

      order_count:
        type: integer
        automation:
          type: COUNT
          table: orders_v5
          foreign_key: customer_fk
          column: order_id

  orders_v5:
    foreign_keys:
      customer_fk:
        table: customers_v5

    columns:
      order_id:
        $ref: id

      customer_fk:
        type: integer
        required: true

      final_total:
        $ref: amount

# Migration patterns and considerations:
#
# 1. ADDING new automation:
#    - Create column with NULL/default value
#    - Install new trigger
#    - Backfill existing data: UPDATE parent SET automation_col = (SELECT AGG(...))
#    - Set NOT NULL constraint if desired
#
# 2. CHANGING automation source:
#    - Disable old trigger
#    - Recalculate all automation values using new source
#    - Install new trigger with updated logic
#    - Drop old trigger
#
# 3. REMOVING automation:
#    - Drop trigger function
#    - Optionally drop computed column (or keep as regular column)
#    - Clean up any indexes created for the automation
#
# 4. ADDING foreign key to existing table:
#    - Verify data integrity (all FK values exist in parent)
#    - Add foreign key constraint
#    - Install triggers for new automations
#    - Backfill automation values
#
# 5. CHANGING column types:
#    - Update automation if precision/scale changes
#    - Regenerate triggers with new type casting
#    - Consider impact on existing automation calculations
#
# GenLogic migration safety:
#
# 1. Always validate schema before applying changes
# 2. Generate migration scripts that:
#    - Disable automations during bulk updates
#    - Backfill data in batches for large tables
#    - Re-enable automations after migration
#    - Verify automation values post-migration
#
# 3. Test migrations on staging data:
#    - Verify performance impact
#    - Check data consistency
#    - Validate trigger behavior
#
# 4. Consider zero-downtime strategies:
#    - Shadow columns for gradual migration
#    - Blue-green deployments for trigger changes
#    - Rollback procedures for failed migrations
```

---

Previous: [Performance Considerations](../edge-cases/performance-considerations.md) | Next: [Minimal Schema](../basic/minimal-schema.md)
