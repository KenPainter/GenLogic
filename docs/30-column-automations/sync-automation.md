# SYNC Automation

SYNC columns automatically pull values from a parent table through a foreign key relationship. The value stays synchronized with the parent - when the parent changes, all children update.

## Basic SYNC

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      base_price: numeric(10,2)
      tax_rate: numeric(5,4)

  orders:
    columns:
      order_id: serial primary key
      product_id: FK products
      quantity: integer

      # SYNC: Always reflects current parent value
      product_name:
        definition: varchar(100)
        automation: SYNC products.product_name

      current_price:
        definition: numeric(10,2)
        automation: SYNC products.base_price
```

When an order is inserted, `product_name` and `current_price` are pulled from the parent product.

```sql
INSERT INTO orders (product_id, quantity)
VALUES (100, 5);
```

The order now contains the product_name and current_price from product 100.

## SYNC on FK Update

When the foreign key changes to point to a different parent, SYNC columns update to the new parent's values.

```yaml
tables:
  suppliers:
    columns:
      supplier_id: serial primary key
      supplier_name: varchar(100)
      contact_email: varchar(100)

  purchase_orders:
    columns:
      po_id: serial primary key
      supplier_id: FK suppliers

      supplier_name:
        definition: varchar(100)
        automation: SYNC suppliers.supplier_name

      contact_email:
        definition: varchar(100)
        automation: SYNC suppliers.contact_email
```

Change the FK:
```sql
UPDATE purchase_orders
SET supplier_id = 200;
```

The SYNC columns now reflect values from supplier 200.

## SYNC on Parent Update

When the parent table's value changes, all children automatically update.

```yaml
tables:
  tax_rates:
    columns:
      jurisdiction_id: serial primary key
      jurisdiction_name: varchar(100)
      sales_tax_rate: numeric(5,4)

  invoices:
    columns:
      invoice_id: serial primary key
      jurisdiction_id: FK tax_rates
      subtotal: numeric(10,2)

      # SYNC: Updates when parent tax rate changes
      tax_rate:
        definition: numeric(5,4)
        automation: SYNC tax_rates.sales_tax_rate
```

Update the parent:
```sql
UPDATE tax_rates
SET sales_tax_rate = 0.0800
WHERE jurisdiction_id = 100;
```

All invoices with `jurisdiction_id = 100` now have `tax_rate = 0.0800`.

## SYNC with Formulas

Formula columns can depend on SYNC columns. When SYNC columns update, formulas recalculate.

```yaml
tables:
  tax_rates:
    columns:
      jurisdiction_id: serial primary key
      sales_tax_rate: numeric(5,4)

  invoices:
    columns:
      invoice_id: serial primary key
      jurisdiction_id: FK tax_rates
      subtotal: numeric(10,2)

      tax_rate:
        definition: numeric(5,4)
        automation: SYNC tax_rates.sales_tax_rate

      # Formula depends on SYNC'd value
      tax_amount:
        definition: numeric(10,2)
        formula: "subtotal * tax_rate"

      total:
        definition: numeric(10,2)
        formula: "subtotal + tax_amount"
```

When the parent tax rate changes, the child's `tax_rate` SYNC column updates, triggering recalculation of `tax_amount` and `total`.
