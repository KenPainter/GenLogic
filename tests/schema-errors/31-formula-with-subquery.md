# Test: Formula with subquery

Tests that the processor rejects formulas containing SELECT statements/subqueries.

Formulas are designed for same-row calculations only. Use SYNC automation to pull values from parent tables instead.

## Expected Errors

```json
[
  {
    "location": "products.calculated_price",
    "message": "Formula columns cannot contain subqueries. Use SYNC automation to pull values from parent tables"
  }
]
```

## Input Schema

```yaml
tables:
  categories:
    columns:
      category_id: serial primary key
      category_name: varchar(50)
      bonus_amount: numeric(10,2)

  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      base_price: numeric(10,2)
      category_id: FK categories

      # Formula with subquery - should be rejected
      calculated_price:
        definition: numeric(10,2)
        formula: "(SELECT bonus_amount FROM categories WHERE category_id = category_id)"
```
