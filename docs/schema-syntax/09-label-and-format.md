Previous: [Indexes and Unique Constraints](08-indexes-and-constraints.md) | Next: [Seed Data](02-seed-data.md)

# Label and Format

GenLogic provides `label` and `format` properties for columns to enhance UI generation and display.

## Overview

- **label**: Human-readable label for UI display
- **format**: Format hint for UI rendering (e.g., 'currency', 'date', 'email', 'phone')
- Both are optional metadata that don't affect database structure
- Both **automatically propagate** through foreign keys and SYNC/SNAPSHOT automations

## Basic Usage

```yaml
columns:
  email:
    type: varchar(255)
    label: Email Address
    format: email

tables:
  products:
    columns:
      id: serial primary key
      name:
        type: varchar(200) not null
        label: Product Name
      price:
        type: numeric(10,2) not null
        label: Unit Price
        format: currency
      created_at:
        type: timestamp not null default now()
        label: Date Created
        format: datetime
```

## Automatic Propagation Through Foreign Keys

When you create a foreign key, label and format automatically follow from the referenced primary key column:

```yaml
tables:
  users:
    columns:
      id:
        type: serial primary key
        label: User ID
        format: id
      name: varchar(100) not null

  orders:
    columns:
      id: serial primary key
      # Foreign key automatically gets label "User ID" and format "id"
    foreign_keys:
      user_id: users
```

The generated `user_id` column in `orders` will have:
- type: integer (copied from users.id)
- label: "User ID" (copied from users.id)
- format: "id" (copied from users.id)

## Automatic Propagation Through SYNC/SNAPSHOT

Label and format also propagate through SYNC and SNAPSHOT automations:

```yaml
tables:
  accounts:
    columns:
      id: serial primary key
      balance:
        type: numeric(10,2) not null default 0
        label: Account Balance
        format: currency

  transactions:
    columns:
      id: serial primary key
      amount:
        type: numeric(10,2) not null
        label: Transaction Amount
        format: currency
    foreign_keys:
      account_id: accounts

  ledger:
    columns:
      id: serial primary key
      # SNAPSHOT: Gets label and format from transactions.amount
      transaction_amount:
        type: numeric(10,2)
        automation: SNAPSHOT @transactions.amount
        # Automatically gets:
        # label: "Transaction Amount"
        # format: "currency"
    foreign_keys:
      transaction_id: transactions
```

## Overriding Propagated Values

You can override label and format on FK columns or automation columns:

```yaml
tables:
  users:
    columns:
      id:
        type: serial primary key
        label: User ID
        format: id

  orders:
    columns:
      id: serial primary key
      # Override the label while keeping the type
      user_id:
        label: Customer  # Overrides "User ID"
        format: id       # Could override this too, or omit to keep original
    foreign_keys:
      user_id: users
```

**Note**: When overriding, you're defining an explicit column that matches the FK-generated column name. The override completely replaces the label/format.

## Reusable Columns

Label and format work with reusable column definitions:

```yaml
columns:
  currency_field:
    type: numeric(10,2) not null default 0
    label: Amount
    format: currency

  email_field:
    type: varchar(255) not null
    label: Email Address
    format: email

tables:
  products:
    columns:
      id: serial primary key
      price: currency_field  # Inherits label "Amount" and format "currency"

  customers:
    columns:
      id: serial primary key
      email: email_field     # Inherits label "Email Address" and format "email"
```

## Format Values

Common format values (not enforced by GenLogic, but recommended conventions):

- `currency` - Monetary values (e.g., $1,234.56)
- `date` - Date only (e.g., 2024-01-15)
- `datetime` - Date and time (e.g., 2024-01-15 14:30:00)
- `time` - Time only (e.g., 14:30:00)
- `email` - Email addresses
- `phone` - Phone numbers
- `url` - URLs
- `id` - ID values (can hide from forms, show in compact format)
- `percent` - Percentage values
- `markdown` - Markdown text
- `json` - JSON data
- `uuid` - UUID values

Use format values that make sense for your UI framework.

## When to Use

Use `label` and `format` when:

1. **Building UIs**: Your UI generation tool can use these to create better forms and displays
2. **Documentation**: They serve as self-documentation for what columns represent
3. **Consistency**: They propagate through relationships, ensuring consistent labeling
4. **Multi-table views**: When joining tables, you know which column is which

Don't use them if:
- You're not building a UI from the schema
- You prefer to manage labels in your application code
- You want complete separation between schema and presentation

## Example: Complete E-commerce Schema

```yaml
columns:
  currency:
    type: numeric(10,2) not null default 0
    format: currency

tables:
  products:
    columns:
      id:
        type: serial primary key
        label: Product ID
        format: id
      name:
        type: varchar(200) not null
        label: Product Name
      price:
        $ref: currency
        label: Unit Price
      created_at:
        type: timestamp not null default now()
        label: Created
        format: datetime

  orders:
    columns:
      id:
        type: serial primary key
        label: Order ID
        format: id
      order_date:
        type: timestamp not null default now()
        label: Order Date
        format: datetime
      total:
        $ref: currency
        label: Order Total
    foreign_keys:
      # Gets label "Product ID" and format "id" automatically
      product_id: products

  order_items:
    columns:
      id:
        type: serial primary key
        label: Item ID
        format: id
      quantity:
        type: integer not null
        label: Quantity
      item_total:
        $ref: currency
        label: Item Total
    foreign_keys:
      order_id: orders      # Gets "Order ID" / "id"
      product_id: products  # Gets "Product ID" / "id"
```

## Summary

- `label` and `format` are optional UI metadata
- They automatically propagate through foreign keys
- They automatically propagate through SYNC/SNAPSHOT automations
- You can override them on a per-column basis
- They work seamlessly with reusable column definitions
- Use them to improve UI generation and schema documentation

---

Previous: [Indexes and Unique Constraints](08-indexes-and-constraints.md) | Next: [Seed Data](02-seed-data.md)
