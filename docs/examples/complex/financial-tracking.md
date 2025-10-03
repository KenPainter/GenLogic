Previous: [E-commerce System](e-commerce-system.md) | Next: [NULL Handling](../edge-cases/null-handling.md)

# Financial Tracking System Example

## Overview

A comprehensive personal finance system with multi-currency accounts, categorized transactions, budget tracking, and recurring transaction management. Demonstrates extensive use of MAX, MIN, LATEST, SUM, COUNT, and AVG automations to provide real-time financial insights without complex queries.

**Prerequisites:** Before studying this complex example, familiarize yourself with:
- [../basic/minimal-schema.md](../basic/minimal-schema.md) - Basic schema structure
- [../automations/sum-automation.md](../automations/sum-automation.md) - SUM automation for balances
- [../automations/max-min-automation.md](../automations/max-min-automation.md) - MAX/MIN automation
- [../automations/latest-automation.md](../automations/latest-automation.md) - LATEST automation

## Key Concepts

- Multi-Currency Support: Different accounts in different currencies
- Real-Time Balances: Automated account balance calculation from transactions
- Category Analytics: Spending patterns with automatic totals and averages
- Budget Management: Track spending against budgets with automated percent calculations
- Transaction Analysis: Largest, smallest, and latest transactions tracked automatically
- Recurring Transactions: Manage subscriptions and regular payments

## YAML Configuration

```yaml
# Financial Tracking System Example
# Demonstrates accounts, transactions, budgets, and financial reporting
# Shows currency handling, categorization, and complex financial automations

columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  name:
    type: varchar
    size: 100

  money:
    type: numeric
    size: 15
    decimal: 2

  percentage:
    type: numeric
    size: 5
    decimal: 2

  currency_code:
    type: varchar
    size: 3
    # USD, EUR, GBP, etc.

tables:
  currencies:
    columns:
      currency_code:
        $ref: currency_code
        primary_key: true

      currency_name:
        $ref: name

      symbol:
        type: varchar
        size: 5
        # $, €, £, ¥, etc.

  account_types:
    columns:
      type_id:
        $ref: id

      type_name:
        $ref: name
        # checking, savings, credit_card, investment, etc.

      is_liability:
        type: boolean
        # true for credit cards, loans

  accounts:
    foreign_keys:
      type_fk:
        table: account_types
      currency_fk:
        table: currencies

    columns:
      account_id:
        $ref: id

      account_name:
        $ref: name

      type_fk:
        type: integer
        required: true

      currency_fk:
        $ref: currency_code
        required: true

      # Automation: sum of all transactions
      current_balance:
        $ref: money
        automation:
          type: SUM
          table: transactions
          foreign_key: account_fk
          column: amount

      # Automation: count transactions
      transaction_count:
        type: integer
        automation:
          type: COUNT
          table: transactions
          foreign_key: account_fk
          column: transaction_id

      # Automation: largest single transaction
      largest_transaction:
        $ref: money
        automation:
          type: MAX
          table: transactions
          foreign_key: account_fk
          column: amount

      # Automation: smallest single transaction
      smallest_transaction:
        $ref: money
        automation:
          type: MIN
          table: transactions
          foreign_key: account_fk
          column: amount

      # Automation: date of last transaction
      last_transaction_date:
        type: date
        automation:
          type: LATEST
          table: transactions
          foreign_key: account_fk
          column: transaction_date

      opened_at:
        type: date

  transaction_categories:
    foreign_keys:
      parent_fk:
        table: transaction_categories

    columns:
      category_id:
        $ref: id

      category_name:
        $ref: name
        # Food, Transportation, Utilities, etc.

      parent_fk:
        type: integer
        required: false

      is_income:
        type: boolean
        # true for salary, investment returns, etc.

      # Automation: total spent in this category
      total_amount:
        $ref: money
        automation:
          type: SUM
          table: transactions
          foreign_key: category_fk
          column: amount

      # Automation: count transactions in category
      transaction_count:
        type: integer
        automation:
          type: COUNT
          table: transactions
          foreign_key: category_fk
          column: transaction_id

      # Automation: average transaction amount
      avg_amount:
        $ref: money
        automation:
          type: AVG
          table: transactions
          foreign_key: category_fk
          column: amount

  transactions:
    foreign_keys:
      account_fk:
        table: accounts
      category_fk:
        table: transaction_categories
      transfer_account_fk:
        table: accounts  # For transfers between accounts

    columns:
      transaction_id:
        $ref: id

      account_fk:
        type: integer
        required: true

      category_fk:
        type: integer
        required: false

      # For transfers, this points to the destination account
      transfer_account_fk:
        type: integer
        required: false

      amount:
        $ref: money
        # Positive for income/deposits, negative for expenses

      description:
        type: varchar
        size: 200

      transaction_date:
        type: date

      # For tracking check numbers, reference numbers, etc.
      reference_number:
        type: varchar
        size: 50

      is_cleared:
        type: boolean
        # Whether transaction has cleared the bank

      created_at:
        type: timestamp

  budgets:
    foreign_keys:
      category_fk:
        table: transaction_categories

    columns:
      budget_id:
        $ref: id

      budget_name:
        $ref: name

      category_fk:
        type: integer
        required: true

      budget_amount:
        $ref: money

      budget_period:
        type: varchar
        size: 20
        # monthly, quarterly, yearly

      start_date:
        type: date

      end_date:
        type: date

      # Automation: actual spending in budget period
      spent_amount:
        $ref: money
        automation:
          type: SUM
          table: transactions
          foreign_key: category_fk
          column: amount
          # Would need date range conditions in real implementation

      # Automation: percentage of budget used
      percent_used:
        $ref: percentage
        # Calculated as (spent_amount / budget_amount) * 100

  recurring_transactions:
    foreign_keys:
      account_fk:
        table: accounts
      category_fk:
        table: transaction_categories

    columns:
      recurring_id:
        $ref: id

      account_fk:
        type: integer
        required: true

      category_fk:
        type: integer
        required: false

      amount:
        $ref: money

      description:
        type: varchar
        size: 200

      frequency:
        type: varchar
        size: 20
        # daily, weekly, monthly, yearly

      next_due_date:
        type: date

      is_active:
        type: boolean

      # Automation: count of transactions generated
      execution_count:
        type: integer
        automation:
          type: COUNT
          table: transactions
          foreign_key: recurring_fk
          column: transaction_id

  # Link transactions back to their recurring template
  recurring_fk:
    # This would be added to transactions table
    type: integer
    required: false
    # References recurring_transactions.recurring_id

# Financial reporting automation:
#
# 1. Real-time account balances:
#    - Every transaction automatically updates account.current_balance
#    - No need for complex balance calculation queries
#
# 2. Category spending analysis:
#    - categories.total_amount shows lifetime spending
#    - categories.avg_amount shows spending patterns
#    - categories.transaction_count shows frequency
#
# 3. Budget tracking:
#    - budgets.spent_amount updates with each transaction
#    - budgets.percent_used shows budget utilization
#    - Easy to identify over-budget categories
#
# 4. Account analysis:
#    - largest/smallest_transaction for outlier detection
#    - last_transaction_date for account activity monitoring
#    - transaction_count for account usage patterns
#
# 5. Multi-currency support:
#    - Each account has its own currency
#    - Transactions store amounts in account currency
#    - Cross-currency transfers would need exchange rate handling
#
# This system provides real-time financial insights without complex reporting queries
```

## Generated SQL (Core Tables)

```sql
CREATE TABLE accounts (
    account_id SERIAL PRIMARY KEY,
    account_name VARCHAR(100),
    type_fk INTEGER REFERENCES account_types(type_id),
    currency_fk VARCHAR(3) REFERENCES currencies(currency_code),
    current_balance NUMERIC(15,2) DEFAULT 0,
    transaction_count INTEGER DEFAULT 0,
    largest_transaction NUMERIC(15,2),
    smallest_transaction NUMERIC(15,2),
    last_transaction_date DATE,
    opened_at DATE
);

CREATE TABLE transactions (
    transaction_id SERIAL PRIMARY KEY,
    account_fk INTEGER REFERENCES accounts(account_id),
    category_fk INTEGER REFERENCES transaction_categories(category_id),
    transfer_account_fk INTEGER REFERENCES accounts(account_id),
    amount NUMERIC(15,2),
    description VARCHAR(200),
    transaction_date DATE,
    reference_number VARCHAR(50),
    is_cleared BOOLEAN,
    created_at TIMESTAMP
);

CREATE TABLE transaction_categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(100),
    parent_fk INTEGER REFERENCES transaction_categories(category_id),
    is_income BOOLEAN,
    total_amount NUMERIC(15,2) DEFAULT 0,
    transaction_count INTEGER DEFAULT 0,
    avg_amount NUMERIC(15,2) DEFAULT 0
);

-- Automation triggers maintain all financial metrics
```

## Usage Examples

```sql
-- Setup currencies and account types
INSERT INTO currencies (currency_code, currency_name, symbol)
VALUES ('USD', 'US Dollar', '$'), ('EUR', 'Euro', '€');

INSERT INTO account_types (type_name, is_liability)
VALUES ('checking', false), ('savings', false), ('credit_card', true);

-- Create accounts
INSERT INTO accounts (account_name, type_fk, currency_fk, opened_at)
VALUES ('Main Checking', 1, 'USD', '2024-01-01'),
       ('Emergency Fund', 2, 'USD', '2024-01-01'),
       ('Travel Card', 3, 'EUR', '2024-01-01');

-- Create transaction categories
INSERT INTO transaction_categories (category_name, is_income)
VALUES ('Salary', true),
       ('Food', false),
       ('Transportation', false),
       ('Entertainment', false);

-- Record salary deposit
INSERT INTO transactions (account_fk, category_fk, amount, description, transaction_date, is_cleared)
VALUES (1, 1, 5000.00, 'Monthly salary', '2024-01-01', true);
-- Automatically: accounts.current_balance = 5000.00
-- Automatically: accounts.transaction_count = 1
-- Automatically: accounts.largest_transaction = 5000.00
-- Automatically: accounts.smallest_transaction = 5000.00
-- Automatically: accounts.last_transaction_date = '2024-01-01'
-- Automatically: categories.total_amount = 5000.00 for Salary
-- Automatically: categories.transaction_count = 1 for Salary

-- Record expenses
INSERT INTO transactions (account_fk, category_fk, amount, description, transaction_date, is_cleared)
VALUES (1, 2, -150.50, 'Groceries', '2024-01-05', true),
       (1, 3, -45.00, 'Gas', '2024-01-06', true),
       (1, 4, -75.00, 'Movie tickets', '2024-01-10', true);
-- Automatically: accounts.current_balance = 4729.50 (5000 - 150.50 - 45 - 75)
-- Automatically: accounts.transaction_count = 4
-- Automatically: accounts.smallest_transaction = -150.50
-- Automatically: accounts.last_transaction_date = '2024-01-10'
-- Automatically: Each category's totals update

-- Transfer between accounts
INSERT INTO transactions (account_fk, transfer_account_fk, amount, description, transaction_date, is_cleared)
VALUES (1, 2, -1000.00, 'Transfer to savings', '2024-01-15', true),
       (2, NULL, 1000.00, 'Transfer from checking', '2024-01-15', true);
-- Automatically: Account 1 balance -= 1000
-- Automatically: Account 2 balance += 1000

-- Setup budgets
INSERT INTO budgets (budget_name, category_fk, budget_amount, budget_period, start_date, end_date)
VALUES ('Monthly Food Budget', 2, 600.00, 'monthly', '2024-01-01', '2024-01-31'),
       ('Monthly Transport', 3, 200.00, 'monthly', '2024-01-01', '2024-01-31');
-- Automatically: budgets.spent_amount updates with each transaction
-- Automatically: budgets.percent_used calculated

-- Setup recurring transactions
INSERT INTO recurring_transactions (account_fk, category_fk, amount, description, frequency, next_due_date, is_active)
VALUES (1, 2, -15.99, 'Netflix subscription', 'monthly', '2024-02-01', true),
       (1, 3, -120.00, 'Car insurance', 'monthly', '2024-02-01', true);

-- Financial Reports (instant, no aggregation needed)
-- Account summary
SELECT account_name, current_balance, transaction_count,
       largest_transaction, smallest_transaction, last_transaction_date
FROM accounts
WHERE type_fk != 3  -- Exclude credit cards
ORDER BY current_balance DESC;

-- Category spending analysis
SELECT category_name, total_amount, transaction_count, avg_amount
FROM transaction_categories
WHERE is_income = false
ORDER BY total_amount ASC;  -- Most spent first (negative amounts)

-- Budget status
SELECT b.budget_name, c.category_name, b.budget_amount, b.spent_amount,
       b.percent_used,
       CASE
         WHEN b.percent_used > 100 THEN 'OVER BUDGET'
         WHEN b.percent_used > 80 THEN 'WARNING'
         ELSE 'ON TRACK'
       END as status
FROM budgets b
JOIN transaction_categories c ON b.category_fk = c.category_id
ORDER BY b.percent_used DESC;

-- Net worth calculation
SELECT SUM(CASE WHEN at.is_liability THEN -a.current_balance
                ELSE a.current_balance END) as net_worth
FROM accounts a
JOIN account_types at ON a.type_fk = at.type_id
WHERE a.currency_fk = 'USD';

-- Cash flow by month
SELECT DATE_TRUNC('month', transaction_date) as month,
       SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as income,
       SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) as expenses,
       SUM(amount) as net_cash_flow
FROM transactions
GROUP BY month
ORDER BY month DESC;
```

---

Previous: [E-commerce System](e-commerce-system.md) | Next: [NULL Handling](../edge-cases/null-handling.md)
