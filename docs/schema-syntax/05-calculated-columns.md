Previous: [Moving Values from Parent to Child](04-parent-to-child.md) | Next: [Moving Values from Child to Parent](06-child-to-parent.md)

# Calculating Values Within a Row

Columns can automatically compute their values from other columns in the same row.

## Basic Structure

```yaml
tables:
  table_name:
    columns:
      source_column1: { type: data_type }
      source_column2: { type: data_type }
      calculated_column:
        type: data_type
        calculated: "expression using source_column1, source_column2"
```

## Simple Example

```yaml
tables:
  orders:
    columns:
      price: { type: numeric, size: 10, decimal: 2 }
      quantity: { type: integer }
      total:
        type: numeric
        size: 10
        decimal: 2
        calculated: price * quantity
```

## What Happens

Triggers on the table evaluate calculated expressions before INSERT or UPDATE. The result is stored in the calculated column.

In the example above, when inserting `(price: 10.50, quantity: 3)`, the total is automatically set to 31.50.

## Expression Types

### Arithmetic

```yaml
calculated: price * quantity
calculated: (amount - discount) * 1.1
calculated: subtotal + tax
```

### String Operations

```yaml
calculated: first_name || ' ' || last_name
calculated: UPPER(email)
calculated: SUBSTRING(code, 1, 5)
```

### CASE Expressions

```yaml
status:
  type: varchar
  size: 20
  calculated: case when amount > 0 then 'positive' when amount < 0 then 'negative' else 'zero' end
```

### NULL Handling

```yaml
calculated: COALESCE(value1, 0) + COALESCE(value2, 0)
```

### Date Operations

```yaml
calculated: CURRENT_DATE
calculated: start_date + INTERVAL '30 days'
calculated: EXTRACT(YEAR FROM order_date)
```

## Dependent Calculated Columns

Calculated columns can reference other calculated columns. GenLogic automatically determines the correct evaluation order:

```yaml
tables:
  invoices:
    columns:
      unit_price: { type: numeric, size: 10, decimal: 2 }
      quantity: { type: integer }

      # Calculated first
      subtotal:
        type: numeric
        size: 10
        decimal: 2
        calculated: unit_price * quantity

      # Calculated second (uses subtotal)
      tax:
        type: numeric
        size: 10
        decimal: 2
        calculated: subtotal * 0.1

      # Calculated third (uses subtotal and tax)
      total:
        type: numeric
        size: 10
        decimal: 2
        calculated: subtotal + tax
```

## Circular Dependencies

Circular dependencies are not allowed and will cause validation errors:

```yaml
# INVALID - will be rejected
tables:
  invalid_table:
    columns:
      col_a:
        type: integer
        calculated: col_b + 1  # Depends on col_b

      col_b:
        type: integer
        calculated: col_a + 1  # Depends on col_a - CYCLE!
```

## Restrictions

### Cannot Use with Automation

A column cannot have both calculated and automation properties:

```yaml
# INVALID
balance:
  type: numeric
  size: 10
  decimal: 2
  calculated: credits - debits  # Can't have both
  automation:
    type: SUM
    table: transactions
    foreign_key: account_fk
    column: amount
```

### Expression Scope

Calculated columns can only reference:
- Other columns in the same table
- PostgreSQL functions
- Literals

They cannot reference:
- Columns in other tables (use automation for that)
- Subqueries (use automation for that)

## Complete Example

```yaml
tables:
  employees:
    columns:
      first_name: { type: varchar, size: 50 }
      last_name: { type: varchar, size: 50 }
      hourly_rate: { type: numeric, size: 10, decimal: 2 }
      hours_worked: { type: numeric, size: 10, decimal: 2 }

      # Concatenate name
      full_name:
        type: varchar
        size: 101
        calculated: "first_name || ' ' || last_name"

      # Calculate gross pay
      gross_pay:
        type: numeric
        size: 10
        decimal: 2
        calculated: "hourly_rate * hours_worked"

      # Calculate tax
      tax_amount:
        type: numeric
        size: 10
        decimal: 2
        calculated: "gross_pay * 0.15"

      # Calculate net pay
      net_pay:
        type: numeric
        size: 10
        decimal: 2
        calculated: "gross_pay - tax_amount"
```

Usage:

```sql
INSERT INTO employees (first_name, last_name, hourly_rate, hours_worked)
VALUES ('John', 'Doe', 25.00, 40);

SELECT full_name, gross_pay, tax_amount, net_pay
FROM employees;
-- full_name | gross_pay | tax_amount | net_pay
-- ----------|-----------|------------|----------
-- John Doe  | 1000.00   | 150.00     | 850.00
```

---

Previous: [Moving Values from Parent to Child](04-parent-to-child.md) | Next: [Moving Values from Child to Parent](06-child-to-parent.md)
