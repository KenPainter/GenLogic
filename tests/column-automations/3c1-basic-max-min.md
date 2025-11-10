# 3C1: Basic MAX and MIN on INSERT

Tests that parent MAX and MIN aggregation columns update correctly when child rows are inserted.

## Build Schema

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)

      # MAX: Highest review score
      highest_rating:
        definition: integer
        automation: MAX reviews.rating

      # MIN: Lowest review score
      lowest_rating:
        definition: integer
        automation: MIN reviews.rating

  reviews:
    columns:
      review_id: serial primary key
      product_id: FK products
      reviewer_name: varchar(100)
      rating: integer
      comment: text
```

## Insert Parent Rows

```sql
INSERT INTO products (product_name)
VALUES ('Super Widget'), ('Mega Gadget');
```

## Verify Initial Values (Should be NULL)

```sql
SELECT product_name, highest_rating, lowest_rating
FROM products
ORDER BY product_id;
```

```json
[
  {
    "product_name": "Super Widget",
    "highest_rating": null,
    "lowest_rating": null
  },
  {
    "product_name": "Mega Gadget",
    "highest_rating": null,
    "lowest_rating": null
  }
]
```

## Insert First Review for Super Widget

```sql
INSERT INTO reviews (product_id, reviewer_name, rating, comment)
VALUES ((SELECT product_id FROM products WHERE product_name = 'Super Widget'), 'Alice', 5, 'Excellent product!');
```

## Verify MAX and MIN Set to Same Value

```sql
SELECT product_name, highest_rating, lowest_rating
FROM products
WHERE product_name = 'Super Widget';
```

```json
[
  {
    "product_name": "Super Widget",
    "highest_rating": 5,
    "lowest_rating": 5
  }
]
```

## Insert More Reviews for Super Widget

```sql
INSERT INTO reviews (product_id, reviewer_name, rating, comment)
VALUES
  ((SELECT product_id FROM products WHERE product_name = 'Super Widget'), 'Bob', 4, 'Very good'),
  ((SELECT product_id FROM products WHERE product_name = 'Super Widget'), 'Carol', 3, 'Decent'),
  ((SELECT product_id FROM products WHERE product_name = 'Super Widget'), 'David', 5, 'Love it!');
```

## Verify MAX and MIN Range

```sql
SELECT product_name, highest_rating, lowest_rating
FROM products
WHERE product_name = 'Super Widget';
```

```json
[
  {
    "product_name": "Super Widget",
    "highest_rating": 5,
    "lowest_rating": 3
  }
]
```

## Insert New High Rating

```sql
INSERT INTO reviews (product_id, reviewer_name, rating, comment)
VALUES ((SELECT product_id FROM products WHERE product_name = 'Super Widget'), 'Eve', 2, 'Not great');
```

## Verify MIN Decreased

```sql
SELECT product_name, highest_rating, lowest_rating
FROM products
WHERE product_name = 'Super Widget';
```

```json
[
  {
    "product_name": "Super Widget",
    "highest_rating": 5,
    "lowest_rating": 2
  }
]
```

## Insert Reviews for Mega Gadget

```sql
INSERT INTO reviews (product_id, reviewer_name, rating, comment)
VALUES
  ((SELECT product_id FROM products WHERE product_name = 'Mega Gadget'), 'Frank', 4, 'Pretty good'),
  ((SELECT product_id FROM products WHERE product_name = 'Mega Gadget'), 'Grace', 5, 'Amazing!'),
  ((SELECT product_id FROM products WHERE product_name = 'Mega Gadget'), 'Henry', 3, 'Average');
```

## Verify Both Products

```sql
SELECT product_name, highest_rating, lowest_rating
FROM products
ORDER BY product_id;
```

```json
[
  {
    "product_name": "Super Widget",
    "highest_rating": 5,
    "lowest_rating": 2
  },
  {
    "product_name": "Mega Gadget",
    "highest_rating": 5,
    "lowest_rating": 3
  }
]
```

## Insert Extreme Ratings

```sql
INSERT INTO reviews (product_id, reviewer_name, rating, comment)
VALUES
  ((SELECT product_id FROM products WHERE product_name = 'Super Widget'), 'Ian', 1, 'Terrible'),
  ((SELECT product_id FROM products WHERE product_name = 'Mega Gadget'), 'Jane', 1, 'Worst ever');
```

## Verify MIN Updated for Both

```sql
SELECT product_name, highest_rating, lowest_rating
FROM products
ORDER BY product_id;
```

```json
[
  {
    "product_name": "Super Widget",
    "highest_rating": 5,
    "lowest_rating": 1
  },
  {
    "product_name": "Mega Gadget",
    "highest_rating": 5,
    "lowest_rating": 1
  }
]
```
