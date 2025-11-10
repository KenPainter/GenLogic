# 3A3: SUM on DELETE

Tests that parent SUM aggregation updates correctly when child rows are deleted.

## Build Schema

```yaml
tables:
  categories:
    columns:
      category_id: serial primary key
      category_name: varchar(100)

      # SUM: Total revenue for this category
      total_revenue:
        definition: numeric(12,2)
        automation: SUM sales.amount

  sales:
    columns:
      sale_id: serial primary key
      category_id: FK categories
      product_name: varchar(100)
      amount: numeric(12,2)
```

## Insert Parent Rows

```sql
INSERT INTO categories (category_name)
VALUES ('Electronics'), ('Furniture');
```

## Insert Sales Data

```sql
INSERT INTO sales (category_id, product_name, amount)
VALUES
  ((SELECT category_id FROM categories WHERE category_name = 'Electronics'), 'Laptop', 1200.00),
  ((SELECT category_id FROM categories WHERE category_name = 'Electronics'), 'Mouse', 25.00),
  ((SELECT category_id FROM categories WHERE category_name = 'Electronics'), 'Keyboard', 75.00),
  ((SELECT category_id FROM categories WHERE category_name = 'Electronics'), 'Monitor', 350.00),
  ((SELECT category_id FROM categories WHERE category_name = 'Furniture'), 'Desk', 450.00),
  ((SELECT category_id FROM categories WHERE category_name = 'Furniture'), 'Chair', 200.00);
```

## Verify Initial Totals

```sql
SELECT category_name, total_revenue
FROM categories
ORDER BY category_id;
```

```json
[
  {
    "category_name": "Electronics",
    "total_revenue": "1650.00"
  },
  {
    "category_name": "Furniture",
    "total_revenue": "650.00"
  }
]
```

## Delete Single Sale from Electronics

```sql
DELETE FROM sales
WHERE product_name = 'Mouse';
```

## Verify Electronics Total Decreased

```sql
SELECT category_name, total_revenue
FROM categories
WHERE category_name = 'Electronics';
```

```json
[
  {
    "category_name": "Electronics",
    "total_revenue": "1625.00"
  }
]
```

## Delete Multiple Sales from Electronics

```sql
DELETE FROM sales
WHERE product_name IN ('Keyboard', 'Monitor');
```

## Verify Electronics Total Updated

```sql
SELECT category_name, total_revenue
FROM categories
WHERE category_name = 'Electronics';
```

```json
[
  {
    "category_name": "Electronics",
    "total_revenue": "1200.00"
  }
]
```

## Delete All Sales from Furniture

```sql
DELETE FROM sales
WHERE category_id = (SELECT category_id FROM categories WHERE category_name = 'Furniture');
```

## Verify Furniture Total is Zero

```sql
SELECT category_name, total_revenue
FROM categories
WHERE category_name = 'Furniture';
```

```json
[
  {
    "category_name": "Furniture",
    "total_revenue": "0.00"
  }
]
```

## Verify Final State

```sql
SELECT category_name, total_revenue
FROM categories
ORDER BY category_id;
```

```json
[
  {
    "category_name": "Electronics",
    "total_revenue": "1200.00"
  },
  {
    "category_name": "Furniture",
    "total_revenue": "0.00"
  }
]
```

## Verify Remaining Sales Count

```sql
SELECT
  c.category_name,
  COUNT(s.sale_id) as sale_count
FROM categories c
LEFT JOIN sales s ON s.category_id = c.category_id
GROUP BY c.category_id, c.category_name
ORDER BY c.category_id;
```

```json
[
  {
    "category_name": "Electronics",
    "sale_count": "1"
  },
  {
    "category_name": "Furniture",
    "sale_count": "0"
  }
]
```
