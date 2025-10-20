Previous: [Moving Values from Child to Parent](../30-column-automation/30-child-to-parent.md) | Next: [Spreading Parent to Multiple Children](20-spread-to-children.md)

# Auto-Creating Parent Rows

GenLogic can automatically create parent rows when a child row
references a non-existent foreign key value.

This feature allows summary tables to act as materialized views
that are automatically updated within the database.

## Use Cases

- Category or tag tables that grow dynamically as data is added
- Summary tables with aggregations (SUM, COUNT) that auto-populate
- Lookup tables that self-populate from transaction data
- Hierarchical data where parent nodes are created on demand

## Simple Example

```yaml
tables:
  categories:
    columns:
      category_name: varchar(100) primary key
      total_amount:
        automation: SUM @transactions.amount

  transactions:
    foreign_keys:
      category_name:
        table: categories
        auto_create_parent: true

    columns:
      transaction_id: serial primary key
      amount: integer not null
      category_name: varchar(100)
```

## What Happens

When the app inserts a transaction with a new category:

```sql
INSERT INTO transactions (amount, category_name) VALUES (100, 'Office Supplies');
```

The GenLogic triggers automatically:
1. Check if 'Office Supplies' exists in categories
2. If not found, creates the parent row with only the primary key
3. Inserts the transaction row
4. Updates any aggregations (like total_amount)

The category row is created with:
- Primary key: 'Office Supplies' (from the child's FK value)
- Other columns: Default values (NULL or specified defaults)
- Aggregations: Calculated from children (100 in this case)

## Syntax

Add `auto_create_parent: true` to the foreign key definition:

```yaml
foreign_keys:
  category_name:
    table: categories
    auto_create_parent: true
```

This works with:
- Single-column foreign keys
- Composite foreign keys
- Any primary key type (varchar, integer, serial, etc.)

## Parent Table Requirements

The parent table must have:
- A primary key (single or composite)
- No NOT NULL columns without defaults (other than the PK)

If other columns are NOT NULL without defaults, the auto-create will fail 
on the NOT NULL constraints.

## Combining with Aggregations

Auto-create parent works well with child-to-parent aggregations:

```yaml
tables:
  categories:
    columns:
      category_name: varchar(100) primary key
      product_count:
        definition: integer
        automation: COUNT @products.product_id
      total_revenue:
        definition: numeric(10,2)
        automation: SUM @products.price

  products:
    foreign_keys:
      category_name:
        table: categories
        auto_create_parent: true

    columns:
      product_id: serial primary key
      category_name: varchar(100)
      product_name: varchar(200)
      price: numeric(10,2)
```

When the client inserts products:

```sql
INSERT INTO products (category_name, product_name, price)
VALUES ('Electronics', 'Laptop', 999.99);

INSERT INTO products (category_name, product_name, price)
VALUES ('Electronics', 'Mouse', 29.99);
```

The 'Electronics' category is auto-created on the first insert, and aggregations update with each insert.

## Restrictions

### Cannot Use with NOT NULL Columns

Parent table columns (except PK and columns with defaults) cannot be NOT NULL:

```yaml
# INVALID
tables:
  categories:
    columns:
      category_name: varchar(100) primary key
      description: varchar(500) not null  # No default - auto-create will fail

  products:
    foreign_keys:
      category_name:
        table: categories
        auto_create_parent: true
```

### Must Have Primary Key

The parent table must have a primary key:

```yaml
# INVALID
tables:
  categories:
    columns:
      category_name: varchar(100)  # No PRIMARY KEY
      # auto_create_parent requires a PK
```

## Complete Example

```yaml
tables:
  # Self-populating category summary table
  categories:
    columns:
      category_name: varchar(100) primary key
      product_count:
        definition: integer
        automation: COUNT @products.product_id
      total_value:
        definition: numeric(10,2)
        automation: SUM @products.price
      avg_price:
        definition: numeric(10,2)
        automation: SUM @products.price  # Will manually calculate average if needed

  # Transaction/detail table
  products:
    foreign_keys:
      category_name:
        table: categories
        auto_create_parent: true

    columns:
      product_id: serial primary key
      category_name: varchar(100)
      product_name: varchar(200)
      price: numeric(10,2)
```

Usage:

```sql
-- No need to pre-create categories
INSERT INTO products (category_name, product_name, price)
VALUES
  ('Electronics', 'Laptop', 999.99),
  ('Electronics', 'Mouse', 29.99),
  ('Books', 'Novel', 15.99);

-- Categories were auto-created with aggregations
SELECT category_name, product_count, total_value
FROM categories
ORDER BY category_name;
-- category_name | product_count | total_value
-- --------------|---------------|-------------
-- Books         | 1             | 15.99
-- Electronics   | 2             | 1029.98
```

## Test Coverage

This section lists tests that verify auto-create parent features work correctly.

### Validation (Runtime)

Tests that verify GenLogic catches invalid auto-create parent configurations:

- [x] [Parent has no PK](../../tests/04-validation/auto-create-parent-no-pk) - Error when parent table has no primary key

### Schema Features (Isolated Tests)

Tests that verify GenLogic generates correct triggers for auto-create parent:

- [x] [Auto-create parent trigger](../../tests/05-schema-features/auto-create-parent-trigger) - Trigger generation for auto-create parent

### Behavior (End-to-End Tests)

Tests that verify auto-create parent behavior with actual data:

- [x] [Auto-create parent basic](../../tests/06-behavior/auto-create-parent-basic) - Creates parent row when child references non-existent parent

---

Previous: [Moving Values from Child to Parent](../30-column-automation/30-child-to-parent.md) | Next: [Spreading Parent to Multiple Children](20-spread-to-children.md)
