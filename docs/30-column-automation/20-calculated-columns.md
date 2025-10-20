Previous: [Moving Values from Parent to Child](10-parent-to-child.md) | Next: [Moving Values from Child to Parent](30-child-to-parent.md)

# Calculating Values Within a Row

Columns can automatically compute their values from other columns in the same row.

GenLogic uses the 'generated' keyword from Postgres but GenLogic does not
implement these using the Postgres generated column mechanism because
that mechanism does not allow generated columns to refer to other generated
columsn.  The GenLogic system is more powerful, and is implemented in
triggers.

## Basic Structure

```yaml
tables:
  table_name:
    columns:
      source_column1: *any valid PostgreSQL type*
      source_column2: *any valid PostgreSQL type*
      calculated_column:
        definition: *result type*
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
        definition: numeric(10,2)
        generated: "@price * @quantity"
```

## What Happens

Triggers on the table evaluate generated expressions before INSERT or UPDATE. The result is stored in the generated column.

In the example above, when inserting `(price: 10.50, quantity: 3)`, the total is automatically set to 31.50.

## Expression Types

### Arithmetic

```yaml
generated: "@price * @quantity"
generated: "(@amount - @discount) * 1.1"
generated: "@subtotal + @tax"
```

### String Operations

```yaml
generated: "@first_name || ' ' || @last_name"
generated: "UPPER(@email)"
generated: "SUBSTRING(@code, 1, 5)"
```

### CASE Expressions

```yaml
status:
  definition: varchar(20)
  generated: "case when @amount > 0 then 'positive' when @amount < 0 then 'negative' else 'zero' end"
```

### NULL Handling

```yaml
generated: "COALESCE(@value1, 0) + COALESCE(@value2, 0)"
```

### Date Operations

```yaml
generated: "CURRENT_DATE"
generated: "@start_date + INTERVAL '30 days'"
generated: "EXTRACT(YEAR FROM @order_date)"
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
        definition: numeric(10,2)
        generated: "@unit_price * @quantity"

      # Generated second (uses subtotal)
      tax:
        definition: numeric(10,2)
        generated: "@subtotal * 0.1"

      # Generated third (uses subtotal and tax)
      total:
        definition: numeric(10,2)
        generated: "@subtotal + @tax"
```

## Circular Dependencies

Circular dependencies are not allowed and will cause validation errors:

```yaml
# INVALID - will be rejected
tables:
  invalid_table:
    columns:
      col_a:
        definition: integer
        generated: "@col_b + 1"  # Depends on col_b

      col_b:
        definition: integer
        generated: "@col_a + 1"  # Depends on col_a - CYCLE!
```

## Restrictions

### Cannot Use with Automation

A column cannot have both generated and automation properties:

```yaml
# INVALID
balance:
  definition: numeric(10,2)
  generated: "@credits - @debits"  # Can't have both
  automation: SUM @transactions.amount
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
        definition: varchar(101)
        generated: "@first_name || ' ' || @last_name"

      # Calculate gross pay
      gross_pay:
        definition: numeric(10,2)
        generated: "@hourly_rate * @hours_worked"

      # Calculate tax
      tax_amount:
        definition: numeric(10,2)
        generated: "@gross_pay * 0.15"

      # Calculate net pay
      net_pay:
        definition: numeric(10,2)
        generated: "@gross_pay - @tax_amount"
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

## Test Coverage

This section lists tests that verify generated column features work correctly.

### Validation (Runtime)

These tests verify that GenLogic catches invalid generated column definitions:

- [x] [No @ references](../../tests/04-validation/generated-column-no-at-reference) - Error when generated column has no @ references
- [x] [Non-existent column reference](../../tests/04-validation/generated-column-nonexistent-ref) - Error when @column doesn't exist
- [x] [Bare column reference](../../tests/04-validation/generated-column-bare-reference) - Error when column referenced without @ sigil
- [x] [Circular dependency](../../tests/04-validation/generated-column-circular) - Error when generated columns form cycle
- [x] [No type specified](../../tests/04-validation/generated-column-no-type) - Error when generated column has no type or $ref
- [x] [Index on generated column](../../tests/04-validation/index-on-generated-column) - Indexes on generated columns are valid (should pass)

### Schema Features (Isolated Tests)

These tests verify that GenLogic generates correct generated column DDL and triggers:

- [x] [Generated columns](../../tests/05-schema-features/calculated-columns) - Generated columns with @ reference expressions
- [x] [Arithmetic expression](../../tests/05-schema-features/generated-arithmetic) - Generated column with arithmetic (@a * @b)
- [x] [String concatenation](../../tests/05-schema-features/generated-string-concat) - Generated column with string ops (@first || ' ' || @last)
- [x] [CASE expression](../../tests/05-schema-features/generated-case) - Generated column with CASE WHEN
- [x] [NULL handling](../../tests/05-schema-features/generated-null-handling) - Generated column with COALESCE
- [x] [Dependent generated columns](../../tests/05-schema-features/generated-dependent) - Generated column referencing another generated column
- [x] [Function call](../../tests/05-schema-features/generated-function-call) - Generated column with function (UPPER(@name))

### Behavior (End-to-End Tests)

These tests verify generated column behavior with actual data:

- [x] [CASE WHEN expressions](../../tests/06-behavior/calculated-columns-case) - Conditional logic in generated columns
- [x] [Dependent generated columns](../../tests/06-behavior/calculated-columns-dependent) - Generated column referencing another generated column
- [x] [NULL handling](../../tests/06-behavior/calculated-columns-null) - COALESCE for NULL safety
- [x] [String operations](../../tests/06-behavior/calculated-columns-string) - String concatenation
- [x] [UPDATE triggers recalculation](../../tests/06-behavior/calculated-columns-update) - Generated columns recalculate on UPDATE

---

Previous: [Moving Values from Parent to Child](10-parent-to-child.md) | Next: [Moving Values from Child to Parent](30-child-to-parent.md)
