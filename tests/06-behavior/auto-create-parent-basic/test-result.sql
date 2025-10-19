-- Insert a transaction with a category that doesn't exist
-- The BEFORE INSERT trigger should auto-create the parent category row
INSERT INTO transactions (amount, category_name) VALUES (100, 'Office Supplies');
INSERT INTO transactions (amount, category_name) VALUES (50, 'Office Supplies');
INSERT INTO transactions (amount, category_name) VALUES (75, 'Equipment');
