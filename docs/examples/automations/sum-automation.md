# SUM Automation: Automatic Balance Calculation

## Overview

The SUM automation automatically calculates and maintains the sum of child values in parent records. This is perfect for maintaining account balances, inventory totals, order subtotals, and any scenario where you need to aggregate numeric values from related records.

## YAML Configuration

```yaml
# SUM Automation Example
# Automatically calculates the sum of child values in parent records

columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  amount:
    type: numeric
    size: 10
    decimal: 2

tables:
  accounts:
    columns:
      account_id:
        $ref: id

      account_name:
        type: varchar
        size: 100

      # This balance automatically maintains the SUM of all transaction amounts
      balance:
        $ref: amount
        automation:
          type: SUM
          table: transactions      # Source table (child)
          foreign_key: account_fk  # FK in source table that points back to this table
          column: amount           # Column in source table to sum

  transactions:
    foreign_keys:
      account_fk:
        table: accounts

    columns:
      transaction_id:
        $ref: id

      amount: null  # This gets summed into accounts.balance

      description:
        type: varchar
        size: 200

# How it works:
# 1. When you INSERT into transactions with account_fk=1, amount=100.00
#    → accounts.balance for account 1 increases by 100.00
# 2. When you UPDATE transactions SET amount=150.00 WHERE transaction_id=1
#    → accounts.balance adjusts by +50.00 (incremental: 150.00 - 100.00)
# 3. When you DELETE transaction with amount=100.00
#    → accounts.balance decreases by 100.00
#
# The automation uses efficient triggers with OLD/NEW values for O(1) performance
```

## Generated SQL Triggers and Functions

GenLogic generates the following SQL code for SUM automation:

```sql
-- Trigger function for maintaining SUM automation
CREATE OR REPLACE FUNCTION transactions_update_accounts_balance_genlogic()
RETURNS trigger AS $$
BEGIN
  -- Handle INSERT operation
  IF TG_OP = 'INSERT' THEN
    UPDATE accounts
    SET balance = COALESCE(balance, 0) + COALESCE(NEW.amount, 0)
    WHERE account_id = NEW.account_fk;
    RETURN NEW;
  END IF;

  -- Handle UPDATE operation
  IF TG_OP = 'UPDATE' THEN
    -- Only update if the amount or foreign key changed
    IF OLD.amount IS DISTINCT FROM NEW.amount OR OLD.account_fk IS DISTINCT FROM NEW.account_fk THEN
      -- Remove old value from old account
      IF OLD.account_fk IS NOT NULL THEN
        UPDATE accounts
        SET balance = COALESCE(balance, 0) - COALESCE(OLD.amount, 0)
        WHERE account_id = OLD.account_fk;
      END IF;

      -- Add new value to new account
      IF NEW.account_fk IS NOT NULL THEN
        UPDATE accounts
        SET balance = COALESCE(balance, 0) + COALESCE(NEW.amount, 0)
        WHERE account_id = NEW.account_fk;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Handle DELETE operation
  IF TG_OP = 'DELETE' THEN
    UPDATE accounts
    SET balance = COALESCE(balance, 0) - COALESCE(OLD.amount, 0)
    WHERE account_id = OLD.account_fk;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for all operations
CREATE TRIGGER transactions_sum_automation_insert
  AFTER INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION transactions_update_accounts_balance_genlogic();

CREATE TRIGGER transactions_sum_automation_update
  AFTER UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION transactions_update_accounts_balance_genlogic();

CREATE TRIGGER transactions_sum_automation_delete
  AFTER DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION transactions_update_accounts_balance_genlogic();
```

## Usage Examples

### Initial Setup
```sql
-- Create an account
INSERT INTO accounts (account_name, balance)
VALUES ('Checking Account', 0.00);
-- Result: account_id=1, balance=0.00
```

### INSERT Operations
```sql
-- Add first transaction
INSERT INTO transactions (account_fk, amount, description)
VALUES (1, 100.00, 'Initial deposit');
-- Result: accounts.balance for account 1 = 100.00

-- Add second transaction
INSERT INTO transactions (account_fk, amount, description)
VALUES (1, 50.00, 'ATM deposit');
-- Result: accounts.balance for account 1 = 150.00

-- Add negative transaction (withdrawal)
INSERT INTO transactions (account_fk, amount, description)
VALUES (1, -25.00, 'Coffee purchase');
-- Result: accounts.balance for account 1 = 125.00
```

### UPDATE Operations
```sql
-- Correct a transaction amount
UPDATE transactions
SET amount = 75.00
WHERE transaction_id = 2;
-- Old amount was 50.00, new is 75.00
-- Balance adjustment: +25.00 (75.00 - 50.00)
-- Result: accounts.balance for account 1 = 150.00

-- Move transaction to different account
UPDATE transactions
SET account_fk = 2
WHERE transaction_id = 1;
-- Removes 100.00 from account 1, adds 100.00 to account 2
-- Result: account 1 balance = 50.00, account 2 balance = 100.00
```

### DELETE Operations
```sql
-- Remove a transaction
DELETE FROM transactions WHERE transaction_id = 3;
-- Removes -25.00 from account balance
-- Result: accounts.balance increases by 25.00
```

## Automation Behavior

### Performance Characteristics
- **O(1) Performance**: Uses incremental calculations with OLD/NEW values
- **Single UPDATE**: Each transaction change triggers exactly one account update
- **Efficient Triggers**: No expensive aggregate queries during normal operations
- **ACID Compliance**: All updates happen within the same transaction

### Data Consistency
- **Automatic Maintenance**: Balance always reflects the sum of all related transactions
- **NULL Handling**: Treats NULL amounts as 0 in calculations
- **Foreign Key Changes**: Properly handles moving transactions between accounts
- **Rollback Safety**: Failed transactions don't affect balances

### Edge Cases
1. **NULL Values**: NULL amounts are treated as 0 in summation
2. **Concurrent Updates**: Row-level locking prevents race conditions
3. **Large Numbers**: Uses appropriate numeric precision to prevent overflow
4. **Account Deletion**: Foreign key constraints prevent orphaned transactions

## When to Use SUM Automation

### Perfect For:
- Account balances (banking, e-commerce)
- Inventory quantity tracking
- Order totals and subtotals
- Budget category spending
- Point/score accumulation
- Financial reporting aggregates

### Consider Alternatives When:
- You need complex mathematical operations beyond simple addition
- Aggregation logic depends on complex business rules
- You need weighted averages or other statistical measures
- The calculation involves multiple tables or complex joins

## Performance Considerations

### Advantages:
- **Real-time Updates**: Balances are always current
- **No Batch Processing**: Eliminates need for nightly calculation jobs
- **Scalable**: Performance doesn't degrade with transaction volume
- **Memory Efficient**: No need to load all transactions for balance calculation

### Monitoring:
- Watch for trigger execution time in high-volume scenarios
- Monitor lock contention on parent table during concurrent operations
- Consider partitioning strategies for very large transaction tables
- Use appropriate indexes on foreign key columns

## Data Integrity

The SUM automation maintains data consistency through:

1. **Atomic Operations**: All balance updates happen within the triggering transaction
2. **Constraint Enforcement**: Foreign key constraints prevent invalid references
3. **Error Handling**: Trigger failures roll back the entire transaction
4. **Audit Trail**: Transaction table maintains complete history of all changes

This automation eliminates the need for manual balance calculations and prevents the data inconsistencies that often occur with manually maintained aggregate values.