# 6A1: Basic Seed Rows

Tests basic seed data insertion via schema YAML.
Covers: seedRows property, layer ordering, ON CONFLICT DO NOTHING.

## Build Schema

```yaml
tables:
  categories:
    columns:
      category_id: serial primary key
      category_name: varchar(100)
    seed-rows:
      - category_id: 1
        category_name: Electronics
      - category_id: 2
        category_name: Books
      - category_id: 3
        category_name: Clothing

  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      category_id: FK categories
      price: numeric(10,2)
    seed-rows:
      - product_id: 1
        product_name: Laptop
        category_id: 1
        price: 999.99
      - product_id: 2
        product_name: Novel
        category_id: 2
        price: 14.99
      - product_id: 3
        product_name: T-Shirt
        category_id: 3
        price: 19.99
```

## Verify Categories Seeded

```sql
SELECT category_id, category_name
FROM categories
ORDER BY category_id;
```

```json
[
  {
    "category_id": 1,
    "category_name": "Electronics"
  },
  {
    "category_id": 2,
    "category_name": "Books"
  },
  {
    "category_id": 3,
    "category_name": "Clothing"
  }
]
```

## Verify Products Seeded

```sql
SELECT product_id, product_name, category_id, price
FROM products
ORDER BY product_id;
```

```json
[
  {
    "product_id": 1,
    "product_name": "Laptop",
    "category_id": 1,
    "price": "999.99"
  },
  {
    "product_id": 2,
    "product_name": "Novel",
    "category_id": 2,
    "price": "14.99"
  },
  {
    "product_id": 3,
    "product_name": "T-Shirt",
    "category_id": 3,
    "price": "19.99"
  }
]
```

## Verify FK Relationships

```sql
SELECT p.product_name, c.category_name, p.price
FROM products p
JOIN categories c ON p.category_id = c.category_id
ORDER BY p.product_id;
```

```json
[
  {
    "product_name": "Laptop",
    "category_name": "Electronics",
    "price": "999.99"
  },
  {
    "product_name": "Novel",
    "category_name": "Books",
    "price": "14.99"
  },
  {
    "product_name": "T-Shirt",
    "category_name": "Clothing",
    "price": "19.99"
  }
]
```

## Insert Additional Data

```sql
INSERT INTO categories (category_name)
VALUES ('Home & Garden');

INSERT INTO products (product_name, category_id, price)
VALUES ('Hammer', 100, 24.99);
```

## Verify New Data Alongside Seed Data

```sql
SELECT category_id, category_name
FROM categories
ORDER BY category_id;
```

```json
[
  {
    "category_id": 1,
    "category_name": "Electronics"
  },
  {
    "category_id": 2,
    "category_name": "Books"
  },
  {
    "category_id": 3,
    "category_name": "Clothing"
  },
  {
    "category_id": 100,
    "category_name": "Home & Garden"
  }
]
```

## Verify Products Including New

```sql
SELECT product_id, product_name, category_id
FROM products
ORDER BY product_id;
```

```json
[
  {
    "product_id": 1,
    "product_name": "Laptop",
    "category_id": 1
  },
  {
    "product_id": 2,
    "product_name": "Novel",
    "category_id": 2
  },
  {
    "product_id": 3,
    "product_name": "T-Shirt",
    "category_id": 3
  },
  {
    "product_id": 100,
    "product_name": "Hammer",
    "category_id": 100
  }
]
```

## Rebuild Schema (Idempotency Test)

```yaml
tables:
  categories:
    columns:
      category_id: serial primary key
      category_name: varchar(100)
    seed-rows:
      - category_id: 1
        category_name: Electronics
      - category_id: 2
        category_name: Books
      - category_id: 3
        category_name: Clothing

  products:
    columns:
      product_id: serial primary key
      product_name: varchar(100)
      category_id: FK categories
      price: numeric(10,2)
    seed-rows:
      - product_id: 1
        product_name: Laptop
        category_id: 1
        price: 999.99
      - product_id: 2
        product_name: Novel
        category_id: 2
        price: 14.99
      - product_id: 3
        product_name: T-Shirt
        category_id: 3
        price: 19.99
```

## Verify Seed Data Not Duplicated

```sql
SELECT category_id, category_name
FROM categories
ORDER BY category_id;
```

```json
[
  {
    "category_id": 1,
    "category_name": "Electronics"
  },
  {
    "category_id": 2,
    "category_name": "Books"
  },
  {
    "category_id": 3,
    "category_name": "Clothing"
  },
  {
    "category_id": 100,
    "category_name": "Home & Garden"
  }
]
```

## Verify Products Not Duplicated

```sql
SELECT product_id, product_name, category_id
FROM products
ORDER BY product_id;
```

```json
[
  {
    "product_id": 1,
    "product_name": "Laptop",
    "category_id": 1
  },
  {
    "product_id": 2,
    "product_name": "Novel",
    "category_id": 2
  },
  {
    "product_id": 3,
    "product_name": "T-Shirt",
    "category_id": 3
  },
  {
    "product_id": 100,
    "product_name": "Hammer",
    "category_id": 100
  }
]
```
