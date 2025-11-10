# 2B3: SNAPSHOT Does NOT Update When Parent Changes

Tests the key difference between SNAPSHOT and SYNC: SNAPSHOT values remain frozen when parent values change.
This test verifies that no push-to-children trigger fires for SNAPSHOT columns.

## Build Schema

```yaml
tables:
  price_list:
    columns:
      item_id: serial primary key
      item_name: varchar(100)
      current_price: numeric(10,2)
      last_updated: date

  invoices:
    columns:
      invoice_id: serial primary key
      item_id: FK price_list
      quantity: integer
      invoice_date: date

      # SNAPSHOT: Frozen at time of invoice
      price_at_invoice:
        definition: numeric(10,2)
        automation: SNAPSHOT price_list.current_price

      # SYNC: Always reflects current price (for comparison)
      current_market_price:
        definition: numeric(10,2)
        automation: SYNC price_list.current_price
```

## Insert Parent Rows

```sql
INSERT INTO price_list (item_name, current_price, last_updated)
VALUES
  ('Premium Widget', 100.00, '2025-01-01'),
  ('Standard Widget', 50.00, '2025-01-01');
```

## Verify Parent Data

```sql
SELECT item_name, current_price, last_updated
FROM price_list
ORDER BY item_id;
```

```json
[
  {
    "item_name": "Premium Widget",
    "current_price": "100.00",
    "last_updated": "2025-01-01T00:00:00.000Z"
  },
  {
    "item_name": "Standard Widget",
    "current_price": "50.00",
    "last_updated": "2025-01-01T00:00:00.000Z"
  }
]
```

## Insert Child Rows

```sql
INSERT INTO invoices (item_id, quantity, invoice_date)
VALUES
  ((SELECT item_id FROM price_list WHERE item_name = 'Premium Widget'), 10, '2025-01-15'),
  ((SELECT item_id FROM price_list WHERE item_name = 'Premium Widget'), 5, '2025-01-16'),
  ((SELECT item_id FROM price_list WHERE item_name = 'Standard Widget'), 20, '2025-01-17');
```

## Verify Initial Values (SNAPSHOT and SYNC Both Match)

```sql
SELECT quantity, invoice_date, price_at_invoice, current_market_price
FROM invoices
ORDER BY invoice_id;
```

```json
[
  {
    "quantity": 10,
    "invoice_date": "2025-01-15T00:00:00.000Z",
    "price_at_invoice": "100.00",
    "current_market_price": "100.00"
  },
  {
    "quantity": 5,
    "invoice_date": "2025-01-16T00:00:00.000Z",
    "price_at_invoice": "100.00",
    "current_market_price": "100.00"
  },
  {
    "quantity": 20,
    "invoice_date": "2025-01-17T00:00:00.000Z",
    "price_at_invoice": "50.00",
    "current_market_price": "50.00"
  }
]
```

## Update Parent Price (Premium Widget Price Increases)

```sql
UPDATE price_list
SET current_price = 125.00,
    last_updated = '2025-02-01'
WHERE item_name = 'Premium Widget';
```

## Verify Parent Change

```sql
SELECT item_name, current_price, last_updated
FROM price_list
ORDER BY item_id;
```

```json
[
  {
    "item_name": "Premium Widget",
    "current_price": "125.00",
    "last_updated": "2025-02-01T00:00:00.000Z"
  },
  {
    "item_name": "Standard Widget",
    "current_price": "50.00",
    "last_updated": "2025-01-01T00:00:00.000Z"
  }
]
```

## Verify SNAPSHOT Unchanged but SYNC Updated

SNAPSHOT values remain frozen at original invoice prices.
SYNC values update to reflect new parent prices.

```sql
SELECT quantity, invoice_date, price_at_invoice, current_market_price
FROM invoices
ORDER BY invoice_id;
```

```json
[
  {
    "quantity": 10,
    "invoice_date": "2025-01-15T00:00:00.000Z",
    "price_at_invoice": "100.00",
    "current_market_price": "125.00"
  },
  {
    "quantity": 5,
    "invoice_date": "2025-01-16T00:00:00.000Z",
    "price_at_invoice": "100.00",
    "current_market_price": "125.00"
  },
  {
    "quantity": 20,
    "invoice_date": "2025-01-17T00:00:00.000Z",
    "price_at_invoice": "50.00",
    "current_market_price": "50.00"
  }
]
```

## Update Standard Widget Price

```sql
UPDATE price_list
SET current_price = 55.00,
    last_updated = '2025-02-01'
WHERE item_name = 'Standard Widget';
```

## Verify All Invoices: SNAPSHOT Frozen, SYNC Updated

```sql
SELECT quantity, invoice_date, price_at_invoice, current_market_price
FROM invoices
ORDER BY invoice_id;
```

```json
[
  {
    "quantity": 10,
    "invoice_date": "2025-01-15T00:00:00.000Z",
    "price_at_invoice": "100.00",
    "current_market_price": "125.00"
  },
  {
    "quantity": 5,
    "invoice_date": "2025-01-16T00:00:00.000Z",
    "price_at_invoice": "100.00",
    "current_market_price": "125.00"
  },
  {
    "quantity": 20,
    "invoice_date": "2025-01-17T00:00:00.000Z",
    "price_at_invoice": "50.00",
    "current_market_price": "55.00"
  }
]
```
