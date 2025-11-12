# 3A5: Multiple SUM Aggregations on Same Parent

Tests that a parent can have multiple SUM aggregations from the same child table.
This tests the batching optimization where multiple aggregations are updated in a single UPDATE statement.

## Build Schema

```yaml
tables:
  invoices:
    columns:
      invoice_id: serial primary key
      customer_name: varchar(100)

      # Multiple SUMs from same child table
      subtotal:
        definition: numeric(10,2)
        automation: SUM line_items.item_subtotal

      tax_total:
        definition: numeric(10,2)
        automation: SUM line_items.item_tax

      total:
        definition: numeric(10,2)
        formula: "subtotal + tax_total"

  line_items:
    columns:
      line_id: serial primary key
      invoice_id: FK(invoices)
      product_name: varchar(100)
      quantity: integer
      unit_price: numeric(10,2)
      tax_rate: numeric(5,4)

      # Formulas for line item calculations
      item_subtotal:
        definition: numeric(10,2)
        formula: "quantity * unit_price"

      item_tax:
        definition: numeric(10,2)
        formula: "quantity * unit_price * tax_rate"
```

## Insert Parent Row

```sql
INSERT INTO invoices (customer_name)
VALUES ('Tech Corp');
```

## Verify Initial State (All Zeros)

```sql
SELECT customer_name, subtotal, tax_total, total
FROM invoices;
```

```json
[
  {
    "customer_name": "Tech Corp",
    "subtotal": "0.00",
    "tax_total": "0.00",
    "total": "0.00"
  }
]
```

## Insert First Line Item

```sql
INSERT INTO line_items (invoice_id, product_name, quantity, unit_price, tax_rate)
VALUES ((SELECT invoice_id FROM invoices WHERE customer_name = 'Tech Corp'), 'Laptop', 2, 1000.00, 0.0825);
```

## Verify Both Aggregations Updated

```sql
SELECT customer_name, subtotal, tax_total, total
FROM invoices;
```

```json
[
  {
    "customer_name": "Tech Corp",
    "subtotal": "2000.00",
    "tax_total": "165.00",
    "total": "2165.00"
  }
]
```

## Insert More Line Items

```sql
INSERT INTO line_items (invoice_id, product_name, quantity, unit_price, tax_rate)
VALUES
  ((SELECT invoice_id FROM invoices WHERE customer_name = 'Tech Corp'), 'Mouse', 5, 25.00, 0.0825),
  ((SELECT invoice_id FROM invoices WHERE customer_name = 'Tech Corp'), 'Keyboard', 3, 75.00, 0.0825);
```

## Verify All Aggregations Updated

```sql
SELECT customer_name, subtotal, tax_total, total
FROM invoices;
```

```json
[
  {
    "customer_name": "Tech Corp",
    "subtotal": "2350.00",
    "tax_total": "193.87",
    "total": "2543.87"
  }
]
```

## Update Line Item Quantity

```sql
UPDATE line_items
SET quantity = 10
WHERE product_name = 'Mouse';
```

## Verify Aggregations Reflect Update

```sql
SELECT customer_name, subtotal, tax_total, total
FROM invoices;
```

```json
[
  {
    "customer_name": "Tech Corp",
    "subtotal": "2475.00",
    "tax_total": "204.19",
    "total": "2679.19"
  }
]
```

## Delete Line Item

```sql
DELETE FROM line_items
WHERE product_name = 'Keyboard';
```

## Verify Aggregations Reflect Deletion

```sql
SELECT customer_name, subtotal, tax_total, total
FROM invoices;
```

```json
[
  {
    "customer_name": "Tech Corp",
    "subtotal": "2250.00",
    "tax_total": "185.63",
    "total": "2435.63"
  }
]
```

## Verify Line Item Details

```sql
SELECT product_name, quantity, unit_price, tax_rate, item_subtotal, item_tax
FROM line_items
ORDER BY line_id;
```

```json
[
  {
    "product_name": "Laptop",
    "quantity": 2,
    "unit_price": "1000.00",
    "tax_rate": "0.0825",
    "item_subtotal": "2000.00",
    "item_tax": "165.00"
  },
  {
    "product_name": "Mouse",
    "quantity": 10,
    "unit_price": "25.00",
    "tax_rate": "0.0825",
    "item_subtotal": "250.00",
    "item_tax": "20.63"
  }
]
```
