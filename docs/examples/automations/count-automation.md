Previous: [SUM Automation](sum-automation.md) | Next: [MAX/MIN Automation](max-min-automation.md)

# COUNT Automation: Automatic Record Counting

## Overview

The COUNT automation automatically counts the number of child records and maintains this count in the parent table. This is essential for displaying record counts without expensive queries, managing quotas, and providing real-time metrics on relationships.

## YAML Configuration

```yaml
# COUNT Automation Example
# Automatically counts the number of child records

columns:
  id:
    type: integer
    sequence: true
    primary_key: true

tables:
  customers:
    columns:
      customer_id:
        $ref: id

      customer_name:
        type: varchar
        size: 100

      # Automatically counts the number of orders for this customer
      order_count:
        type: integer
        automation:
          type: COUNT
          table: orders
          foreign_key: customer_fk
          column: order_id  # Column to count (usually the primary key)

      # Can also count non-null values of a specific column
      paid_order_count:
        type: integer
        automation:
          type: COUNT
          table: orders
          foreign_key: customer_fk
          column: paid_amount  # Counts only orders where paid_amount IS NOT NULL

  orders:
    foreign_keys:
      customer_fk:
        table: customers

    columns:
      order_id:
        $ref: id

      order_total:
        type: numeric
        size: 10
        decimal: 2

      paid_amount:
        type: numeric
        size: 10
        decimal: 2
        # This can be NULL if order is unpaid

# How COUNT works:
# 1. INSERT new order with customer_fk=1
#    → customers.order_count for customer 1 increases by 1
#    → If paid_amount IS NOT NULL, customers.paid_order_count also increases by 1
# 2. UPDATE order SET paid_amount=100.00 WHERE paid_amount IS NULL
#    → customers.paid_order_count increases by 1 (NULL → NOT NULL transition)
# 3. UPDATE order SET paid_amount=NULL WHERE paid_amount IS NOT NULL
#    → customers.paid_order_count decreases by 1 (NOT NULL → NULL transition)
# 4. DELETE order
#    → Both counts decrease appropriately
#
# COUNT automation handles NULL transitions intelligently
```

## Generated SQL Triggers and Functions

GenLogic generates the following SQL code for COUNT automation:

```sql
-- Trigger function for maintaining COUNT automation
CREATE OR REPLACE FUNCTION orders_update_customers_counts_genlogic()
RETURNS trigger AS $$
BEGIN
  -- Handle INSERT operation
  IF TG_OP = 'INSERT' THEN
    UPDATE customers
    SET
      order_count = COALESCE(order_count, 0) + 1,
      paid_order_count = COALESCE(paid_order_count, 0) +
        CASE WHEN NEW.paid_amount IS NOT NULL THEN 1 ELSE 0 END
    WHERE customer_id = NEW.customer_fk;
    RETURN NEW;
  END IF;

  -- Handle UPDATE operation
  IF TG_OP = 'UPDATE' THEN
    -- Handle foreign key changes
    IF OLD.customer_fk IS DISTINCT FROM NEW.customer_fk THEN
      -- Remove from old customer
      IF OLD.customer_fk IS NOT NULL THEN
        UPDATE customers
        SET
          order_count = GREATEST(COALESCE(order_count, 0) - 1, 0),
          paid_order_count = GREATEST(COALESCE(paid_order_count, 0) -
            CASE WHEN OLD.paid_amount IS NOT NULL THEN 1 ELSE 0 END, 0)
        WHERE customer_id = OLD.customer_fk;
      END IF;

      -- Add to new customer
      IF NEW.customer_fk IS NOT NULL THEN
        UPDATE customers
        SET
          order_count = COALESCE(order_count, 0) + 1,
          paid_order_count = COALESCE(paid_order_count, 0) +
            CASE WHEN NEW.paid_amount IS NOT NULL THEN 1 ELSE 0 END
        WHERE customer_id = NEW.customer_fk;
      END IF;

    -- Handle paid_amount changes (NULL transitions)
    ELSIF OLD.paid_amount IS DISTINCT FROM NEW.paid_amount THEN
      DECLARE
        old_is_null BOOLEAN := OLD.paid_amount IS NULL;
        new_is_null BOOLEAN := NEW.paid_amount IS NULL;
        count_delta INTEGER := 0;
      BEGIN
        -- Calculate the change in paid count
        IF old_is_null AND NOT new_is_null THEN
          count_delta := 1;  -- NULL → NOT NULL
        ELSIF NOT old_is_null AND new_is_null THEN
          count_delta := -1; -- NOT NULL → NULL
        END IF;

        -- Update paid_order_count if there's a change
        IF count_delta != 0 THEN
          UPDATE customers
          SET paid_order_count = GREATEST(COALESCE(paid_order_count, 0) + count_delta, 0)
          WHERE customer_id = NEW.customer_fk;
        END IF;
      END;
    END IF;

    RETURN NEW;
  END IF;

  -- Handle DELETE operation
  IF TG_OP = 'DELETE' THEN
    UPDATE customers
    SET
      order_count = GREATEST(COALESCE(order_count, 0) - 1, 0),
      paid_order_count = GREATEST(COALESCE(paid_order_count, 0) -
        CASE WHEN OLD.paid_amount IS NOT NULL THEN 1 ELSE 0 END, 0)
    WHERE customer_id = OLD.customer_fk;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for all operations
CREATE TRIGGER orders_count_automation_insert
  AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_update_customers_counts_genlogic();

CREATE TRIGGER orders_count_automation_update
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_update_customers_counts_genlogic();

CREATE TRIGGER orders_count_automation_delete
  AFTER DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_update_customers_counts_genlogic();
```

## Usage Examples

### Initial Setup
```sql
-- Create a customer
INSERT INTO customers (customer_name, order_count, paid_order_count)
VALUES ('John Doe', 0, 0);
-- Result: customer_id=1, order_count=0, paid_order_count=0
```

### INSERT Operations
```sql
-- Add unpaid order
INSERT INTO orders (customer_fk, order_total, paid_amount)
VALUES (1, 100.00, NULL);
-- Result: customer 1 → order_count=1, paid_order_count=0

-- Add paid order
INSERT INTO orders (customer_fk, order_total, paid_amount)
VALUES (1, 75.00, 75.00);
-- Result: customer 1 → order_count=2, paid_order_count=1

-- Add another unpaid order
INSERT INTO orders (customer_fk, order_total, paid_amount)
VALUES (1, 50.00, NULL);
-- Result: customer 1 → order_count=3, paid_order_count=1
```

### UPDATE Operations - NULL Transitions
```sql
-- Mark unpaid order as paid
UPDATE orders
SET paid_amount = 100.00
WHERE order_id = 1;
-- NULL → NOT NULL transition
-- Result: customer 1 → order_count=3, paid_order_count=2

-- Refund a paid order (mark as unpaid)
UPDATE orders
SET paid_amount = NULL
WHERE order_id = 2;
-- NOT NULL → NULL transition
-- Result: customer 1 → order_count=3, paid_order_count=1

-- Update paid amount (no NULL transition)
UPDATE orders
SET paid_amount = 120.00
WHERE order_id = 1;
-- NOT NULL → NOT NULL (no count change)
-- Result: customer 1 → order_count=3, paid_order_count=1
```

### UPDATE Operations - Foreign Key Changes
```sql
-- Move order to different customer
UPDATE orders
SET customer_fk = 2
WHERE order_id = 1;
-- Removes counts from customer 1, adds to customer 2
-- If paid_amount=120.00:
-- Customer 1: order_count=2, paid_order_count=0
-- Customer 2: order_count=1, paid_order_count=1
```

### DELETE Operations
```sql
-- Delete a paid order
DELETE FROM orders WHERE order_id = 1;
-- Result: Both order_count and paid_order_count decrease by 1

-- Delete an unpaid order
DELETE FROM orders WHERE order_id = 3;
-- Result: Only order_count decreases by 1
```

## Automation Behavior

### COUNT Types
1. **Total Count**: Counts all records (using primary key or any non-nullable column)
2. **Conditional Count**: Counts only records where the specified column IS NOT NULL

### Performance Characteristics
- O(1) Performance: Incremental counting without aggregate queries
- Real-time Updates: Counts are immediately accurate
- Efficient Storage: Avoids expensive COUNT(*) queries
- Minimal Overhead: Simple integer arithmetic operations

### Data Consistency
- NULL Handling: Intelligently manages NULL/NOT NULL transitions
- Boundary Protection: Uses GREATEST() to prevent negative counts
- Foreign Key Moves: Properly adjusts counts when records move between parents
- Transaction Safety: All count updates happen atomically

### Edge Cases
1. **NULL Transitions**: Properly handles column value changes between NULL and NOT NULL
2. **Negative Counts**: Protected by GREATEST() function to prevent counts below 0
3. **Concurrent Operations**: Row-level locking ensures consistency
4. **Foreign Key Changes**: Correctly moves counts between parent records

## When to Use COUNT Automation

### Suitable For:
- Order counts per customer
- Comment counts per post
- File counts per folder
- Active user counts per organization
- Inventory item counts per category
- Subscription counts per plan

### Advanced Patterns:
- Status-based Counting: Count records by status (active, pending, complete)
- Date-based Counting: Count recent records within time windows
- Multi-level Counting: Count grandchildren through intermediate tables

### Consider Alternatives When:
- You need complex filtering logic beyond NULL/NOT NULL
- Counts depend on calculated values or complex expressions
- You need statistical measures beyond simple counting
- Performance of real-time calculation isn't critical

## Performance Considerations

### Advantages:
- Dashboard Performance: Instant count display without queries
- Pagination Efficiency: Total counts available without full table scans
- Quota Enforcement: Real-time limits based on current counts
- Reporting Speed: Aggregate reports use pre-calculated counts

### Monitoring:
- Watch for trigger execution time during bulk operations
- Monitor count accuracy with periodic validation queries
- Consider batch operations for large data imports
- Use appropriate indexes on foreign key and counted columns

### Scalability:
- Scales linearly with transaction volume
- No degradation with increasing child record counts
- Memory efficient (no intermediate result sets)
- Parallel-safe for independent parent records

## Data Integrity

The COUNT automation maintains data consistency through:

1. **Atomic Updates**: Count changes happen within the triggering transaction
2. **Boundary Checking**: Prevents negative counts through GREATEST() function
3. **NULL Intelligence**: Properly handles NULL/NOT NULL state transitions
4. **Cascade Safety**: Works correctly with foreign key constraints and cascades

This automation eliminates expensive COUNT(*) queries and provides real-time metrics for any parent-child relationship in your database.

---

Previous: [SUM Automation](sum-automation.md) | Next: [MAX/MIN Automation](max-min-automation.md)
