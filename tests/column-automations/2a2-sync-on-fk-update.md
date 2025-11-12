# 2A2: SYNC on FK UPDATE

Tests that child SYNC columns update when the foreign key is changed to point to a different parent.

## Build Schema

```yaml
tables:
  suppliers:
    columns:
      supplier_id: serial primary key
      supplier_name: varchar(100)
      contact_email: varchar(100)
      credit_terms: varchar(50)

  purchase_orders:
    columns:
      po_id: serial primary key
      supplier_id: FK(suppliers)
      order_date: date

      # SYNC: Should update when FK(changes)
      supplier_name:
        definition: varchar(100)
        automation: SYNC suppliers.supplier_name

      contact_email:
        definition: varchar(100)
        automation: SYNC suppliers.contact_email

      credit_terms:
        definition: varchar(50)
        automation: SYNC suppliers.credit_terms
```

## Insert Parent Rows

```sql
INSERT INTO suppliers (supplier_name, contact_email, credit_terms)
VALUES
  ('Acme Corp', 'orders@acme.com', 'Net 30'),
  ('Beta Industries', 'sales@beta.com', 'Net 60'),
  ('Gamma LLC', 'info@gamma.com', 'COD');
```

## Verify Parent Data

```sql
SELECT supplier_name, contact_email, credit_terms
FROM suppliers
ORDER BY supplier_id;
```

```json
[
  {
    "supplier_name": "Acme Corp",
    "contact_email": "orders@acme.com",
    "credit_terms": "Net 30"
  },
  {
    "supplier_name": "Beta Industries",
    "contact_email": "sales@beta.com",
    "credit_terms": "Net 60"
  },
  {
    "supplier_name": "Gamma LLC",
    "contact_email": "info@gamma.com",
    "credit_terms": "COD"
  }
]
```

## Insert Child Row

Insert PO referencing first supplier (Acme Corp).

```sql
INSERT INTO purchase_orders (supplier_id, order_date)
VALUES ((SELECT supplier_id FROM suppliers WHERE supplier_name = 'Acme Corp'), '2025-01-01');
```

## Verify Initial SYNC Values

```sql
SELECT supplier_name, contact_email, credit_terms
FROM purchase_orders;
```

```json
[
  {
    "supplier_name": "Acme Corp",
    "contact_email": "orders@acme.com",
    "credit_terms": "Net 30"
  }
]
```

## Update FK(to) Point to Different Parent

```sql
UPDATE purchase_orders
SET supplier_id = (SELECT supplier_id FROM suppliers WHERE supplier_name = 'Beta Industries');
```

## Verify SYNC Values Updated to New Parent

Child SYNC columns should now reflect values from Beta Industries.

```sql
SELECT supplier_name, contact_email, credit_terms
FROM purchase_orders;
```

```json
[
  {
    "supplier_name": "Beta Industries",
    "contact_email": "sales@beta.com",
    "credit_terms": "Net 60"
  }
]
```

## Change FK Again

```sql
UPDATE purchase_orders
SET supplier_id = (SELECT supplier_id FROM suppliers WHERE supplier_name = 'Gamma LLC');
```

## Verify SYNC Values Updated Again

```sql
SELECT supplier_name, contact_email, credit_terms
FROM purchase_orders;
```

```json
[
  {
    "supplier_name": "Gamma LLC",
    "contact_email": "info@gamma.com",
    "credit_terms": "COD"
  }
]
```
