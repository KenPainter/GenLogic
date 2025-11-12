Previous: [SYNC Parent to Child](sync-automation.md) | Next: [Aggregations to Parent](aggregations.md)

# Formula Columns

Formula columns calculate their value from other columns in the same row using SQL expressions.

## Basic Arithmetic Formulas

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      unit_cost: numeric(10,2)
      markup_percent: numeric(5,2)
      tax_rate: numeric(5,4)

      # Formula: Calculate selling price from cost + markup
      selling_price:
        definition: numeric(10,2)
        formula: "unit_cost * (1 + markup_percent / 100)"

      # Formula: Calculate tax amount
      tax_amount:
        definition: numeric(10,2)
        formula: "selling_price * tax_rate"

      # Formula: Calculate final price
      final_price:
        definition: numeric(10,2)
        formula: "selling_price + tax_amount"
```

Insert a product:
```sql
INSERT INTO products (product_name, unit_cost, markup_percent, tax_rate)
VALUES ('Widget A', 100.00, 25.00, 0.0825);
```

Results in:
- `selling_price = 125.00`
- `tax_amount = 10.31`
- `final_price = 135.31`

## Formula Dependencies

Formulas can reference other formula columns. GenLogic calculates them in dependency order.

```yaml
tables:
  orders:
    columns:
      order_id: serial primary key
      base_price: numeric(10,2)
      discount_percent: numeric(5,2)
      tax_rate: numeric(5,4)

      # Layer 1: Depends on base columns
      discounted_price:
        definition: numeric(10,2)
        formula: "base_price * (1 - discount_percent / 100)"

      # Layer 2: Depends on discounted_price
      tax_amount:
        definition: numeric(10,2)
        formula: "discounted_price * tax_rate"

      # Layer 3: Depends on both prior formulas
      total:
        definition: numeric(10,2)
        formula: "discounted_price + tax_amount"
```

GenLogic computes:
1. `discounted_price` first
2. `tax_amount` second (uses discounted_price)
3. `total` third (uses both)

## String Formulas

```yaml
tables:
  users:
    columns:
      user_id: serial primary key
      first_name: varchar(50)
      last_name: varchar(50)

      # String concatenation
      full_name:
        definition: varchar(100)
        formula: "first_name || ' ' || last_name"
```

## Formulas on INSERT

Formulas calculate automatically on INSERT:

```sql
INSERT INTO products (product_name, unit_cost, markup_percent, tax_rate)
VALUES ('Widget B', 50.00, 50.00, 0.0825);
```

All formula columns compute without specifying values.

## Formulas on UPDATE

When a source column updates, formulas recalculate:

```sql
UPDATE products
SET markup_percent = 30.00
WHERE product_id = 100;
```

The `selling_price`, `tax_amount`, and `final_price` formulas recalculate using the new markup.

## Formulas with SYNC

Formulas can depend on SYNC columns:

```yaml
tables:
  tax_rates:
    columns:
      jurisdiction_id: serial primary key
      sales_tax_rate: numeric(5,4)

  invoices:
    columns:
      invoice_id: serial primary key
      jurisdiction_id: FK(tax_rates)
      subtotal: numeric(10,2)

      # SYNC pulls from parent
      tax_rate:
        definition: numeric(5,4)
        automation: SYNC tax_rates.sales_tax_rate

      # Formula uses SYNC'd value
      tax_amount:
        definition: numeric(10,2)
        formula: "subtotal * tax_rate"

      total:
        definition: numeric(10,2)
        formula: "subtotal + tax_amount"
```

When the parent tax rate changes, the child SYNC column updates, triggering formula recalculation.

## Limitations

- Formulas reference columns in the same row only
- Cannot reference other tables directly (use SYNC first)
- Cannot use subqueries
- Use PostgreSQL SQL expression syntax

---

Previous: [SYNC Parent to Child](sync-automation.md) | Next: [Aggregations to Parent](aggregations.md)
