# 7B2: Reusable Columns with Extensions

Tests reusable column definitions with property extensions.
Covers: base + additional properties, default values, constraints, automation.

## Build Schema

```yaml
columns:
  id-column:
    definition: serial primary key

  amount-column:
    definition: numeric(10,2)

  status-column:
    definition: varchar(50)

  timestamp-column:
    definition: timestamp

tables:
  accounts:
    columns:
      account_id: id-column
      account_name: varchar(100)

      # Reusable with default extension
      balance:
        base: amount-column
        definition: default 0.00

      # Reusable base (constraint at table level)
      credit_limit:
        base: amount-column

    constraints:
      - credit_limit >= 0

  transactions:
    columns:
      transaction_id: id-column
      account_id: FK accounts

      # Reusable with default extension
      amount:
        base: amount-column
        definition: default 0.00

      # Reusable with default
      status:
        base: status-column
        definition: default pending

      # Reusable with default extension
      created_at:
        base: timestamp-column
        definition: default CURRENT_TIMESTAMP

      updated_at:
        base: timestamp-column

    constraints:
      - status IN ('pending', 'completed', 'cancelled')
```

## Insert Account with Default Balance

```sql
INSERT INTO accounts (account_name)
VALUES ('Checking Account');
```

## Verify Default Applied

```sql
SELECT account_id, account_name, balance, credit_limit
FROM accounts;
```

```json
[
  {
    "account_id": 100,
    "account_name": "Checking Account",
    "balance": "0.00",
    "credit_limit": null
  }
]
```

## Insert Account with Explicit Values

```sql
INSERT INTO accounts (account_name, balance, credit_limit)
VALUES ('Savings Account', 1000.00, 5000.00);
```

## Verify Explicit Values Override Defaults

```sql
SELECT account_id, account_name, balance, credit_limit
FROM accounts
ORDER BY account_id;
```

```json
[
  {
    "account_id": 100,
    "account_name": "Checking Account",
    "balance": "0.00",
    "credit_limit": null
  },
  {
    "account_id": 101,
    "account_name": "Savings Account",
    "balance": "1000.00",
    "credit_limit": "5000.00"
  }
]
```

## Insert Transaction with Defaults

```sql
INSERT INTO transactions (account_id, amount)
VALUES (100, 50.00);
```

## Verify Transaction Defaults Applied

```sql
SELECT transaction_id, account_id, amount, status, created_at IS NOT NULL as has_created_at
FROM transactions;
```

```json
[
  {
    "transaction_id": 100,
    "account_id": 100,
    "amount": "50.00",
    "status": "pending",
    "has_created_at": true
  }
]
```

## Update Transaction Status

```sql
UPDATE transactions
SET status = 'completed', updated_at = CURRENT_TIMESTAMP
WHERE transaction_id = 100;
```

## Verify Status Updated

```sql
SELECT transaction_id, status, updated_at IS NOT NULL as has_updated_at
FROM transactions
WHERE transaction_id = 100;
```

```json
[
  {
    "transaction_id": 100,
    "status": "completed",
    "has_updated_at": true
  }
]
```

## Insert Multiple Transactions

```sql
INSERT INTO transactions (account_id, amount, status)
VALUES
  (101, 200.00, 'completed'),
  (101, 75.50, 'pending'),
  (100, 30.00, 'cancelled');
```

## Verify All Transactions

```sql
SELECT transaction_id, account_id, amount, status
FROM transactions
ORDER BY transaction_id;
```

```json
[
  {
    "transaction_id": 100,
    "account_id": 100,
    "amount": "50.00",
    "status": "completed"
  },
  {
    "transaction_id": 101,
    "account_id": 101,
    "amount": "200.00",
    "status": "completed"
  },
  {
    "transaction_id": 102,
    "account_id": 101,
    "amount": "75.50",
    "status": "pending"
  },
  {
    "transaction_id": 103,
    "account_id": 100,
    "amount": "30.00",
    "status": "cancelled"
  }
]
```

## Verify Type Consistency Across Extended Reusables

```sql
SELECT
  a.balance,
  a.credit_limit,
  t.amount
FROM accounts a
JOIN transactions t ON a.account_id = t.account_id
WHERE a.account_id = 100
LIMIT 1;
```

```json
[
  {
    "balance": "0.00",
    "credit_limit": null,
    "amount": "50.00"
  }
]
```
