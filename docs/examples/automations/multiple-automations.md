Previous: [LATEST Automation](../automations/latest-automation.md) | Next: [Blog Platform](../complex/blog-platform.md)

# Multiple Automations Example

Demonstrates multiple instances of automation on the same foreign key relationship. GenLogic consolidates these into a single efficient trigger per foreign key path.

```yaml
# Multiple Automations Example
# Demonstrates multiple instances of automation on the same foreign key relationship
# GenLogic consolidates these into a single efficient trigger per foreign key path

columns:
  amount:
    type: numeric
    size: 10
    decimal: 2

  transaction_date:
    type: date

  transaction_type:
    type: varchar
    size: 20

tables:
  accounts:
    columns:
      account_id:
        type: integer
        sequence: true
        primary_key: true

      account_name:
        type: varchar
        size: 100

      # Multiple automations all referencing the same FK relationship
      total_balance:
        $ref: amount
        automation:
          type: SUM
          table: transactions
          foreign_key: account_fk
          column: amount

      transaction_count:
        type: integer
        automation:
          type: COUNT
          table: transactions
          foreign_key: account_fk
          column: amount

      largest_transaction:
        $ref: amount
        automation:
          type: MAX
          table: transactions
          foreign_key: account_fk
          column: amount

      smallest_transaction:
        $ref: amount
        automation:
          type: MIN
          table: transactions
          foreign_key: account_fk
          column: amount

      latest_transaction_date:
        $ref: transaction_date
        automation:
          type: LATEST
          table: transactions
          foreign_key: account_fk
          column: transaction_date

      latest_transaction_type:
        $ref: transaction_type
        automation:
          type: LATEST
          table: transactions
          foreign_key: account_fk
          column: transaction_type

  transactions:
    foreign_keys:
      account_fk:
        table: accounts

    columns:
      transaction_id:
        type: integer
        sequence: true
        primary_key: true

      amount: null
      transaction_date: null
      transaction_type: null

      description:
        type: varchar
        size: 200

# Efficiency Benefits:
# Instead of creating 6 separate triggers, GenLogic creates ONE consolidated trigger:
# - transactions_update_accounts_aggregations_genlogic()
#
# This single trigger handles all instances of automation efficiently:
# 1. On INSERT/UPDATE/DELETE of transactions
# 2. Calculates all 6 instances of automation in one pass
# 3. Updates all 6 columns in accounts table with one UPDATE statement
# 4. Uses OLD/NEW values for incremental calculations where possible
#
# Example: INSERT INTO transactions (account_fk, amount, transaction_date, transaction_type)
#          VALUES (1, 150.00, '2024-01-15', 'deposit')
#
# Single trigger execution:
# - total_balance += 150.00 (incremental SUM automation)
# - transaction_count += 1 (incremental COUNT automation)
# - largest_transaction = MAX(current_max, 150.00) (incremental MAX automation)
# - smallest_transaction = MIN(current_min, 150.00) (incremental MIN automation)
# - latest_transaction_date = '2024-01-15' (LATEST automation always uses new value)
# - latest_transaction_type = 'deposit' (LATEST automation always uses new value)
#
# Result: 6 instances of automation calculated with the performance cost of 1 trigger
```

---

Previous: [LATEST Automation](../automations/latest-automation.md) | Next: [Blog Platform](../complex/blog-platform.md)
