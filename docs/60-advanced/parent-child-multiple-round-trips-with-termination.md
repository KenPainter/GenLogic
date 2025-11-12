Previous: [Intra-Table Dependencies With Calculated Foreign Keys](intra-table-column-dependency-chain-via-fk.md) | Next: [Reference: Tables and Columns](../70-reference/10-tables-and-columns-reference.md)

# Multiple Round Trips Through Parent-Child Pair with Termination

This pattern demonstrates how to specify complex calculations
that involve multiple "round trips" through the same parent-child
pair that are guaranteed to terminate.

Because GenLogic sorts calculations topologically against a graph
of edges between columns, a calculation chain can involve a 
"zig zag" of data moving back and forth between the same parent and
child, so long as the same column does not appear
twice in the chain of actions.

In less stiff language, we say you must "spread out" the calculation.

## The Pattern

```yaml
tables:
  orders:
    columns:
      order_id: integer primary key

      # Trigger value: starts the zig-zag
      discount_percent: numeric(5,4)

      # Trigger value: used in conditional
      threshold: numeric(10,2)

      # Step 3: Aggregation pushed by child (first pass)
      subtotal:
        definition: numeric(10,2)
        automation: SUM order_lines.subtotal

      # Step 4: Formula - conditional based on aggregation
      qualifies_for_bonus:
        definition: boolean
        formula: "CASE WHEN subtotal < threshold THEN true ELSE false END"

      # Step 7: Aggregation from children (second pass)
      final_total:
        definition: numeric(10,2)
        automation: SUM order_lines.line_total

  order_lines:
    columns:
      line_id: integer primary key
      order_id: FK orders

      # Trigger value: starts the calculation chain
      base_price: numeric(10,2)

      # Step 1: SYNC from parent (on INSERT)
      discount_percent:
        definition: numeric(5,4)
        automation: SYNC orders.discount_percent

      # Step 2: Formula - apply first discount
      subtotal:
        definition: numeric(10,2)
        formula: "base_price * (1 - discount_percent)"

      # Step 5: SYNC pushed from parent (conditional result)
      qualifies_for_bonus:
        definition: boolean
        automation: SYNC orders.qualifies_for_bonus

      # Step 6: Formula - conditional on SYNC'd value
      line_total:
        definition: numeric(10,2)
        formula: "subtotal * (CASE WHEN qualifies_for_bonus THEN 0.90 ELSE 1.00 END)"
```

## Data Flow

Round trip 1:
1. Child pulls `discount_percent` via SYNC
2. Child calculates `subtotal` formula
3. Child pushes aggregate `subtotal` SUM using delta OLD/NEW
4. Parent calculates `qualifies_for_bonus` formula

Round trip 2:
5. Parent pushes `qualifies_for_bonus` (if changed) 
6. Child calculates `line_total` formula
7. Child pushes aggregate `line_total` SUM using delta OLD/NEW

## Why It Terminates

The column dependency chain is a straight line 
from `discount_percent` to `final_total`. Each step uses a 
different column, so there is no cycle in the column dependency graph.

## Example: Qualifies for Bonus

Insert order with lines totaling below threshold:

```sql
INSERT INTO orders (order_id, discount_percent, threshold)
VALUES (1, 0.20, 100.00);

INSERT INTO order_lines (line_id, order_id, base_price)
VALUES (1, 1, 50.00), (2, 1, 40.00);
```

Calculations:
- Lines: base $50 and $40
- After first discount (20%): $40 + $32 = $72 (< $100 threshold)
- `qualifies_for_bonus` = true
- After bonus (10%): $40 × 0.90 + $32 × 0.90 = $64.80

## Example: Does Not Qualify

Insert order with lines totaling above threshold:

```sql
INSERT INTO orders (order_id, discount_percent, threshold)
VALUES (2, 0.20, 100.00);

INSERT INTO order_lines (line_id, order_id, base_price)
VALUES (3, 2, 75.00), (4, 2, 80.00);
```

Calculations:
- Lines: base $75 and $80
- After first discount (20%): $60 + $64 = $124 (> $100 threshold)
- `qualifies_for_bonus` = false
- No bonus applied: $60 + $64 = $124

## Dynamic Qualification

Delete a line to drop below threshold:

```sql
DELETE FROM order_lines WHERE line_id = 4;
```

New calculations:
- Remaining: $60 (< $100 threshold)
- `qualifies_for_bonus` = true
- Bonus applies: $60 × 0.90 = $54

The system recalculates through both round trips automatically.

---

Previous: [Intra-Table Dependencies With Calculated Foreign Keys](intra-table-column-dependency-chain-via-fk.md) | Next: [Reference: Tables and Columns](../70-reference/10-tables-and-columns-reference.md)
