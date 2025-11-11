# 4C1: Formulas Combined with Automation

Tests interaction between formula columns and SYNC/aggregation automation.
Covers: formulas using SYNC values, aggregations of formula results, combined workflows.

## Build Schema

```yaml
tables:
  price_lists:
    columns:
      price_list_id: serial primary key
      list_name: varchar(100)
      base_markup_percent: numeric(5,2)

      # Aggregation: Total revenue from all items using this price list
      total_revenue:
        definition: numeric(12,2)
        automation: SUM items.extended_price

  items:
    columns:
      item_id: serial primary key
      price_list_id: FK price_lists
      item_name: varchar(100)
      wholesale_cost: numeric(10,2)
      quantity_sold: integer

      # SYNC: Pull markup from price list
      markup_percent:
        definition: numeric(5,2)
        automation: SYNC price_lists.base_markup_percent

      # Formula: Calculate retail price using SYNC'd markup
      retail_price:
        definition: numeric(10,2)
        formula: "wholesale_cost * (1 + markup_percent / 100)"

      # Formula: Calculate extended price (used by parent SUM)
      extended_price:
        definition: numeric(12,2)
        formula: "retail_price * quantity_sold"

      # Formula: Calculate profit per unit
      profit_per_unit:
        definition: numeric(10,2)
        formula: "retail_price - wholesale_cost"

      # Formula: Total profit
      total_profit:
        definition: numeric(12,2)
        formula: "profit_per_unit * quantity_sold"
```

## Insert Price Lists

```sql
INSERT INTO price_lists (list_name, base_markup_percent)
VALUES ('Standard', 50.00), ('Premium', 100.00);
```

## Verify Initial State

```sql
SELECT list_name, base_markup_percent, total_revenue
FROM price_lists
ORDER BY price_list_id;
```

```json
[
  {
    "list_name": "Standard",
    "base_markup_percent": "50.00",
    "total_revenue": "0.00"
  },
  {
    "list_name": "Premium",
    "base_markup_percent": "100.00",
    "total_revenue": "0.00"
  }
]
```

## Insert Item with Standard Pricing

```sql
INSERT INTO items (price_list_id, item_name, wholesale_cost, quantity_sold)
VALUES ((SELECT price_list_id FROM price_lists WHERE list_name = 'Standard'), 'Widget A', 100.00, 10);
```

## Verify SYNC + Formulas + Aggregation

```sql
SELECT item_name, wholesale_cost, markup_percent, retail_price,
       quantity_sold, extended_price, profit_per_unit, total_profit
FROM items;
```

```json
[
  {
    "item_name": "Widget A",
    "wholesale_cost": "100.00",
    "markup_percent": "50.00",
    "retail_price": "150.00",
    "quantity_sold": 10,
    "extended_price": "1500.00",
    "profit_per_unit": "50.00",
    "total_profit": "500.00"
  }
]
```

## Verify Parent Aggregation Updated

```sql
SELECT list_name, total_revenue
FROM price_lists
WHERE list_name = 'Standard';
```

```json
[
  {
    "list_name": "Standard",
    "total_revenue": "1500.00"
  }
]
```

## Insert Premium Items

```sql
INSERT INTO items (price_list_id, item_name, wholesale_cost, quantity_sold)
VALUES
  ((SELECT price_list_id FROM price_lists WHERE list_name = 'Premium'), 'Premium Widget', 200.00, 5),
  ((SELECT price_list_id FROM price_lists WHERE list_name = 'Premium'), 'Deluxe Gadget', 150.00, 8);
```

## Verify Premium Items

```sql
SELECT item_name, wholesale_cost, markup_percent, retail_price,
       extended_price, total_profit
FROM items
WHERE price_list_id = (SELECT price_list_id FROM price_lists WHERE list_name = 'Premium')
ORDER BY item_id;
```

```json
[
  {
    "item_name": "Premium Widget",
    "wholesale_cost": "200.00",
    "markup_percent": "100.00",
    "retail_price": "400.00",
    "extended_price": "2000.00",
    "total_profit": "1000.00"
  },
  {
    "item_name": "Deluxe Gadget",
    "wholesale_cost": "150.00",
    "markup_percent": "100.00",
    "retail_price": "300.00",
    "extended_price": "2400.00",
    "total_profit": "1200.00"
  }
]
```

## Verify Premium Revenue Aggregated

```sql
SELECT list_name, total_revenue
FROM price_lists
WHERE list_name = 'Premium';
```

```json
[
  {
    "list_name": "Premium",
    "total_revenue": "4400.00"
  }
]
```

## Update Parent Markup (should cascade via SYNC)

```sql
UPDATE price_lists
SET base_markup_percent = 75.00
WHERE list_name = 'Standard';
```

## Verify SYNC Propagated and Formulas Recalculated

```sql
SELECT item_name, wholesale_cost, markup_percent, retail_price,
       extended_price, total_profit
FROM items
WHERE item_name = 'Widget A';
```

```json
[
  {
    "item_name": "Widget A",
    "wholesale_cost": "100.00",
    "markup_percent": "75.00",
    "retail_price": "175.00",
    "extended_price": "1750.00",
    "total_profit": "750.00"
  }
]
```

## Verify Aggregation Updated After SYNC

```sql
SELECT list_name, base_markup_percent, total_revenue
FROM price_lists
WHERE list_name = 'Standard';
```

```json
[
  {
    "list_name": "Standard",
    "base_markup_percent": "75.00",
    "total_revenue": "1750.00"
  }
]
```

## Update Quantity (triggers formula recalc and aggregation update)

```sql
UPDATE items
SET quantity_sold = 15
WHERE item_name = 'Widget A';
```

## Verify Formula and Aggregation Chain

```sql
SELECT i.item_name, i.quantity_sold, i.extended_price,
       p.list_name, p.total_revenue
FROM items i
JOIN price_lists p ON p.price_list_id = i.price_list_id
WHERE i.item_name = 'Widget A';
```

```json
[
  {
    "item_name": "Widget A",
    "quantity_sold": 15,
    "extended_price": "2625.00",
    "list_name": "Standard",
    "total_revenue": "2625.00"
  }
]
```

## Move Item to Different Price List

```sql
UPDATE items
SET price_list_id = (SELECT price_list_id FROM price_lists WHERE list_name = 'Premium')
WHERE item_name = 'Widget A';
```

## Verify SYNC Updated and Formulas Recalculated

```sql
SELECT item_name, markup_percent, retail_price, extended_price
FROM items
WHERE item_name = 'Widget A';
```

```json
[
  {
    "item_name": "Widget A",
    "markup_percent": "100.00",
    "retail_price": "200.00",
    "extended_price": "3000.00"
  }
]
```

## Verify Both Price Lists Updated

```sql
SELECT list_name, total_revenue
FROM price_lists
ORDER BY price_list_id;
```

```json
[
  {
    "list_name": "Standard",
    "total_revenue": "0.00"
  },
  {
    "list_name": "Premium",
    "total_revenue": "7400.00"
  }
]
```
