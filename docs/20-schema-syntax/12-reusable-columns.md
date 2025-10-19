Previous: [Column Types](11-column-types.md) | Next: [Label, Format, and Comment](13-label-format-comment.md)

# Reusable Column Definitions

Column definitions can be declared once in the top-level `columns` section
 and reused across multiple tables.

## Inheritance Patterns

### Pattern 1: Same-Name Inheritance

Inherit a reusable column using the same column name.

```yaml
columns:
  id: serial primary key
  created_at: timestamptz

tables:
  users:
    columns:
      id:           # Inherits reusable column 'id'
      created_at:   # Inherits reusable column 'created_at'
```

This creates a `users` table with columns `id` and `created_at` using the definitions from the reusable columns.

Both `id:` (empty) and `id: null` work identically.

### Pattern 2: Renamed Inheritance

Inherit a reusable column with a different column name.

```yaml
columns:
  id: serial primary key
  name: varchar(100)

tables:
  users:
    columns:
      user_id: id      # Inherits 'id', names it 'user_id'
      username: name   # Inherits 'name', names it 'username'
```

This creates a `users` table with columns `user_id` and `username` using the definitions from reusable columns `id` and `name`.

### Pattern 3: Override with $ref

Inherit a reusable column and override specific properties.

Overriding the definition completely replaces the definition
in the re-usable column.  This may seem pointless, but it can
be useful when you want other properties of the re-usable
column to be inherited.  These other properties are explained
later in the documentation.

```yaml
columns:
  text_column: varchar(100)

tables:
  articles:
    columns:
      title:
        $ref: text_column
        definition: varchar(200)  # Override size to 200

      summary:
        $ref: text_column         # Use default size of 100
```

This creates an `articles` table where `title` is `varchar(200)` and `summary` is `varchar(100)`.

## Complete Example

```yaml
columns:
  id: serial primary key
  name: varchar(100)
  description: text
  timestamp: timestamptz

tables:
  categories:
    columns:
      category_id: id         # Rename id to category_id
      category_name: name     # Rename name to category_name

  products:
    columns:
      id:                     # use id as id
      product_name: name      # Rename name to product-name
      details: description    # Rename description to details
      created_at: timestamp   # Rename timestamp to created_at
```

## Test Coverage

### Same-Name Inheritance

- [x] [Column inheritance with null](../../tests/05-schema-features/column-inheritance)
- [x] [Column inheritance with empty form](../../tests/05-schema-features/column-inheritance-empty-form)

### Renamed Inheritance

- [x] [SQL definition string in reusable column](../../tests/05-schema-features/sql-type-string-reusable)

### Override with $ref

- [x] [Basic $ref inheritance](../../tests/05-schema-features/ref-inheritance)
- [x] [Override definition](../../tests/05-schema-features/ref-type-override)

---

Previous: [Column Types](11-column-types.md) | Next: [Label, Format, and Comment](13-label-format-comment.md)
