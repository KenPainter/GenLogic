Previous: [Moving Values from Parent to Child](10-parent-to-child.md) | Next: [Moving Values from Child to Parent](30-child-to-parent.md)

# Calculating Values Within a Row

Columns can automatically compute their values from other columns in the same row.

The GenLogic "formula" feature is similar to Postgres GENERATED ALWAYS AS but
GenLogic allows formula columns to refer to other formula columns.

## Simple Example

```yaml
tables:
  orders:
    columns:
      price: numeric(10,2)
      quantity: integer
      total:
        definition: numeric(10,2)
        formula: "@price * @quantity"
```

## YAML Limitation

If the first character of the formula is "@", as in "@price * @qty", then
the expression must be quoted.  This is because the @ sigil is meaningful
for YAML when it is the first character of a value.

## What Happens

Triggers on the table evaluate formula expressions before INSERT or UPDATE. The result is stored in the formula column.

In the example above, when inserting `(price: 10.50, quantity: 3)`, the total is automatically set to 31.50.

## Expression Types

### Arithmetic

```yaml
formula: "@price * @quantity"
formula: "(@amount - @discount) * 1.1"
formula: "@subtotal + @tax"
```

### String Operations

```yaml
formula: "@first_name || ' ' || @last_name"
formula: "UPPER(@email)"
formula: "SUBSTRING(@code, 1, 5)"
```

### CASE Expressions

```yaml
status:
  definition: varchar(20)
  formula: "case when @amount > 0 then 'positive' when @amount < 0 then 'negative' else 'zero' end"
```

### NULL Handling

```yaml
formula: "COALESCE(@value1, 0) + COALESCE(@value2, 0)"
```

### Date Operations

```yaml
formula: "CURRENT_DATE"
formula: "@start_date + INTERVAL '30 days'"
formula: "EXTRACT(YEAR FROM @order_date)"
```

## Dependent Generated Columns

Formula columns can reference other formula columns. GenLogic automatically determines the correct evaluation order:

```yaml
tables:
  invoices:
    columns:
      unit_price: numeric(10,2)
      quantity: integer

      # Formula first
      subtotal:
        definition: numeric(10,2)
        formula: "@unit_price * @quantity"

      # Formula second (uses subtotal)
      tax:
        definition: numeric(10,2)
        formula: "@subtotal * 0.1"

      # Formula third (uses subtotal and tax)
      total:
        definition: numeric(10,2)
        formula: "@subtotal + @tax"
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
        formula: "@col_b + 1"  # Depends on col_b

      col_b:
        definition: integer
        formula: "@col_a + 1"  # Depends on col_a - CYCLE!
```

## Restrictions

### Cannot Use with Automation

A column cannot have both generated and automation properties:

```yaml
# INVALID
balance:
  definition: numeric(10,2)
  formula: "@credits - @debits"  # Can't have both
  automation: SUM @transactions.amount
```

### Expression Scope

Formula columns can only reference:
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
        formula: "@first_name || ' ' || @last_name"

      # Calculate gross pay
      gross_pay:
        definition: numeric(10,2)
        formula: "@hourly_rate * @hours_worked"

      # Calculate tax
      tax_amount:
        definition: numeric(10,2)
        formula: "@gross_pay * 0.15"

      # Calculate net pay
      net_pay:
        definition: numeric(10,2)
        formula: "@gross_pay - @tax_amount"
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

This section lists tests that verify formula column features work correctly.

### Validation (Runtime)

These tests verify that GenLogic catches invalid formula column definitions:

- [x] [No @ references](../../tests/04-validation/formula-column-no-at-reference) - Error when formula column has no @ references
- [x] [Non-existent column reference](../../tests/04-validation/formula-column-nonexistent-ref) - Error when @column doesn't exist
- [x] [Bare column reference](../../tests/04-validation/formula-column-bare-reference) - Error when column referenced without @ sigil
- [x] [Circular dependency](../../tests/04-validation/formula-column-circular) - Error when formula columns form cycle
- [x] [No type specified](../../tests/04-validation/formula-column-no-type) - Error when formula column has no type or $ref
- [x] [Index on formula column](../../tests/04-validation/index-on-generated-column) - Indexes on formula columns are valid (should pass)

### Schema Features (Isolated Tests)

These tests verify that GenLogic generates correct formula column DDL and triggers:

- [x] [Formula columns](../../tests/05-schema-features/calculated-columns) - Formula columns with @ reference expressions
- [x] [Arithmetic expression](../../tests/05-schema-features/formula-arithmetic) - Formula column with arithmetic (@a * @b)
- [x] [String concatenation](../../tests/05-schema-features/formula-string-concat) - Formula column with string ops (@first || ' ' || @last)
- [x] [CASE expression](../../tests/05-schema-features/formula-case) - Formula column with CASE WHEN
- [x] [NULL handling](../../tests/05-schema-features/formula-null-handling) - Formula column with COALESCE
- [x] [Dependent formula columns](../../tests/05-schema-features/formula-dependent) - Formula column referencing another formula column
- [x] [Function call](../../tests/05-schema-features/formula-function-call) - Formula column with function (UPPER(@name))

### Behavior (End-to-End Tests)

These tests verify formula column behavior with actual data:

- [x] [CASE WHEN expressions](../../tests/06-behavior/calculated-columns-case) - Conditional logic in formula columns
- [x] [Dependent formula columns](../../tests/06-behavior/calculated-columns-dependent) - Formula column referencing another formula column
- [x] [NULL handling](../../tests/06-behavior/calculated-columns-null) - COALESCE for NULL safety
- [x] [String operations](../../tests/06-behavior/calculated-columns-string) - String concatenation
- [x] [UPDATE triggers recalculation](../../tests/06-behavior/calculated-columns-update) - Formula columns recalculate on UPDATE

---

Previous: [Moving Values from Parent to Child](10-parent-to-child.md) | Next: [Moving Values from Child to Parent](30-child-to-parent.md)
