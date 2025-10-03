Previous: [COUNT Automation](../automations/count-automation.md) | Next: [LATEST Automation](../automations/latest-automation.md)

# MAX and MIN Automation Examples

Automatically tracks the maximum and minimum values from child records.

```yaml
# MAX and MIN Automation Examples
# Automatically tracks the maximum and minimum values from child records

columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  amount:
    type: numeric
    size: 10
    decimal: 2

  score:
    type: integer

tables:
  students:
    columns:
      student_id:
        $ref: id

      student_name:
        type: varchar
        size: 100

      # Tracks the highest score achieved by this student
      highest_score:
        $ref: score
        automation:
          type: MAX
          table: test_scores
          foreign_key: student_fk
          column: score

      # Tracks the lowest score achieved by this student
      lowest_score:
        $ref: score
        automation:
          type: MIN
          table: test_scores
          foreign_key: student_fk
          column: score

  portfolios:
    columns:
      portfolio_id:
        $ref: id

      portfolio_name:
        type: varchar
        size: 100

      # Tracks the largest investment in this portfolio
      max_investment:
        $ref: amount
        automation:
          type: MAX
          table: investments
          foreign_key: portfolio_fk
          column: amount

      # Tracks the smallest investment in this portfolio
      min_investment:
        $ref: amount
        automation:
          type: MIN
          table: investments
          foreign_key: portfolio_fk
          column: amount

  test_scores:
    foreign_keys:
      student_fk:
        table: students

    columns:
      score_id:
        $ref: id

      score: null

      test_date:
        type: date

  investments:
    foreign_keys:
      portfolio_fk:
        table: portfolios

    columns:
      investment_id:
        $ref: id

      amount: null

      investment_date:
        type: date

# How MAX/MIN work:
# 1. INSERT new score=95 for student_id=1
#    → If 95 > current highest_score, students.highest_score updates to 95
#    → If 95 < current lowest_score (or no scores exist), students.lowest_score updates to 95
# 2. UPDATE existing score from 80 to 98
#    → If 98 > current highest_score, students.highest_score updates to 98
# 3. DELETE the current maximum score
#    → Trigger recalculates MAX from remaining records
#    → students.highest_score updates to the new maximum
# 4. UPDATE current maximum to a lower value
#    → Trigger recalculates MAX from all records
#    → students.highest_score updates to the new maximum
#
# GenLogic uses smart fallback logic:
# - For INSERT/UPDATE: Incremental comparison (O(1))
# - For DELETE of extreme value: Recalculation query (O(n))
# - For UPDATE of extreme value to non-extreme: Recalculation query (O(n))
```

---

Previous: [COUNT Automation](../automations/count-automation.md) | Next: [LATEST Automation](../automations/latest-automation.md)
