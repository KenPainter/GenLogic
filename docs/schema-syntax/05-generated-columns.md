Previous: [Moving Values from Parent to Child](04-parent-to-child.md) | Next: [Moving Values from Child to Parent](06-child-to-parent.md)

# Calculating Values Within a Row

Columns can automatically compute their values from other columns in the same row.

## Basic Structure

```yaml
tables:
  table_name:
    columns:
      source_column1: *any valid PostgreSQL type*
      source_column2: *any valid PostgreSQL type*
      calculated_column:
        type: *result type*
        generated: *any valid PostgreSQL expression*
```

## Simple Example

```yaml
tables:
  orders:
    columns:
      price: numeric(10,2)
      quantity: integer
      total:
        type: numeric(10,2)
        generated: price * quantity
```

## What Happens

Triggers on the table evaluate generated expressions before INSERT or UPDATE. The result is stored in the generated column.

In the example above, when inserting `(price: 10.50, quantity: 3)`, the total is automatically set to 31.50.

## Expression Types

### Arithmetic

```yaml
generated: price * quantity
generated: (amount - discount) * 1.1
generated: subtotal + tax
```

### String Operations

```yaml
generated: first_name || ' ' || last_name
generated: UPPER(email)
generated: SUBSTRING(code, 1, 5)
```

### CASE Expressions

```yaml
status:
  type: varchar(20)
  generated: case when amount > 0 then 'positive' when amount < 0 then 'negative' else 'zero' end
```

### NULL Handling

```yaml
generated: COALESCE(value1, 0) + COALESCE(value2, 0)
```

### Date Operations

```yaml
generated: CURRENT_DATE
generated: start_date + INTERVAL '30 days'
generated: EXTRACT(YEAR FROM order_date)
```

## Dependent Generated Columns

Generated columns can reference other generated columns. GenLogic automatically determines the correct evaluation order:

```yaml
tables:
  invoices:
    columns:
      unit_price: numeric(10,2)
      quantity: integer

      # Generated first
      subtotal:
        type: numeric(10,2)
        generated: unit_price * quantity

      # Generated second (uses subtotal)
      tax:
        type: numeric(10,2)
        generated: subtotal * 0.1

      # Generated third (uses subtotal and tax)
      total:
        type: numeric(10,2)
        generated: subtotal + tax
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
        generated: col_b + 1  # Depends on col_b

      col_b:
        type: integer
        generated: col_a + 1  # Depends on col_a - CYCLE!
```

## Restrictions

### Cannot Use with Automation

A column cannot have both generated and automation properties:

```yaml
# INVALID
balance:
  type: numeric(10,2)
  generated: credits - debits  # Can't have both
  automation:
    type: SUM
    table: transactions
    foreign_key: account_fk
    column: amount
```

### Expression Scope

Generated columns can only reference:
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
      first_name: varchar(50)
      last_name: varchar(50)
      hourly_rate: numeric(10,2)
      hours_worked: numeric(10,2)

      # Concatenate name
      full_name:
        type: varchar(101)
        generated: "first_name || ' ' || last_name"

      # Calculate gross pay
      gross_pay:
        type: numeric(10,2)
        generated: "hourly_rate * hours_worked"

      # Calculate tax
      tax_amount:
        type: numeric(10,2)
        generated: "gross_pay * 0.15"

      # Calculate net pay
      net_pay:
        type: numeric(10,2)
        generated: "gross_pay - tax_amount"
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
