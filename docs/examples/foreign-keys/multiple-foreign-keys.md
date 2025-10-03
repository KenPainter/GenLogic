Previous: [Simple Foreign Key](simple-foreign-key.md) | Next: [Composite Foreign Keys](composite-foreign-keys.md)

# Multiple Foreign Keys Example

## Overview

Many database tables need to reference multiple other tables. This example shows how to define a table with multiple foreign keys pointing to different parent tables. The orders table references both customers and products, creating a many-to-one relationship with each.

## Key Concepts

- Multiple Foreign Keys: A table can have multiple foreign key relationships to different tables
- Composite Relationships: Combining data from multiple related tables through JOIN operations
- Independent Constraints: Each foreign key operates independently with its own referential integrity rules
- Join Queries: Multiple foreign keys enable rich queries that combine data from multiple sources

## YAML Configuration

```yaml
# Multiple Foreign Keys Example
# Demonstrates a table with multiple foreign key relationships

columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  name:
    type: varchar
    size: 100

  amount:
    type: numeric
    size: 10
    decimal: 2

tables:
  customers:
    columns:
      customer_id:
        $ref: id

      customer_name:
        $ref: name

  products:
    columns:
      product_id:
        $ref: id

      product_name:
        $ref: name

      price:
        $ref: amount

  orders:
    # Multiple foreign keys pointing to different tables
    foreign_keys:
      customer_fk:
        table: customers

      product_fk:
        table: products

    columns:
      order_id:
        $ref: id

      quantity:
        type: integer

      # Foreign key columns
      customer_fk:
        type: integer
        required: true

      product_fk:
        type: integer
        required: true

      order_date:
        type: date

      total_amount:
        $ref: amount

# What this generates:
# 1. Three tables: customers, products, orders
# 2. Two foreign key constraints on orders table:
#    - orders.customer_fk REFERENCES customers(customer_id)
#    - orders.product_fk REFERENCES products(product_id)
# 3. Indexes on both foreign key columns for performance
```

## Generated SQL

This schema creates three tables with multiple foreign key relationships:

```sql
CREATE TABLE customers (
    customer_id SERIAL PRIMARY KEY,
    customer_name VARCHAR(100)
);

CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    product_name VARCHAR(100),
    price NUMERIC(10,2)
);

CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    quantity INTEGER,
    customer_fk INTEGER NOT NULL REFERENCES customers(customer_id),
    product_fk INTEGER NOT NULL REFERENCES products(product_id),
    order_date DATE,
    total_amount NUMERIC(10,2)
);

CREATE INDEX idx_orders_customer_fk ON orders(customer_fk);
CREATE INDEX idx_orders_product_fk ON orders(product_fk);
```

## Usage Examples

```sql
-- Create customers
INSERT INTO customers (customer_name) VALUES ('Alice Johnson');
INSERT INTO customers (customer_name) VALUES ('Bob Smith');

-- Create products
INSERT INTO products (product_name, price) VALUES ('Laptop', 999.99);
INSERT INTO products (product_name, price) VALUES ('Mouse', 29.99);
INSERT INTO products (product_name, price) VALUES ('Keyboard', 79.99);

-- Create orders referencing both customers and products
INSERT INTO orders (customer_fk, product_fk, quantity, order_date, total_amount)
VALUES (1, 1, 1, '2024-01-15', 999.99);

INSERT INTO orders (customer_fk, product_fk, quantity, order_date, total_amount)
VALUES (1, 2, 2, '2024-01-15', 59.98);

INSERT INTO orders (customer_fk, product_fk, quantity, order_date, total_amount)
VALUES (2, 3, 1, '2024-01-16', 79.99);

-- Query orders with customer and product information
SELECT o.order_id, c.customer_name, p.product_name, o.quantity, o.total_amount
FROM orders o
JOIN customers c ON o.customer_fk = c.customer_id
JOIN products p ON o.product_fk = p.product_id
ORDER BY o.order_date;

-- Find all orders for a specific customer
SELECT p.product_name, o.quantity, o.total_amount
FROM orders o
JOIN products p ON o.product_fk = p.product_id
WHERE o.customer_fk = 1;

-- Find all customers who ordered a specific product
SELECT c.customer_name, o.quantity, o.order_date
FROM orders o
JOIN customers c ON o.customer_fk = c.customer_id
WHERE o.product_fk = 1;

-- Get order summary with both customer and product details
SELECT
    c.customer_name,
    p.product_name,
    COUNT(*) as order_count,
    SUM(o.quantity) as total_quantity,
    SUM(o.total_amount) as total_spent
FROM orders o
JOIN customers c ON o.customer_fk = c.customer_id
JOIN products p ON o.product_fk = p.product_id
GROUP BY c.customer_name, p.product_name;
```

---

Previous: [Simple Foreign Key](simple-foreign-key.md) | Next: [Composite Foreign Keys](composite-foreign-keys.md)
