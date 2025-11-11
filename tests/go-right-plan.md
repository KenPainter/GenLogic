# Complex Business Logic Test Cases

## 8a. Formula → FK → SYNC → Formula Chain

Tests complex dependency chains where:
1. A formula calculates a foreign key value (referencing an existing parent row)
2. That FK change triggers SYNC to pull data from the parent
3. Another formula uses that SYNC'd value

This verifies that trigger execution order correctly handles:
- Formula evaluation before FK constraint checking
- SYNC operations after FK updates
- Formula recalculation using SYNC'd values
- Complex dependency chains across multiple columns

## 8b. Safe Loop - Conditional Cascading Discounts

Tests a "safe loop" pattern with conditional cascading updates:

**Schema:**
- Discounts table: discount_code, discount_percent, second_discount_threshold
- Orders table: discount_code (FK), order_total, qualifies_for_second_discount
- Order_lines table: order_id (FK), line_total, discount_percent, second_discount_percent

**Flow:**
1. Order gets discount_code → SYNC discount_percent and second_discount_threshold to order
2. Order lines SYNC discount_percent from order
3. Lines calculate discounted totals and SUM to order.order_total
4. Order calculates: qualifies_for_second_discount = (order_total < second_discount_threshold)
5. Order lines SYNC qualifies_for_second_discount (as second_discount_percent: 10% or 0%)
6. Lines recalculate with second discount and SUM again
7. Order total updates (but doesn't trigger another cascade - loop terminates)

This verifies:
- Multi-level SYNC cascades work correctly
- Conditional logic in formulas triggers appropriate cascades
- Safe loops terminate correctly without infinite recursion
- Complex real-world business logic patterns function as expected
