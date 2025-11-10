# 3C2: MAX and MIN on DELETE

Tests that MAX and MIN aggregations recalculate correctly when child rows are deleted.
This is the most complex case - deleting the row with MAX or MIN value requires full recalculation.

## Build Schema

```yaml
tables:
  stocks:
    columns:
      stock_id: serial primary key
      ticker_symbol: varchar(10)

      # MAX: Highest price in history
      highest_price:
        definition: numeric(10,2)
        automation: MAX price_history.price

      # MIN: Lowest price in history
      lowest_price:
        definition: numeric(10,2)
        automation: MIN price_history.price

  price_history:
    columns:
      history_id: serial primary key
      stock_id: FK stocks
      trade_date: date
      price: numeric(10,2)
```

## Insert Parent Rows

```sql
INSERT INTO stocks (ticker_symbol)
VALUES ('ACME'), ('TECH');
```

## Insert Price History for ACME

```sql
INSERT INTO price_history (stock_id, trade_date, price)
VALUES
  ((SELECT stock_id FROM stocks WHERE ticker_symbol = 'ACME'), '2025-01-01', 100.00),
  ((SELECT stock_id FROM stocks WHERE ticker_symbol = 'ACME'), '2025-01-02', 105.50),
  ((SELECT stock_id FROM stocks WHERE ticker_symbol = 'ACME'), '2025-01-03', 95.25),
  ((SELECT stock_id FROM stocks WHERE ticker_symbol = 'ACME'), '2025-01-04', 110.75),
  ((SELECT stock_id FROM stocks WHERE ticker_symbol = 'ACME'), '2025-01-05', 98.00);
```

## Verify Initial MAX/MIN

```sql
SELECT ticker_symbol, highest_price, lowest_price
FROM stocks
WHERE ticker_symbol = 'ACME';
```

```json
[
  {
    "ticker_symbol": "ACME",
    "highest_price": "110.75",
    "lowest_price": "95.25"
  }
]
```

## Delete Row with Highest Price

```sql
DELETE FROM price_history
WHERE stock_id = (SELECT stock_id FROM stocks WHERE ticker_symbol = 'ACME')
  AND price = 110.75;
```

## Verify MAX Recalculated

```sql
SELECT ticker_symbol, highest_price, lowest_price
FROM stocks
WHERE ticker_symbol = 'ACME';
```

```json
[
  {
    "ticker_symbol": "ACME",
    "highest_price": "105.50",
    "lowest_price": "95.25"
  }
]
```

## Delete Row with Lowest Price

```sql
DELETE FROM price_history
WHERE stock_id = (SELECT stock_id FROM stocks WHERE ticker_symbol = 'ACME')
  AND price = 95.25;
```

## Verify MIN Recalculated

```sql
SELECT ticker_symbol, highest_price, lowest_price
FROM stocks
WHERE ticker_symbol = 'ACME';
```

```json
[
  {
    "ticker_symbol": "ACME",
    "highest_price": "105.50",
    "lowest_price": "98.00"
  }
]
```

## Delete Multiple Rows

```sql
DELETE FROM price_history
WHERE stock_id = (SELECT stock_id FROM stocks WHERE ticker_symbol = 'ACME')
  AND trade_date IN ('2025-01-02', '2025-01-05');
```

## Verify Both MAX and MIN Updated

```sql
SELECT ticker_symbol, highest_price, lowest_price
FROM stocks
WHERE ticker_symbol = 'ACME';
```

```json
[
  {
    "ticker_symbol": "ACME",
    "highest_price": "100.00",
    "lowest_price": "100.00"
  }
]
```

## Insert Price History for TECH

```sql
INSERT INTO price_history (stock_id, trade_date, price)
VALUES
  ((SELECT stock_id FROM stocks WHERE ticker_symbol = 'TECH'), '2025-01-01', 50.00),
  ((SELECT stock_id FROM stocks WHERE ticker_symbol = 'TECH'), '2025-01-02', 45.00),
  ((SELECT stock_id FROM stocks WHERE ticker_symbol = 'TECH'), '2025-01-03', 60.00),
  ((SELECT stock_id FROM stocks WHERE ticker_symbol = 'TECH'), '2025-01-04', 55.00);
```

## Verify TECH MAX/MIN

```sql
SELECT ticker_symbol, highest_price, lowest_price
FROM stocks
WHERE ticker_symbol = 'TECH';
```

```json
[
  {
    "ticker_symbol": "TECH",
    "highest_price": "60.00",
    "lowest_price": "45.00"
  }
]
```

## Delete All But One Row from TECH

```sql
DELETE FROM price_history
WHERE stock_id = (SELECT stock_id FROM stocks WHERE ticker_symbol = 'TECH')
  AND trade_date != '2025-01-04';
```

## Verify TECH MAX and MIN Equal

```sql
SELECT ticker_symbol, highest_price, lowest_price
FROM stocks
WHERE ticker_symbol = 'TECH';
```

```json
[
  {
    "ticker_symbol": "TECH",
    "highest_price": "55.00",
    "lowest_price": "55.00"
  }
]
```

## Delete Last Row from TECH

```sql
DELETE FROM price_history
WHERE stock_id = (SELECT stock_id FROM stocks WHERE ticker_symbol = 'TECH');
```

## Verify TECH MAX and MIN are NULL

```sql
SELECT ticker_symbol, highest_price, lowest_price
FROM stocks
WHERE ticker_symbol = 'TECH';
```

```json
[
  {
    "ticker_symbol": "TECH",
    "highest_price": null,
    "lowest_price": null
  }
]
```

## Verify Final State

```sql
SELECT ticker_symbol, highest_price, lowest_price
FROM stocks
ORDER BY stock_id;
```

```json
[
  {
    "ticker_symbol": "ACME",
    "highest_price": "100.00",
    "lowest_price": "100.00"
  },
  {
    "ticker_symbol": "TECH",
    "highest_price": null,
    "lowest_price": null
  }
]
```
