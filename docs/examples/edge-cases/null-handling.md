Previous: [Financial Tracking](../complex/financial-tracking.md) | Next: [Circular References](../edge-cases/circular-references.md)

# NULL Value Handling Edge Cases

Demonstrates how GenLogic automation handles NULL values correctly.

```yaml
# NULL Value Handling Edge Cases
# Demonstrates how GenLogic automation handles NULL values correctly

columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  nullable_amount:
    type: numeric
    size: 10
    decimal: 2
    required: false  # Can be NULL

  required_amount:
    type: numeric
    size: 10
    decimal: 2
    required: true   # Cannot be NULL

  status:
    type: varchar
    size: 20

tables:
  accounts:
    columns:
      account_id:
        $ref: id

      # SUM automation with NULLs
      balance:
        $ref: required_amount
        automation:
          type: SUM
          table: transactions
          foreign_key: account_fk
          column: amount
        # SUM ignores NULL values, returns 0 if all values are NULL

      # COUNT automation with NULLs
      transaction_count:
        type: integer
        automation:
          type: COUNT
          table: transactions
          foreign_key: account_fk
          column: transaction_id
        # COUNT counts non-NULL values only

      # COUNT with nullable column
      paid_transaction_count:
        type: integer
        automation:
          type: COUNT
          table: transactions
          foreign_key: account_fk
          column: paid_amount  # This column can be NULL
        # Only counts transactions where paid_amount IS NOT NULL

      # MAX automation with NULLs
      largest_transaction:
        $ref: nullable_amount
        automation:
          type: MAX
          table: transactions
          foreign_key: account_fk
          column: amount
        # MAX ignores NULLs, returns NULL if all values are NULL

      # MIN automation with NULLs
      smallest_transaction:
        $ref: nullable_amount
        automation:
          type: MIN
          table: transactions
          foreign_key: account_fk
          column: amount
        # MIN ignores NULLs, returns NULL if all values are NULL

      # LATEST automation with NULLs
      latest_status:
        type: varchar
        size: 20
        automation:
          type: LATEST
          table: transactions
          foreign_key: account_fk
          column: status
        # LATEST can return NULL if the most recent record has NULL in the column

  transactions:
    foreign_keys:
      account_fk:
        table: accounts

    columns:
      transaction_id:
        $ref: id

      account_fk:
        type: integer
        required: true

      # This can be NULL - pending transactions
      amount:
        $ref: nullable_amount

      # This can be NULL - unpaid transactions
      paid_amount:
        $ref: nullable_amount

      status: null  # Can be NULL

      description:
        type: varchar
        size: 200

# Edge cases and expected behavior:

# CASE 1: All child values are NULL
# INSERT INTO transactions (account_fk, amount, paid_amount, status)
# VALUES (1, NULL, NULL, NULL);
#
# Result:
# - accounts.balance = 0 (SUM of empty set)
# - accounts.transaction_count = 1 (counts the record)
# - accounts.paid_transaction_count = 0 (paid_amount is NULL)
# - accounts.largest_transaction = NULL (MAX of empty set)
# - accounts.smallest_transaction = NULL (MIN of empty set)
# - accounts.latest_status = NULL (most recent status is NULL)

# CASE 2: Mix of NULL and non-NULL values
# INSERT INTO transactions (account_fk, amount, paid_amount, status)
# VALUES (1, 100.00, NULL, 'pending'),
#        (1, NULL, 50.00, 'completed'),
#        (1, 200.00, 200.00, NULL);
#
# Result:
# - accounts.balance = 300.00 (SUM ignores NULL, adds 100 + 200)
# - accounts.transaction_count = 3 (counts all records)
# - accounts.paid_transaction_count = 2 (counts non-NULL paid_amounts)
# - accounts.largest_transaction = 200.00 (MAX ignores NULL)
# - accounts.smallest_transaction = 100.00 (MIN ignores NULL)
# - accounts.latest_status = NULL (most recent record has NULL status)

# CASE 3: Transition from NULL to non-NULL
# UPDATE transactions SET paid_amount = 100.00
# WHERE transaction_id = 1 AND paid_amount IS NULL;
#
# Result:
# - accounts.paid_transaction_count increases by 1
# - If using COUNT(paid_amount), the automation detects NULL -> NOT NULL transition

# CASE 4: Transition from non-NULL to NULL
# UPDATE transactions SET amount = NULL WHERE transaction_id = 2;
#
# Result:
# - accounts.balance decreases (subtracts the old value)
# - accounts.largest_transaction might change if this was the max
# - accounts.smallest_transaction might change if this was the min

# CASE 5: DELETE with NULL values
# DELETE FROM transactions WHERE transaction_id = 1;
#
# Result:
# - All automations recalculate excluding the deleted record
# - NULL values in deleted record don't affect calculations

  nullable_edge_cases:
    columns:
      test_id:
        $ref: id

      # AVG with NULLs
      average_score:
        type: numeric
        size: 8
        decimal: 2
        automation:
          type: AVG
          table: test_scores
          foreign_key: test_fk
          column: score
        # AVG ignores NULLs, returns NULL if all values are NULL

  test_scores:
    foreign_keys:
      test_fk:
        table: nullable_edge_cases

    columns:
      score_id:
        $ref: id

      test_fk:
        type: integer
        required: true

      # Score can be NULL for incomplete tests
      score:
        type: integer
        required: false

# GenLogic NULL handling principles:
#
# 1. Aggregate functions (SUM, COUNT, MAX, MIN, AVG) follow SQL standards:
#    - They ignore NULL values in calculations
#    - COUNT(*) counts all rows, COUNT(column) counts non-NULL values
#    - SUM returns 0 for empty set, MAX/MIN/AVG return NULL for empty set
#
# 2. LATEST automation:
#    - Returns the actual value from the most recent record
#    - Can return NULL if the most recent record has NULL in that column
#
# 3. Incremental updates handle NULL transitions:
#    - NULL -> value: adds to SUM automation, increments COUNT automation
#    - value -> NULL: subtracts from SUM automation, decrements COUNT automation
#    - value -> value: adjusts SUM automation by difference
#    - NULL -> NULL: no change
#
# 4. DELETE operations:
#    - Remove the record's contribution (if any) from calculations
#    - NULL values in deleted records don't affect final results
#
# 5. Validation considerations:
#    - Automation target columns should allow NULL if source can be empty
#    - Required columns for automation targets need default values
```

---

Previous: [Financial Tracking](../complex/financial-tracking.md) | Next: [Circular References](../edge-cases/circular-references.md)
