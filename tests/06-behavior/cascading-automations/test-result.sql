INSERT INTO discount_groups (group_id, discount_percent) VALUES (1, 10.00);
INSERT INTO discount_groups (group_id, discount_percent) VALUES (2, 15.00);
INSERT INTO customers (customer_id, discount_group_id) VALUES (1, 1);
INSERT INTO orders (order_id, customer_id) VALUES (1, 1);
-- Verify cascade works: orders should have discount_group_id=1 and discount_percent=10.00

-- Change customer's discount group
UPDATE customers SET discount_group_id = 2 WHERE customer_id = 1;
-- Verify SYNC propagates: orders.discount_group_id should update to 2
-- But SNAPSHOT should NOT update: orders.discount_percent should stay 10.00
