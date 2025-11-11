# SNAPSHOT Automation

SNAPSHOT columns capture values from a parent table at a specific point in time. Unlike SYNC, SNAPSHOT values remain frozen and do not update when the parent changes.

## Basic SNAPSHOT

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      list_price: numeric(10,2)

  orders:
    columns:
      order_id: serial primary key
      product_id: FK products
      quantity: integer
      order_date: date

      # SNAPSHOT: Captures price at time of order
      price_at_order:
        definition: numeric(10,2)
        automation: SNAPSHOT products.list_price

      product_name_at_order:
        definition: varchar(100)
        automation: SNAPSHOT products.product_name
```

When an order is inserted, `price_at_order` and `product_name_at_order` capture the current values from the product.

```sql
INSERT INTO orders (product_id, quantity, order_date)
VALUES (100, 5, '2025-01-15');
```

The order records the price and name as they were on January 15, 2025.

## SNAPSHOT vs SYNC on Parent Update

When the parent value changes, SNAPSHOT remains frozen while SYNC updates.

```yaml
tables:
  price_list:
    columns:
      item_id: serial primary key
      item_name: varchar(100)
      current_price: numeric(10,2)

  invoices:
    columns:
      invoice_id: serial primary key
      item_id: FK price_list
      quantity: integer

      # SNAPSHOT: Frozen at time of invoice
      price_at_invoice:
        definition: numeric(10,2)
        automation: SNAPSHOT price_list.current_price

      # SYNC: Always reflects current price (for comparison)
      current_market_price:
        definition: numeric(10,2)
        automation: SYNC price_list.current_price
```

Insert an invoice when price is 100.00:
```sql
INSERT INTO invoices (item_id, quantity)
VALUES (100, 10);
-- Results in: price_at_invoice = 100.00, current_market_price = 100.00
```

Update the parent price to 125.00:
```sql
UPDATE price_list
SET current_price = 125.00
WHERE item_id = 100;
```

The invoice now shows:
- `price_at_invoice = 100.00` (frozen at original value)
- `current_market_price = 125.00` (updated to reflect parent)

## SNAPSHOT on FK Update

When the foreign key changes, SNAPSHOT captures from the new parent.

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      list_price: numeric(10,2)

  orders:
    columns:
      order_id: serial primary key
      product_id: FK products

      price_at_order:
        definition: numeric(10,2)
        automation: SNAPSHOT products.list_price
```

Change the FK to point to a different product:
```sql
UPDATE orders
SET product_id = 200;
```

The `price_at_order` updates to capture the price from product 200.

## Use Cases

SNAPSHOT is used for historical records:
- Invoice line items (price at time of sale)
- Order history (product details at time of order)
- Contract terms (rates at time of agreement)
- Audit trails (values at time of transaction)

SYNC is used for current references:
- Current pricing
- Live status information
- Active configuration values
