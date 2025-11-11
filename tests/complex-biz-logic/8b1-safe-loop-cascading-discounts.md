# 8b1. Safe Loop - Conditional Cascading Discounts

Tests a "safe loop" where conditional logic triggers cascading updates that eventually terminate.

## Build Schema

```yaml
tables:
  discount_codes:
    columns:
      code: character varying(20) primary key
      discount_percent: numeric(5,4)
      second_discount_threshold: numeric(10,2)
    seed-rows:
      - code: SAVE20
        discount_percent: 0.20
        second_discount_threshold: 100.00
      - code: SAVE10
        discount_percent: 0.10
        second_discount_threshold: 50.00

  orders:
    columns:
      order_id: integer primary key
      discount_code: FK discount_codes
      # SYNC discount info from discount_codes
      discount_percent:
        definition: numeric(5,4)
        automation: SYNC discount_codes.discount_percent
      second_discount_threshold:
        definition: numeric(10,2)
        automation: SYNC discount_codes.second_discount_threshold
      # Aggregated from order_lines (first pass subtotals)
      subtotal_after_first_discount:
        definition: numeric(10,2)
        automation: SUM order_lines.subtotal_after_first_discount
      # Formula: qualifies if subtotal < threshold
      qualifies_for_second_discount:
        definition: boolean
        formula: "CASE WHEN subtotal_after_first_discount < second_discount_threshold THEN true ELSE false END"
      # Aggregated from order_lines (final totals after second discount)
      order_total:
        definition: numeric(10,2)
        automation: SUM order_lines.line_total

  order_lines:
    columns:
      line_id: integer primary key
      order_id: FK orders
      base_price: numeric(10,2)
      # SYNC first discount from order
      discount_percent:
        definition: numeric(5,4)
        automation: SYNC orders.discount_percent
      # Formula: apply first discount
      subtotal_after_first_discount:
        definition: numeric(10,2)
        formula: "base_price * (1 - discount_percent)"
      # SYNC whether order qualifies for second discount
      qualifies_for_second_discount:
        definition: boolean
        automation: SYNC orders.qualifies_for_second_discount
      # Formula: apply second discount to get final line total
      line_total:
        definition: numeric(10,2)
        formula: "subtotal_after_first_discount * (CASE WHEN qualifies_for_second_discount THEN 0.90 ELSE 1.00 END)"
```

## Verify Discount Codes

```sql
SELECT * FROM discount_codes ORDER BY code;
```

```json
[
  {
    "code": "SAVE10",
    "discount_percent": "0.1000",
    "second_discount_threshold": "50.00"
  },
  {
    "code": "SAVE20",
    "discount_percent": "0.2000",
    "second_discount_threshold": "100.00"
  }
]
```

## Create Order with SAVE20 Discount

```sql
INSERT INTO orders (order_id, discount_code)
VALUES (1, 'SAVE20');

SELECT order_id, discount_code, discount_percent, second_discount_threshold, subtotal_after_first_discount, qualifies_for_second_discount, order_total
FROM orders
WHERE order_id = 1;
```

```json
[
  {
    "order_id": 1,
    "discount_code": "SAVE20",
    "discount_percent": "0.2000",
    "second_discount_threshold": "100.00",
    "subtotal_after_first_discount": "0.00",
    "qualifies_for_second_discount": true,
    "order_total": "0.00"
  }
]
```

## Add Order Lines - Should Apply First Discount Only

Adding lines with total > $100 (after first discount) should NOT trigger second discount.

```sql
INSERT INTO order_lines (line_id, order_id, base_price)
VALUES
  (1, 1, 75.00),
  (2, 1, 80.00);

SELECT line_id, order_id, base_price, discount_percent, subtotal_after_first_discount, qualifies_for_second_discount, line_total
FROM order_lines
WHERE order_id = 1
ORDER BY line_id;
```

```json
[
  {
    "line_id": 1,
    "order_id": 1,
    "base_price": "75.00",
    "discount_percent": "0.2000",
    "subtotal_after_first_discount": "60.00",
    "qualifies_for_second_discount": false,
    "line_total": "60.00"
  },
  {
    "line_id": 2,
    "order_id": 1,
    "base_price": "80.00",
    "discount_percent": "0.2000",
    "subtotal_after_first_discount": "64.00",
    "qualifies_for_second_discount": false,
    "line_total": "64.00"
  }
]
```

## Verify Order Total - No Second Discount

Order total is $124.00 which is > $100 threshold, so no second discount applies.

```sql
SELECT order_id, discount_code, discount_percent, second_discount_threshold, subtotal_after_first_discount, qualifies_for_second_discount, order_total
FROM orders
WHERE order_id = 1;
```

```json
[
  {
    "order_id": 1,
    "discount_code": "SAVE20",
    "discount_percent": "0.2000",
    "second_discount_threshold": "100.00",
    "subtotal_after_first_discount": "124.00",
    "qualifies_for_second_discount": false,
    "order_total": "124.00"
  }
]
```

## Create Order #2 with Lower Total - Should Trigger Second Discount

```sql
INSERT INTO orders (order_id, discount_code)
VALUES (2, 'SAVE20');

INSERT INTO order_lines (line_id, order_id, base_price)
VALUES
  (3, 2, 50.00),
  (4, 2, 40.00);

SELECT line_id, order_id, base_price, discount_percent, subtotal_after_first_discount, qualifies_for_second_discount, line_total
FROM order_lines
WHERE order_id = 2
ORDER BY line_id;
```

```json
[
  {
    "line_id": 3,
    "order_id": 2,
    "base_price": "50.00",
    "discount_percent": "0.2000",
    "subtotal_after_first_discount": "40.00",
    "qualifies_for_second_discount": true,
    "line_total": "36.00"
  },
  {
    "line_id": 4,
    "order_id": 2,
    "base_price": "40.00",
    "discount_percent": "0.2000",
    "subtotal_after_first_discount": "32.00",
    "qualifies_for_second_discount": true,
    "line_total": "28.80"
  }
]
```

## Verify Order #2 Total - With Second Discount

First pass: $50 * 0.80 + $40 * 0.80 = $72.00 (< $100 threshold)
Second pass: Apply 10% second discount: $72.00 * 0.90 = $64.80

```sql
SELECT order_id, discount_code, discount_percent, second_discount_threshold, subtotal_after_first_discount, qualifies_for_second_discount, order_total
FROM orders
WHERE order_id = 2;
```

```json
[
  {
    "order_id": 2,
    "discount_code": "SAVE20",
    "discount_percent": "0.2000",
    "second_discount_threshold": "100.00",
    "subtotal_after_first_discount": "72.00",
    "qualifies_for_second_discount": true,
    "order_total": "64.80"
  }
]
```

## Update Order #1 to Remove One Line - Should Trigger Second Discount

Removing a line drops total below threshold, triggering cascade.

```sql
DELETE FROM order_lines WHERE line_id = 2;

SELECT line_id, order_id, base_price, discount_percent, subtotal_after_first_discount, qualifies_for_second_discount, line_total
FROM order_lines
WHERE order_id = 1
ORDER BY line_id;
```

```json
[
  {
    "line_id": 1,
    "order_id": 1,
    "base_price": "75.00",
    "discount_percent": "0.2000",
    "subtotal_after_first_discount": "60.00",
    "qualifies_for_second_discount": true,
    "line_total": "54.00"
  }
]
```

## Verify Order #1 Now Has Second Discount

After DELETE: $75 * 0.80 = $60.00 (< $100), triggers second discount: $60 * 0.90 = $54.00

```sql
SELECT order_id, discount_code, discount_percent, second_discount_threshold, subtotal_after_first_discount, qualifies_for_second_discount, order_total
FROM orders
WHERE order_id = 1;
```

```json
[
  {
    "order_id": 1,
    "discount_code": "SAVE20",
    "discount_percent": "0.2000",
    "second_discount_threshold": "100.00",
    "subtotal_after_first_discount": "60.00",
    "qualifies_for_second_discount": true,
    "order_total": "54.00"
  }
]
```

## Change Discount Code - Should Recalculate Everything

```sql
UPDATE orders
SET discount_code = 'SAVE10'
WHERE order_id = 1;

SELECT line_id, order_id, base_price, discount_percent, subtotal_after_first_discount, qualifies_for_second_discount, line_total
FROM order_lines
WHERE order_id = 1
ORDER BY line_id;
```

```json
[
  {
    "line_id": 1,
    "order_id": 1,
    "base_price": "75.00",
    "discount_percent": "0.1000",
    "subtotal_after_first_discount": "67.50",
    "qualifies_for_second_discount": false,
    "line_total": "67.50"
  }
]
```

## Verify Order #1 with New Discount Code

With SAVE10: $75 * 0.90 = $67.50 (> $50 threshold), no second discount.

```sql
SELECT order_id, discount_code, discount_percent, second_discount_threshold, subtotal_after_first_discount, qualifies_for_second_discount, order_total
FROM orders
WHERE order_id = 1;
```

```json
[
  {
    "order_id": 1,
    "discount_code": "SAVE10",
    "discount_percent": "0.1000",
    "second_discount_threshold": "50.00",
    "subtotal_after_first_discount": "67.50",
    "qualifies_for_second_discount": false,
    "order_total": "67.50"
  }
]
```
