# Intra-Table Column Dependency Chain via FK

This pattern demonstrates column dependencies within a single table where 
1. a formula calculates a foreign key value
2. the FK change triggers SYNC automation
3. which feeds into subsequent formulas.

## The Pattern

```yaml
tables:
  categories:
    columns:
      category_id: integer primary key
      category_name: varchar(100)
      tax_rate: numeric(5,4)

  products:
    columns:
      product_id: integer primary key
      customer_type: varchar(20)

      # Layer 1: Formula calculates FK value
      category_id:
        definition: FK categories
        formula: "CASE WHEN customer_type = 'premium' THEN 1 ELSE 2 END"

      # Layer 2: SYNC pulls values using the calculated FK
      tax_rate:
        definition: numeric(5,4)
        automation: SYNC categories.tax_rate

      base_price: numeric(10,2)

      # Layer 3: Formula uses the SYNC'd value
      price_with_tax:
        definition: numeric(10,2)
        formula: "base_price * (1 + tax_rate)"
```

## Execution Order

GenLogic computes columns in dependency order:

1. `customer_type` and `base_price` - base columns
2. `category_id` - formula using customer_type
3. `tax_rate` - SYNC using category_id FK
4. `price_with_tax` - formula using tax_rate

## On Insert

Insert with customer_type:

```sql
INSERT INTO products (product_id, customer_type, base_price)
VALUES (1, 'premium', 1000.00);
```

Calculations cascade:
- `category_id` = 1 (formula)
- `tax_rate` = 0.0825 (SYNC from categories.tax_rate where category_id = 1)
- `price_with_tax` = 1082.50 (formula)

## On Update

Update customer_type triggers recalculation:

```sql
UPDATE products
SET customer_type = 'standard';
```

Entire chain recalculates:
- `category_id` changes to 2
- `tax_rate` SYNC updates from new category
- `price_with_tax` recalculates with new tax_rate

## Parent Update

Update parent tax_rate triggers SYNC push:

```sql
UPDATE categories
SET tax_rate = 0.0800
WHERE category_id = 1;
```

All products with `category_id = 1`:
- `tax_rate` SYNC updates to 0.0800
- `price_with_tax` formula recalculates

## Column DAG

The column dependency graph within products table:

```
customer_type → category_id → tax_rate → price_with_tax
base_price ─────────────────────────────┘
```

GenLogic's topological sort ensures correct execution order across the FK relationship.
