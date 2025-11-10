# 2B2: SNAPSHOT on FK UPDATE

Tests that child SNAPSHOT columns re-capture values when the foreign key is changed to point to a different parent.
This is the same behavior as SYNC for FK changes.

## Build Schema

```yaml
tables:
  exchange_rates:
    columns:
      currency_id: serial primary key
      currency_code: varchar(3)
      rate_to_usd: numeric(10,6)
      effective_date: date

  transactions:
    columns:
      transaction_id: serial primary key
      currency_id: FK exchange_rates
      amount_local: numeric(12,2)
      transaction_date: date

      # SNAPSHOT: Captures exchange rate at time of transaction
      exchange_rate_at_transaction:
        definition: numeric(10,6)
        automation: SNAPSHOT exchange_rates.rate_to_usd

      currency_code_at_transaction:
        definition: varchar(3)
        automation: SNAPSHOT exchange_rates.currency_code
```

## Insert Parent Rows

```sql
INSERT INTO exchange_rates (currency_code, rate_to_usd, effective_date)
VALUES
  ('EUR', 1.085000, '2025-01-01'),
  ('GBP', 1.275000, '2025-01-01'),
  ('JPY', 0.006800, '2025-01-01');
```

## Verify Parent Data

```sql
SELECT currency_code, rate_to_usd, effective_date
FROM exchange_rates
ORDER BY currency_id;
```

```json
[
  {
    "currency_code": "EUR",
    "rate_to_usd": "1.085000",
    "effective_date": "2025-01-01T00:00:00.000Z"
  },
  {
    "currency_code": "GBP",
    "rate_to_usd": "1.275000",
    "effective_date": "2025-01-01T00:00:00.000Z"
  },
  {
    "currency_code": "JPY",
    "rate_to_usd": "0.006800",
    "effective_date": "2025-01-01T00:00:00.000Z"
  }
]
```

## Insert Child Row

```sql
INSERT INTO transactions (currency_id, amount_local, transaction_date)
VALUES ((SELECT currency_id FROM exchange_rates WHERE currency_code = 'EUR'), 1000.00, '2025-01-15');
```

## Verify Initial SNAPSHOT Values

```sql
SELECT amount_local, currency_code_at_transaction, exchange_rate_at_transaction
FROM transactions;
```

```json
[
  {
    "amount_local": "1000.00",
    "currency_code_at_transaction": "EUR",
    "exchange_rate_at_transaction": "1.085000"
  }
]
```

## Update FK to Point to Different Parent (Currency Change)

Simulate a correction: transaction was actually in GBP, not EUR.

```sql
UPDATE transactions
SET currency_id = (SELECT currency_id FROM exchange_rates WHERE currency_code = 'GBP');
```

## Verify SNAPSHOT Re-Captured from New Parent

SNAPSHOT should re-capture values from the new parent (GBP).

```sql
SELECT amount_local, currency_code_at_transaction, exchange_rate_at_transaction
FROM transactions;
```

```json
[
  {
    "amount_local": "1000.00",
    "currency_code_at_transaction": "GBP",
    "exchange_rate_at_transaction": "1.275000"
  }
]
```

## Change FK Again

```sql
UPDATE transactions
SET currency_id = (SELECT currency_id FROM exchange_rates WHERE currency_code = 'JPY'),
    amount_local = 150000.00;
```

## Verify SNAPSHOT Re-Captured Again

```sql
SELECT amount_local, currency_code_at_transaction, exchange_rate_at_transaction
FROM transactions;
```

```json
[
  {
    "amount_local": "150000.00",
    "currency_code_at_transaction": "JPY",
    "exchange_rate_at_transaction": "0.006800"
  }
]
```
