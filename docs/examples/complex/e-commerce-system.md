Previous: [Blog Platform](../complex/blog-platform.md) | Next: [Financial Tracking](../complex/financial-tracking.md)

# E-commerce System Example

## Overview

A complete e-commerce platform schema featuring products with categories and reviews, customers with order history, multi-warehouse inventory management, and automated order calculations. Demonstrates advanced GenLogic features including hierarchical categories, composite automations, and real-time metrics across multiple business domains.

**Prerequisites:** Before studying this complex example, familiarize yourself with:
- [../basic/minimal-schema.md](../basic/minimal-schema.md) - Basic schema structure
- [../automations/sum-automation.md](../automations/sum-automation.md) - SUM automation for order totals
- [../automations/count-automation.md](../automations/count-automation.md) - COUNT automation for metrics
- [../foreign-keys/multiple-foreign-keys.md](../foreign-keys/multiple-foreign-keys.md) - Multiple relationships

## Key Concepts

- Product Management: Categories, reviews, ratings, and inventory tracking
- Customer Analytics: Lifetime value, order history, and last purchase tracking
- Order Processing: Automated totals from line items with real-time updates
- Inventory Control: Multi-warehouse stock management with automated totals
- Business Intelligence: Real-time averages, counts, sums for decision-making

## YAML Configuration

```yaml
# E-commerce System Example
# Comprehensive example showing products, customers, orders, and inventory management
# Demonstrates multiple foreign keys, automations, and complex relationships

columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  name:
    type: varchar
    size: 100

  email:
    type: varchar
    size: 255

  money:
    type: numeric
    size: 12
    decimal: 2

  percentage:
    type: numeric
    size: 5
    decimal: 2

  rating:
    type: integer
    # Constraint: 1-5 stars

  address:
    type: text

tables:
  categories:
    foreign_keys:
      parent_fk:
        table: categories

    columns:
      category_id:
        $ref: id

      category_name:
        $ref: name

      parent_fk:
        type: integer
        required: false

      # Automation: count products in this category
      product_count:
        type: integer
        automation:
          type: COUNT
          table: products
          foreign_key: category_fk
          column: product_id

  products:
    foreign_keys:
      category_fk:
        table: categories

    columns:
      product_id:
        $ref: id

      product_name:
        $ref: name

      description:
        type: text

      base_price:
        $ref: money

      category_fk:
        type: integer
        required: true

      # Automation: average rating from reviews
      avg_rating:
        $ref: percentage
        automation:
          type: AVG
          table: product_reviews
          foreign_key: product_fk
          column: rating

      # Automation: total quantity across all warehouses
      total_stock:
        type: integer
        automation:
          type: SUM
          table: inventory
          foreign_key: product_fk
          column: quantity

      # Automation: count of reviews
      review_count:
        type: integer
        automation:
          type: COUNT
          table: product_reviews
          foreign_key: product_fk
          column: review_id

      created_at:
        type: timestamp

  customers:
    columns:
      customer_id:
        $ref: id

      customer_name:
        $ref: name

      email: null

      shipping_address:
        $ref: address

      # Automation: total spent across all orders
      lifetime_value:
        $ref: money
        automation:
          type: SUM
          table: orders
          foreign_key: customer_fk
          column: total_amount

      # Automation: count of orders
      order_count:
        type: integer
        automation:
          type: COUNT
          table: orders
          foreign_key: customer_fk
          column: order_id

      # Automation: date of most recent order
      last_order_date:
        type: date
        automation:
          type: LATEST
          table: orders
          foreign_key: customer_fk
          column: order_date

  warehouses:
    columns:
      warehouse_id:
        $ref: id

      warehouse_name:
        $ref: name

      location:
        $ref: address

  inventory:
    foreign_keys:
      product_fk:
        table: products
      warehouse_fk:
        table: warehouses

    columns:
      inventory_id:
        $ref: id

      product_fk:
        type: integer
        required: true

      warehouse_fk:
        type: integer
        required: true

      quantity:
        type: integer

      reorder_level:
        type: integer

      last_restocked:
        type: date

  orders:
    foreign_keys:
      customer_fk:
        table: customers

    columns:
      order_id:
        $ref: id

      customer_fk:
        type: integer
        required: true

      order_date:
        type: date

      status:
        type: varchar
        size: 20
        # pending, processing, shipped, delivered, cancelled

      # Automation: sum of all order items
      total_amount:
        $ref: money
        automation:
          type: SUM
          table: order_items
          foreign_key: order_fk
          column: line_total

      # Automation: count of items in order
      item_count:
        type: integer
        automation:
          type: COUNT
          table: order_items
          foreign_key: order_fk
          column: order_item_id

      shipping_address:
        $ref: address

  order_items:
    foreign_keys:
      order_fk:
        table: orders
        on_delete: CASCADE
      product_fk:
        table: products

    columns:
      order_item_id:
        $ref: id

      order_fk:
        type: integer
        required: true

      product_fk:
        type: integer
        required: true

      quantity:
        type: integer

      unit_price:
        $ref: money

      # Calculated: quantity * unit_price
      line_total:
        $ref: money

  product_reviews:
    foreign_keys:
      product_fk:
        table: products
      customer_fk:
        table: customers

    columns:
      review_id:
        $ref: id

      product_fk:
        type: integer
        required: true

      customer_fk:
        type: integer
        required: true

      rating:
        $ref: rating

      review_text:
        type: text

      review_date:
        type: date

# Complex automation relationships:
#
# 1. When a new order_item is added:
#    - orders.total_amount updates (SUM of line_total)
#    - orders.item_count updates (COUNT)
#    - customers.lifetime_value updates (SUM of order totals)
#    - customers.order_count updates (COUNT)
#
# 2. When a product review is added:
#    - products.avg_rating recalculates (AVG)
#    - products.review_count updates (COUNT)
#
# 3. When inventory is updated:
#    - products.total_stock recalculates (SUM across warehouses)
#
# 4. Hierarchical categories allow nested organization:
#    - Electronics > Computers > Laptops
#    - Each level maintains accurate product counts
#
# This demonstrates GenLogic's power:
# - 15+ automation triggers consolidated into efficient updates
# - Complex multi-table relationships maintained automatically
# - Real-time business metrics without manual calculation
```

## Generated SQL (Key Tables)

```sql
CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    product_name VARCHAR(100),
    description TEXT,
    base_price NUMERIC(12,2),
    category_fk INTEGER REFERENCES categories(category_id),
    avg_rating NUMERIC(5,2) DEFAULT 0,
    total_stock INTEGER DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    created_at TIMESTAMP
);

CREATE TABLE customers (
    customer_id SERIAL PRIMARY KEY,
    customer_name VARCHAR(100),
    email VARCHAR(255),
    shipping_address TEXT,
    lifetime_value NUMERIC(12,2) DEFAULT 0,
    order_count INTEGER DEFAULT 0,
    last_order_date DATE
);

CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    customer_fk INTEGER REFERENCES customers(customer_id),
    order_date DATE,
    status VARCHAR(20),
    total_amount NUMERIC(12,2) DEFAULT 0,
    item_count INTEGER DEFAULT 0,
    shipping_address TEXT
);

-- Automation triggers maintain all metrics automatically
```

## Usage Examples

```sql
-- Setup: Create categories and products
INSERT INTO categories (category_name)
VALUES ('Electronics'), ('Computers');
UPDATE categories SET parent_fk = 1 WHERE category_name = 'Computers';

INSERT INTO products (product_name, description, base_price, category_fk)
VALUES ('Laptop Pro', 'High-performance laptop', 1299.99, 2),
       ('Wireless Mouse', 'Ergonomic mouse', 29.99, 2);
-- Automatically: categories.product_count updates

-- Setup: Create warehouses and inventory
INSERT INTO warehouses (warehouse_name, location)
VALUES ('East Coast DC', 'New York'), ('West Coast DC', 'California');

INSERT INTO inventory (product_fk, warehouse_fk, quantity, reorder_level)
VALUES (1, 1, 50, 10), (1, 2, 75, 10),  -- Laptop in 2 warehouses
       (2, 1, 200, 50);                   -- Mouse in 1 warehouse
-- Automatically: products.total_stock = 125 for product 1, 200 for product 2

-- Create customer
INSERT INTO customers (customer_name, email, shipping_address)
VALUES ('Alice Johnson', 'alice@example.com', '123 Main St');

-- Customer places order
INSERT INTO orders (customer_fk, order_date, status, shipping_address)
VALUES (1, '2024-01-15', 'pending', '123 Main St');

INSERT INTO order_items (order_fk, product_fk, quantity, unit_price, line_total)
VALUES (1, 1, 1, 1299.99, 1299.99),
       (1, 2, 2, 29.99, 59.98);
-- Automatically: orders.total_amount = 1359.97
-- Automatically: orders.item_count = 2
-- Automatically: customers.lifetime_value = 1359.97
-- Automatically: customers.order_count = 1
-- Automatically: customers.last_order_date = '2024-01-15'

-- Add product reviews
INSERT INTO product_reviews (product_fk, customer_fk, rating, review_text, review_date)
VALUES (1, 1, 5, 'Excellent laptop!', '2024-01-20');
-- Automatically: products.avg_rating = 5.0
-- Automatically: products.review_count = 1

INSERT INTO product_reviews (product_fk, customer_fk, rating, review_text, review_date)
VALUES (1, 1, 4, 'Great performance', '2024-01-21');
-- Automatically: products.avg_rating = 4.5
-- Automatically: products.review_count = 2

-- Customer places another order
INSERT INTO orders (customer_fk, order_date, status, shipping_address)
VALUES (1, '2024-02-01', 'shipped', '123 Main St');

INSERT INTO order_items (order_fk, product_fk, quantity, unit_price, line_total)
VALUES (2, 2, 5, 29.99, 149.95);
-- Automatically: orders.total_amount for order 2 = 149.95
-- Automatically: customers.lifetime_value = 1509.92
-- Automatically: customers.order_count = 2
-- Automatically: customers.last_order_date = '2024-02-01'

-- Business Intelligence Queries
-- Top customers by lifetime value
SELECT customer_name, lifetime_value, order_count, last_order_date
FROM customers
ORDER BY lifetime_value DESC
LIMIT 10;

-- Product performance
SELECT product_name, base_price, avg_rating, review_count, total_stock
FROM products
WHERE review_count > 0
ORDER BY avg_rating DESC, review_count DESC;

-- Inventory status across warehouses
SELECT p.product_name, w.warehouse_name, i.quantity, i.reorder_level,
       CASE WHEN i.quantity < i.reorder_level THEN 'REORDER' ELSE 'OK' END as status
FROM inventory i
JOIN products p ON i.product_fk = p.product_id
JOIN warehouses w ON i.warehouse_fk = w.warehouse_id
ORDER BY p.product_name, w.warehouse_name;

-- Order details with all metrics
SELECT o.order_id, c.customer_name, o.order_date, o.status,
       o.item_count, o.total_amount
FROM orders o
JOIN customers c ON o.customer_fk = c.customer_id
ORDER BY o.order_date DESC;
```

---

Previous: [Blog Platform](../complex/blog-platform.md) | Next: [Financial Tracking](../complex/financial-tracking.md)
