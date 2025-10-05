Previous: [CLI Usage](01-cli-usage.md) | Next: [Documentation Navigation Links](../development/01-navigation-links.md)

# Seed Data

Seed data can be included in schema definitions using `content` sections. The Content Manager handles insertion with idempotent behavior and foreign key resolution.

## Overview

Content sections define seed data that should exist in the database:
- Inserts data only if it doesn't already exist
- Resolves foreign key references using $lookup
- Validates content before insertion
- Handles complex data types including JSON

## Basic Usage

### Simple Content Definition

```yaml
tables:
  categories:
    columns:
      id: { type: integer, primary_key: true, sequence: true }
      name: { type: varchar, size: 100, unique: true }
      description: { type: text }
    content:
      - name: Electronics
        description: Electronic devices and accessories
      - name: Books
        description: Books and publications
      - name: Clothing
        description: Apparel and accessories
```

### Content with Primary Keys

When providing explicit primary keys:

```yaml
tables:
  roles:
    columns:
      id: { type: integer, primary_key: true }
      name: { type: varchar, size: 50, unique: true }
      permissions: { type: jsonb }
    content:
      - id: 1
        name: admin
        permissions: { read: true, write: true, delete: true }
      - id: 2
        name: user
        permissions: { read: true, write: false, delete: false }
```

## Foreign Key Resolution with $lookup

### Basic $lookup

Reference data from other tables using $lookup:

```yaml
tables:
  accounts:
    columns:
      id: { type: integer, primary_key: true, sequence: true }
      account_code: { type: varchar, size: 20, unique: true }
      name: { type: varchar, size: 100 }
    content:
      - account_code: CASH
        name: Cash Account
      - account_code: REVENUE
        name: Revenue Account

  transactions:
    columns:
      id: { type: integer, primary_key: true, sequence: true }
      account_id: { type: integer }
      amount: { type: numeric }
      description: { type: text }
    foreign_keys:
      account:
        table: accounts
    content:
      - account_id:
          $lookup:
            table: accounts
            where: { account_code: CASH }
            column: id
        amount: 1000.00
        description: Initial cash deposit
```

### Complex $lookup with Multiple Conditions

```yaml
content:
  - user_id:
      $lookup:
        table: users
        where:
          email: admin@example.com
          active: true
        column: id
    role_id:
      $lookup:
        table: roles
        where: { name: admin }
        column: id
```

## Data Types

### Supported Value Types

```yaml
content:
  # String values
  - name: "John's Shop"  # Single quotes are escaped automatically

  # Numeric values
  - price: 99.99
    quantity: 10

  # Boolean values
  - active: true
    archived: false

  # NULL values
  - optional_field: null

  # Date/time values
  - created_at: '2024-01-15T10:30:00Z'

  # JSON/JSONB values
  - metadata:
      tags: [urgent, important]
      properties:
        color: blue
        size: large
```

## Conflict Resolution

### Primary Key Conflicts

Content with primary keys uses `ON CONFLICT DO NOTHING`:

```yaml
tables:
  settings:
    columns:
      key: { type: varchar, size: 50, primary_key: true }
      value: { type: text }
    content:
      - key: site_name
        value: My Application
      - key: maintenance_mode
        value: 'false'
```

SQL Generated:
```sql
INSERT INTO settings (key, value)
VALUES ('site_name', 'My Application')
ON CONFLICT (key) DO NOTHING;
```

### Unique Column Conflicts

When primary key is auto-generated, unique columns are used:

```yaml
tables:
  users:
    columns:
      id: { type: integer, primary_key: true, sequence: true }
      email: { type: varchar, size: 255, unique: true }
      name: { type: varchar, size: 100 }
    content:
      - email: admin@example.com
        name: Administrator
```

SQL Generated:
```sql
INSERT INTO users (email, name)
VALUES ('admin@example.com', 'Administrator')
ON CONFLICT (email) DO NOTHING;
```

## Validation

### Column Validation

The Content Manager validates:
- All referenced columns exist in the table
- Required columns are provided (except sequences)
- Data types are compatible

### $lookup Validation

For $lookup references, it validates:
- Target table exists
- Target column exists
- Where clause columns exist

### Error Messages

```yaml
# Invalid column reference
content:
  - nonexistent_column: value  # Error: column doesn't exist

# Invalid $lookup
content:
  - user_id:
      $lookup:
        table: nonexistent_table  # Error: table doesn't exist
        where: { id: 1 }
        column: id
```

## Execution Order

Content is inserted after all schema changes:

1. Create/modify tables
2. Create/modify columns
3. Create foreign keys
4. Create triggers
5. **Insert content** (last)

This ensures all schema elements exist before data insertion.

## Best Practices

### 1. Use Unique Identifiers

Define unique business keys for reliable conflict resolution:

```yaml
columns:
  code: { type: varchar, size: 20, unique: true }
  name: { type: varchar, size: 100 }
content:
  - code: USD
    name: US Dollar
  - code: EUR
    name: Euro
```

### 2. Order Dependencies

List tables with no dependencies first:

```yaml
tables:
  # Define parent tables first
  categories:
    content: [...]

  # Then child tables with foreign keys
  products:
    foreign_keys:
      category: { table: categories }
    content: [...]
```

### 3. Use $lookup for References

Avoid hardcoding IDs:

```yaml
# Bad: Hardcoded ID
content:
  - category_id: 1  # What if ID changes?

# Good: Use $lookup
content:
  - category_id:
      $lookup:
        table: categories
        where: { name: Electronics }
        column: id
```

### 4. Keep Content Minimal

Only include essential seed data:
- System configuration
- Reference data (countries, currencies)
- Default users/roles
- Initial categories/types

## Advanced Features

### Conditional Content

Use different content for different environments:

```yaml
# development.yaml
content:
  - email: test@example.com
    name: Test User

# production.yaml
content:
  - email: admin@company.com
    name: System Administrator
```

### Generated Values

Combine static and dynamic values:

```yaml
content:
  - code: "INIT-001"
    description: "Initial setup"
    created_at: '2024-01-01T00:00:00Z'
    metadata:
      version: "1.0.0"
      environment: "production"
```

## Troubleshooting

### Content Not Inserting

1. Check for validation errors in output
2. Verify columns exist (including generated FK columns)
3. Check for unique/PK conflicts
4. Review PostgreSQL logs for constraint violations

### $lookup Returns NULL

1. Verify target record exists
2. Check where clause conditions
3. Ensure column names are correct
4. Test the lookup query manually

### Performance Issues

1. Create indexes on lookup columns
2. Batch content into smaller chunks
3. Use COPY for large datasets
4. Consider loading data outside schema processing

## Integration Examples

### Multi-tenant Setup

```yaml
tables:
  tenants:
    columns:
      id: { type: integer, primary_key: true, sequence: true }
      code: { type: varchar, size: 20, unique: true }
      name: { type: varchar, size: 100 }
    content:
      - code: DEFAULT
        name: Default Tenant

  users:
    columns:
      id: { type: integer, primary_key: true, sequence: true }
      tenant_id: { type: integer }
      email: { type: varchar, size: 255 }
    foreign_keys:
      tenant: { table: tenants }
    content:
      - tenant_id:
          $lookup:
            table: tenants
            where: { code: DEFAULT }
            column: id
        email: admin@example.com
```

---

Previous: [CLI Usage](01-cli-usage.md) | Next: [Documentation Navigation Links](../development/01-navigation-links.md)
