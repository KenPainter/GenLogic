Previous: [Spreading Parent to Multiple Children](20-spread-to-children.md) | Next: [Schema Validation](../50-integrity-features/01-schema-validation.md)

# Syncing Parent to Children

GenLogic can automatically create and sync child rows when parent rows are inserted, updated, or deleted.

This feature creates a 1:1 relationship where each parent row automatically creates one corresponding child row, keeping them synchronized.

## Use Cases

- Maintaining parallel tables with synchronized data
- Creating audit or logging rows automatically
- Splitting data across tables for different access patterns
- Synchronizing denormalized copies for performance
- Creating transaction/ledger rows from master records

## Basic Example

```yaml
tables:
  orders:
    columns:
      order_id: serial primary key
      customer_name: varchar(100)
      order_total: numeric(10,2)
      created_at: timestamp

  order_audit:
    foreign_keys:
      order_id:
        table: orders
        auto_create:
          on: [insert, update, delete]
          copy_columns:
            customer_name: customer_name
            order_total: order_total
          literals:
            action: "'INSERT'"

    columns:
      audit_id: serial primary key
      customer_name: varchar(100)
      order_total: numeric(10,2)
      action: varchar(20)
```

## What Happens

When you insert an order:

```sql
INSERT INTO orders (customer_name, order_total, created_at)
VALUES ('Alice', 150.00, NOW());
```

GenLogic automatically:
1. Triggers AFTER INSERT on the orders table
2. Creates one row in order_audit
3. Copies values from copy_columns (customer_name, order_total)
4. Sets literal values (action = 'INSERT')
5. Sets the foreign key (order_id)

Result:
- orders: 1 row with order_id=1
- order_audit: 1 row with order_id=1, customer_name='Alice', order_total=150.00, action='INSERT'

When you update or delete the order, the child row is automatically updated or deleted to match.

## Syntax

Add auto_create without spread to the foreign key:

```yaml
foreign_keys:
  parent_fk:
    table: parent_table
    auto_create:
      on: [insert, update, delete]
      copy_columns:
        parent_col: child_col
      literals:
        child_col: "'value'"
      filter: "condition"
```

Required properties:
- on - Which operations trigger syncing (insert, update, delete)

Optional properties:
- copy_columns - Map of parent columns to child columns (parent_col: child_col)
- literals - Constant values for child columns (child_col: 'literal value')
- filter - SQL condition to apply syncing conditionally

## Parent Table Requirements

The parent table must have:
- A primary key (used for foreign key reference)
- Columns specified in copy_columns (if used)

## Child Table Requirements

The child table must have:
- A foreign key column (created automatically by GenLogic)
- Columns specified in copy_columns values (if used)
- Columns specified in literals keys (if used)
- No NOT NULL columns without defaults (other than FK and specified columns)

## Copying Values from Parent

Use copy_columns to copy values from parent to child:

```yaml
tables:
  customers:
    columns:
      customer_id: serial primary key
      name: varchar(100)
      email: varchar(100)
      status: varchar(20)

  customer_history:
    foreign_keys:
      customer_id:
        table: customers
        auto_create:
          on: [insert, update]
          copy_columns:
            name: customer_name
            email: customer_email
            status: status_snapshot

    columns:
      history_id: serial primary key
      customer_name: varchar(100)
      customer_email: varchar(100)
      status_snapshot: varchar(20)
      recorded_at: timestamp default NOW()
```

## Setting Constant Values

Use literals to set constant values in created child rows:

```yaml
foreign_keys:
  customer_id:
    table: customers
    auto_create:
      on: [insert]
      copy_columns:
        name: customer_name
      literals:
        record_type: "'customer_created'"
        is_active: "true"
```

Note: Literal values must be valid SQL expressions:
- Strings need single quotes: "'value'"
- Booleans: "true" or "false"
- Numbers: "123" or "123.45"
- NULL: "NULL"

## Conditional Syncing

Use filter to create child rows only when certain conditions are met:

```yaml
foreign_keys:
  order_id:
    table: orders
    auto_create:
      on: [insert]
      copy_columns:
        order_total: amount
      filter: "NEW.order_total > 100"
```

This only creates a child row when the order total exceeds 100.

## Operations

Syncing supports three operations:

INSERT - Creates child row when parent is created:
```yaml
on: [insert]
```
- Child row created with foreign key set to parent's primary key
- copy_columns values copied from parent
- literals values set to constants

UPDATE - Updates child row when parent is updated:
```yaml
on: [update]
```
- Finds child row using OLD foreign key value
- Updates foreign key to NEW primary key value (if PK changed)
- Updates all copy_columns to NEW values
- Literals are NOT updated (they're constants, set only on INSERT)

DELETE - Removes child row when parent is deleted:
```yaml
on: [delete]
```
- Finds child row using OLD foreign key value
- Deletes the child row

Specify multiple operations:
```yaml
on: [insert, update, delete]
```

## Difference from Spread

Sync creates ONE child row per parent row (1:1 relationship).
Spread creates MULTIPLE child rows per parent row (1:many relationship).

Use sync when:
- You need parallel/synchronized tables
- Each parent has exactly one corresponding child
- You're maintaining audit trails or history

Use spread when:
- You need recurring events or time-series data
- Each parent generates multiple children
- You're expanding templates or date ranges

## Restrictions

### Copy Columns Must Exist

Both parent and child columns in copy_columns must exist:

```yaml
# INVALID - parent_col doesn't exist in parent
auto_create:
  copy_columns:
    nonexistent_parent_col: child_col  # Error: parent column doesn't exist
```

```yaml
# INVALID - child_col doesn't exist in child
auto_create:
  copy_columns:
    parent_col: nonexistent_child_col  # Error: child column doesn't exist
```

### Literal Columns Must Exist

Child columns in literals must exist:

```yaml
# INVALID - status doesn't exist in child
auto_create:
  literals:
    nonexistent_column: "'value'"  # Error: child column doesn't exist
```

### Cannot Have Conflicting NOT NULL Constraints

Child table columns (except FK and specified columns) cannot be NOT NULL without defaults:

```yaml
# INVALID
tables:
  parents:
    columns:
      parent_id: serial primary key
      name: varchar(100)

  children:
    foreign_keys:
      parent_id:
        table: parents
        auto_create:
          on: [insert]
          copy_columns:
            name: child_name
    columns:
      child_id: serial primary key
      child_name: varchar(100)
      required_field: varchar(100) not null  # Error: no default, not in copy_columns or literals
```

## Complete Example

```yaml
tables:
  # Master transaction table
  transactions:
    columns:
      transaction_id: serial primary key
      account_id: integer not null
      amount: numeric(10,2) not null
      transaction_type: varchar(20) not null
      description: varchar(200)
      created_at: timestamp default NOW()

  # Automatically synced audit log
  transaction_audit:
    foreign_keys:
      transaction_id:
        table: transactions
        auto_create:
          on: [insert, update, delete]
          copy_columns:
            account_id: audited_account
            amount: audited_amount
            transaction_type: audited_type
            description: audited_description
          literals:
            audit_action: "'CREATED'"
          filter: "NEW.amount > 1000"  # Only audit large transactions

    columns:
      audit_id: serial primary key
      audited_account: integer
      audited_amount: numeric(10,2)
      audited_type: varchar(20)
      audited_description: varchar(200)
      audit_action: varchar(20)
      audit_timestamp: timestamp default NOW()
```

Usage:

```sql
-- Create transaction (amount > 1000, triggers sync)
INSERT INTO transactions (account_id, amount, transaction_type, description)
VALUES (123, 1500.00, 'DEBIT', 'Large withdrawal');

-- Automatically creates row in transaction_audit:
-- audited_account: 123
-- audited_amount: 1500.00
-- audited_type: 'DEBIT'
-- audited_description: 'Large withdrawal'
-- audit_action: 'CREATED'

-- Update transaction
UPDATE transactions SET amount = 1600.00 WHERE transaction_id = 1;

-- Automatically updates transaction_audit:
-- audited_amount: 1600.00 (other copied fields also updated)

-- Delete transaction
DELETE FROM transactions WHERE transaction_id = 1;

-- Automatically deletes corresponding transaction_audit row
```

## Test Coverage

This section lists tests that verify sync features work correctly.

### Validation (Runtime)

Tests that verify GenLogic catches invalid sync configurations:

- [x] [Bad copy_columns parent](../../tests/04-validation/auto-create-copy-bad-parent) - Error when copy_columns references non-existent parent column
- [x] [Bad copy_columns child](../../tests/04-validation/auto-create-copy-bad-child) - Error when copy_columns references non-existent child column
- [x] [Bad literals column](../../tests/04-validation/auto-create-literals-bad-column) - Error when literals references non-existent child column

### Behavior (End-to-End Tests)

Tests that verify sync behavior with actual data:

- [x] [Sync basic](../../tests/06-behavior/auto-create-sync-basic) - Creates, updates, and deletes child rows in sync with parent

---

Previous: [Spreading Parent to Multiple Children](20-spread-to-children.md) | Next: [Schema Validation](../50-integrity-features/01-schema-validation.md)
