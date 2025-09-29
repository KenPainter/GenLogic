# E-commerce System Example

Comprehensive example showing products, customers, orders, and inventory management. Demonstrates multiple foreign keys, automations, and complex relationships.

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