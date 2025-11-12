# 3A1: Basic SUM on INSERT

Tests that parent SUM aggregation columns update correctly when child rows are inserted.

## Build Schema

```yaml
tables:
  accounts:
    columns:
      account_id: serial primary key
      account_name: varchar(100)

      # SUM: Total of all transaction amounts
      balance:
        definition: numeric(10,2)
        automation: SUM transactions.amount

  transactions:
    columns:
      transaction_id: serial primary key
      account_id: FK(accounts)
      amount: numeric(10,2)
      description: varchar(200)
```

## Insert Parent Rows

```sql
INSERT INTO accounts (account_name)
VALUES ('Checking'), ('Savings');
```

## Verify Initial Balances (Should be 0)

```sql
SELECT account_name, balance
FROM accounts
ORDER BY account_id;
```

```json
[
  {
    "account_name": "Checking",
    "balance": "0.00"
  },
  {
    "account_name": "Savings",
    "balance": "0.00"
  }
]
```

## Insert First Transaction to Checking

```sql
INSERT INTO transactions (account_id, amount, description)
VALUES ((SELECT account_id FROM accounts WHERE account_name = 'Checking'), 100.00, 'Deposit');
```

## Verify Balance Updated

```sql
SELECT account_name, balance
FROM accounts
WHERE account_name = 'Checking';
```

```json
[
  {
    "account_name": "Checking",
    "balance": "100.00"
  }
]
```

## Insert Multiple Transactions to Checking

```sql
INSERT INTO transactions (account_id, amount, description)
VALUES
  ((SELECT account_id FROM accounts WHERE account_name = 'Checking'), 50.00, 'Deposit'),
  ((SELECT account_id FROM accounts WHERE account_name = 'Checking'), -25.00, 'Withdrawal'),
  ((SELECT account_id FROM accounts WHERE account_name = 'Checking'), -10.00, 'Fee');
```

## Verify Running Balance

```sql
SELECT account_name, balance
FROM accounts
WHERE account_name = 'Checking';
```

```json
[
  {
    "account_name": "Checking",
    "balance": "115.00"
  }
]
```

## Insert Transactions to Savings

```sql
INSERT INTO transactions (account_id, amount, description)
VALUES
  ((SELECT account_id FROM accounts WHERE account_name = 'Savings'), 500.00, 'Initial deposit'),
  ((SELECT account_id FROM accounts WHERE account_name = 'Savings'), 75.50, 'Interest');
```

## Verify Both Account Balances

```sql
SELECT account_name, balance
FROM accounts
ORDER BY account_id;
```

```json
[
  {
    "account_name": "Checking",
    "balance": "115.00"
  },
  {
    "account_name": "Savings",
    "balance": "575.50"
  }
]
```

## Verify Transaction Count

```sql
SELECT
  a.account_name,
  COUNT(t.transaction_id) as transaction_count,
  a.balance
FROM accounts a
LEFT JOIN transactions t ON t.account_id = a.account_id
GROUP BY a.account_id, a.account_name, a.balance
ORDER BY a.account_id;
```

```json
[
  {
    "account_name": "Checking",
    "transaction_count": "4",
    "balance": "115.00"
  },
  {
    "account_name": "Savings",
    "transaction_count": "2",
    "balance": "575.50"
  }
]
```
