Previous: [Column Definition Resolution](20-column-definition-resolution.md)

# Definition String Elements

This document catalogs all elements that can appear in
a column definition string and where they are valid.

## Definition String Syntax

A definition string specifies a column's type and
modifiers. GenLogic supports standard SQL syntax plus
FK shorthand:

```yaml
# Standard SQL:
column_name: type [modifiers]

# FK shorthand:
column_name: FK parent_table [fk_modifiers]
```

## Element Reference Table

| Element | Normal | Reusable | FK | Notes |
|---------|--------|----------|-----|-------|
| **Type** | ✅ | ✅ | ❌ | Inferred from parent PK |
| **primary key** | ✅ | ✅ | ❌ | One per table |
| **not null** | ✅ | ✅ | ✅ | Requires value |
| **null** | ✅ | ✅ | ⚠️ | Explicit nullable (rarely needed) |
| **unique** | ✅ | ✅ | ⚠️ | Unique constraint |
| **default** | ✅ | ✅ | ✅ | Default value |
| **check** | ✅ | ✅ | ⚠️ | Inline check constraint |
| **references** | ⚠️ | ⚠️ | ❌ | Use FK shorthand instead |
| **delete action** | ❌ | ❌ | ✅ | ON DELETE behavior |
| **auto create parent** | ❌ | ❌ | ✅ | GenLogic automation |

**Legend:**
- ✅ Commonly used and recommended
- ⚠️ Valid but unusual (may cause confusion)
- ❌ Not applicable or use alternative syntax

## SQL Types

Any valid PostgreSQL type is supported:

**Numeric types:**
```yaml
id: serial
count: integer
amount: numeric(10,2)
price: decimal(8,2)
ratio: real
scientific: double precision
```

**Character types:**
```yaml
code: char(3)
name: varchar(100)
description: text
```

**Date/time types:**
```yaml
birth_date: date
created_at: timestamp
updated_at: timestamp default CURRENT_TIMESTAMP
event_time: timestamptz
```

**Boolean:**
```yaml
is_active: boolean
enabled: bool default true
```

**Other types:**
```yaml
data: jsonb
metadata: json
identifier: uuid
document: bytea
```

## Modifiers

### primary key

Makes the column the primary key. Only one per table.

**Normal columns:**
```yaml
tables:
  users:
    columns:
      user_id: serial primary key
      email: varchar(255)
```

**Reusable columns:**
```yaml
columns:
  id-column: serial primary key

tables:
  users:
    columns:
      user_id: id-column
```

**FK columns:** Not applicable (FKs reference PKs,
they aren't PKs themselves)

### not null

Requires the column to have a value (no NULLs allowed).

**Normal columns:**
```yaml
columns:
  email: varchar(255) not null
```

**Reusable columns:**
```yaml
columns:
  required-email: varchar(255) not null

tables:
  users:
    columns:
      email: required-email
```

**FK columns:**
```yaml
columns:
  customer_id: FK customers not null
  # Required foreign key reference
```

### null

Explicitly marks column as nullable. Rarely needed
since columns are nullable by default.

**Usage:** Only when emphasizing that NULL is allowed
or overriding a reusable definition.

### unique

Adds a unique constraint (no duplicate values allowed).

**Normal columns:**
```yaml
columns:
  email: varchar(255) unique
  ssn: varchar(11) unique not null
```

**Reusable columns:**
```yaml
columns:
  unique-code: varchar(50) unique

tables:
  products:
    columns:
      sku: unique-code
```

**FK columns:** Valid but unusual. Creates unique FK
(one-to-one relationship).

```yaml
# One-to-one: each user has one profile
user_id: FK users unique
```

### default

Specifies a default value for the column.

**Literal values:**
```yaml
status: varchar(20) default 'pending'
quantity: integer default 0
price: numeric(10,2) default 0.00
is_active: boolean default true
```

**SQL expressions:**
```yaml
created_at: timestamp default CURRENT_TIMESTAMP
updated_at: timestamp default NOW()
id: uuid default gen_random_uuid()
```

**With constants:**
```yaml
constants:
  TAX_RATE: 0.0825

tables:
  orders:
    columns:
      tax_rate: numeric(5,4) default ${TAX_RATE}
```

**FK columns:**
```yaml
# Default to a specific parent row:
status_id: FK statuses default 1
region_id: FK regions default ${DEFAULT_REGION}
```

### check

Inline check constraint (validates values).

**Normal columns:**
```yaml
age: integer check (age >= 0 AND age <= 120)
price: numeric(10,2) check (price > 0)
status: varchar(20) check (status IN ('active', 'inactive'))
```

**Reusable columns:**
```yaml
columns:
  positive-amount: numeric(10,2) check (positive-amount > 0)

tables:
  transactions:
    columns:
      amount: positive-amount
```

**FK columns:** Valid but unusual. Typically use
table-level constraints instead.

**Note:** For complex constraints, use table-level
`constraints:` array instead of inline `check`.

### references

Standard SQL foreign key syntax. Valid but GenLogic
provides cleaner FK shorthand.

**Standard SQL (verbose):**
```yaml
customer_id: integer references customers(customer_id)
```

**GenLogic shorthand (preferred):**
```yaml
customer_id: FK customers
```

**Recommendation:** Use FK shorthand instead of
`references`.

## FK Shorthand Syntax

Foreign key columns use special shorthand syntax:

```yaml
column_name: FK parent_table [not null] [default value] [delete action] [auto create parent]
```

### FK parent_table

The core FK syntax. Infers column type from parent's
primary key.

```yaml
tables:
  customers:
    columns:
      customer_id: serial primary key

  orders:
    columns:
      order_id: serial primary key
      customer_id: FK customers
      # Type inferred as integer (from customers.customer_id)
      # Creates FK constraint: fk_orders_customer_id
      # Default ON DELETE RESTRICT
```

### delete action

Specifies what happens when parent row is deleted.

**Options:**
- `delete cascade` - Delete child rows
- `delete restrict` - Prevent parent deletion (default)
- `delete set null` - Set FK to NULL
- `delete set default` - Set FK to default value
- `delete no action` - Same as restrict

**Examples:**
```yaml
# Cascade: delete orders when customer is deleted
customer_id: FK customers delete cascade

# Set null: orphan orders when customer is deleted
customer_id: FK customers delete set null

# Restrict: prevent customer deletion if orders exist
customer_id: FK customers delete restrict
# (or omit - restrict is default)
```

### auto create parent

GenLogic-specific row automation. Automatically creates
missing parent rows during INSERT.

```yaml
# If category doesn't exist, create it:
category_id: FK categories auto create parent

# Combined with other modifiers:
category_id: FK categories not null auto create parent
```

See row automation docs for details.

## Modifier Order

Modifiers can appear in any order, but tests follow
this convention:

1. Type (always first)
2. Structural modifiers (primary key, unique, not null)
3. Default value (always last)

**Conventional order:**
```yaml
email: varchar(255) unique not null
status: varchar(20) not null default 'pending'
price: numeric(10,2) check (price > 0) default 0.00
```

**Also valid (but less readable):**
```yaml
email: varchar(255) not null unique
status: varchar(20) default 'pending' not null
price: numeric(10,2) default 0.00 check (price > 0)
```

**FK modifiers are order-independent:**
```yaml
# All equivalent:
col: FK parents not null default 1 delete cascade
col: FK parents delete cascade not null default 1
col: FK parents default 1 delete cascade not null
```

## Reusable Column Extension

When using reusable columns, you can extend the
definition string:

**Direct use:**
```yaml
columns:
  amount: numeric(10,2)

tables:
  orders:
    columns:
      subtotal: amount
      # Result: "numeric(10,2)"
```

**With extension:**
```yaml
columns:
  amount: numeric(10,2)

tables:
  orders:
    columns:
      # Object form to extend:
      subtotal:
        base: amount
        definition: default 0.00
      # Result: "numeric(10,2) default 0.00"
```

**See:** [Column Definition Resolution](20-column-definition-resolution.md)
for details on reusable column resolution rules.

## Elements That Don't Belong in Definitions

**Calculated columns (formula/automation):**

These use object form, not definition strings:

```yaml
# Formula:
total:
  definition: numeric(10,2)
  formula: "subtotal * 1.0825"

# Automation:
order_count:
  definition: integer
  automation: COUNT orders.id
```

**Comments:**

Use YAML comments, not definition strings:

```yaml
# Customer's primary email address
# Used for order confirmations and notifications
email: varchar(255) not null unique
```

## Examples by Category

### Normal Columns

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      sku: varchar(50) unique not null
      name: varchar(200) not null
      description: text
      price: numeric(10,2) check (price >= 0) default 0.00
      in_stock: boolean default true
      created_at: timestamp default CURRENT_TIMESTAMP
```

### Reusable Columns

```yaml
columns:
  id: serial primary key
  name: varchar(100)
  amount: numeric(10,2)
  timestamp: timestamp default CURRENT_TIMESTAMP

tables:
  customers:
    columns:
      customer_id: id
      customer_name: name

  orders:
    columns:
      order_id: id
      total: amount
      created_at: timestamp
```

### FK Columns

```yaml
tables:
  customers:
    columns:
      customer_id: serial primary key

  orders:
    columns:
      order_id: serial primary key

      # Basic FK:
      customer_id: FK customers

      # Required FK:
      user_id: FK users not null

      # Cascade deletes:
      account_id: FK accounts delete cascade

      # Default FK value:
      status_id: FK statuses default 1

      # Combined:
      region_id: FK regions not null default 1 delete restrict
```

---

Previous: [Column Definition Resolution](20-column-definition-resolution.md)
