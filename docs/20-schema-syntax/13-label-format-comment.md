Previous: [Indexes and Unique Constraints](08-indexes-and-constraints.md) | Next: [Seed Data](10-seed-data.md)

# Label, Format, and Comment

GenLogic provides optional metadata properties for tables and 
columns: `label`, `format`, and `comment`. 
## Properties

### label

Human-readable label for UI display.  These are purely suggestive
for the UI, and appear in the [Resolved Schema](../features/90-resolved-schema.md)

```yaml
tables:
  products:
    columns:
      name:
        definition: varchar(200) not null
        label: Product Name
      price:
        definition: numeric(10,2) not null
        label: Unit Price
```

### format

Format hint for UI rendering.  These are purely suggestive
for the UI, and appear in the [Resolved Schema](../features/90-resolved-schema.md)

```yaml
tables:
  products:
    columns:
      price:
        definition: numeric(10,2) not null
        label: Unit Price
        format: currency
      email:
        definition: varchar(255)
        label: Email Address
        format: email
```

### comment

Documentation text stored in PostgreSQL database metadata via `COMMENT ON TABLE` and `COMMENT ON COLUMN`.

These also serve as comments within the schema YAML file.

```yaml
tables:
  users:
    comment: User accounts and profiles
    columns:
      id:
        definition: serial primary key
        comment: Primary key identifier
      email:
        definition: varchar(255)
        comment: User email address
```

## Inheritance

All three properties inherit via `$ref` (see [Reusable Columns](12-reusable-columns.md)).

Additionally, `label` and `format` automatically propagate:
- Through foreign keys from the referenced primary key 
  column - see [Foreign Keys](./20-foreign-keys.md)
- Through SYNC and SNAPSHOT automations from the source 
  column - see [Parent to Child Copies](./30-parent-to-child.md)

The `comment` property does not propagate automatically.

## Example

```yaml
columns:
  currency:
    definition: numeric(10,2) not null default 0
    label: Amount
    format: currency
    comment: Currency value with 2 decimal places

tables:
  products:
    comment: Product catalog
    columns:
      id:
        definition: serial primary key
        label: Product ID
        format: id
        comment: Unique product identifier
      name:
        definition: varchar(200) not null
        label: Product Name
        comment: Display name for product
      price:
        $ref: currency
        label: Unit Price

  orders:
    comment: Customer orders
    columns:
      id:
        definition: serial primary key
        label: Order ID
        format: id
      total:
        $ref: currency
        label: Order Total
    foreign_keys:
      product_id: products  # Inherits label "Product ID" and format "id"
```

## Test Coverage

### Label and Format

- [x] [Label and format basic usage](../../tests/05-schema-features/label-and-format)
- [x] [Label and format in reusable columns](../../tests/05-schema-features/label-format-reusable)
- [x] [Label and format propagation through FK](../../tests/05-schema-features/label-format-fk)
- [x] [Label and format override with $ref](../../tests/05-schema-features/ref-label-format-override)

### Comment

- [x] [Comment on table](../../tests/05-schema-features/comment-table)
- [x] [Comment on column](../../tests/05-schema-features/comment-column)
- [x] [Comment on foreign key](../../tests/05-schema-features/comment-fk)

---

Previous: [Indexes and Unique Constraints](08-indexes-and-constraints.md) | Next: [Seed Data](10-seed-data.md)
