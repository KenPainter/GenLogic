# Test: Foreign Key Cycles Detection

This test verifies that the processor detects circular foreign key dependencies while allowing valid hierarchies.

## Expected Error

```
Foreign key cycles detected:
```

## Input Schema

```yaml
# Mix of valid hierarchies and circular dependencies
tables:
  # Valid hierarchy 1: products -> items -> components
  products:
    columns:
      product_id: serial primary key
      name: varchar(100)

  items:
    columns:
      item_id: serial primary key
      product_id: FK products
      name: varchar(100)

  components:
    columns:
      component_id: serial primary key
      item_id: FK items
      name: varchar(100)

  # Valid hierarchy 2: orders -> line_items -> shipments
  orders:
    columns:
      order_id: serial primary key
      order_date: date

  line_items:
    columns:
      line_item_id: serial primary key
      order_id: FK orders
      quantity: integer

  shipments:
    columns:
      shipment_id: serial primary key
      line_item_id: FK line_items
      tracking_number: varchar(50)

  # Cycle 1: a -> b -> c -> a
  a:
    columns:
      a_id: serial primary key
      c_id: FK c

  b:
    columns:
      b_id: serial primary key
      a_id: FK a

  c:
    columns:
      c_id: serial primary key
      b_id: FK b

  # Cycle 2: x -> y -> z -> x
  x:
    columns:
      x_id: serial primary key
      z_id: FK z

  y:
    columns:
      y_id: serial primary key
      x_id: FK x

  z:
    columns:
      z_id: serial primary key
      y_id: FK y
```

## Notes

This test validates:
- Valid 3-level hierarchies are processed correctly
- Circular foreign key dependencies are detected
- The error message clearly indicates cycles were found
- Multiple cycles can be detected in a single schema
