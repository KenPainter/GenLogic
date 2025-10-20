Previous: [Pattern Matching Tables](10-matching-tables.md) | Next: [Introduction](../70-integrity-features/00-introduction.md)

# Seed Data

Seed data can be included in schema definitions using `seed-rows` sections. The Content Manager handles insertion with idempotent behavior and foreign key resolution.

## Overview

Seed-rows sections define seed data that should exist in the database:
- Inserts data only if it doesn't already exist
- Resolves foreign key references using $lookup
- Validates seed data before insertion
- Handles complex data types including JSON

## Basic Usage

### Simple Seed Data Definition

```yaml
tables:
  categories:
    columns:
      id: serial primary key
      name: varchar(100) unique
      description: text
    seed-rows:
      - name: Electronics
        description: Electronic devices and accessories
      - name: Books
        description: Books and publications
      - name: Clothing
        description: Apparel and accessories
```

### Seed Data with Primary Keys

When providing explicit primary keys:

```yaml
tables:
  roles:
    columns:
      id: integer primary key
      name: varchar(50) unique
      permissions: jsonb
    seed-rows:
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
      id: serial primary key
      account_code: varchar(20) unique
      name: varchar(100)
    seed-rows:
      - account_code: CASH
        name: Cash Account
      - account_code: REVENUE
        name: Revenue Account

  transactions:
    columns:
      id: serial primary key
      account_id: integer
      amount: numeric
      description: text
    foreign_keys:
      account: accounts
    seed-rows:
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
seed-rows:
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
seed-rows:
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
      key: varchar(50) primary key
      value: text
    seed-rows:
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
      id: serial primary key
      email: varchar(255) unique
      name: varchar(100)
    seed-rows:
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

### $lookup Validation

For $lookup references, it validates:
- Target table exists
- Target column exists
- Where clause columns exist

### Error Messages

```yaml
# Invalid column reference
seed-rows:
  - nonexistent_column: value  # Error: column doesn't exist

# Invalid $lookup
seed-rows:
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
  code: varchar(20) unique
  name: varchar(100)
seed-rows:
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
    seed-rows: [...]

  # Then child tables with foreign keys
  products:
    foreign_keys:
      category: { table: categories }
    seed-rows: [...]
```

### 3. Use $lookup for References

Avoid hardcoding IDs:

```yaml
# Bad: Hardcoded ID
seed-rows:
  - category_id: 1  # What if ID changes?

# Good: Use $lookup
seed-rows:
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
seed-rows:
  - email: test@example.com
    name: Test User

# production.yaml
seed-rows:
  - email: admin@company.com
    name: System Administrator
```

### Generated Values

Combine static and dynamic values:

```yaml
seed-rows:
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
      id: serial primary key
      code: varchar(20) unique
      name: varchar(100)
    seed-rows:
      - code: DEFAULT
        name: Default Tenant

  users:
    columns:
      id: serial primary key
      tenant_id: integer
      email: varchar(255)
    foreign_keys:
      tenant: tenants
    seed-rows:
      - tenant_id:
          $lookup:
            table: tenants
            where: { code: DEFAULT }
            column: id
        email: admin@example.com
```

## Test Coverage

This section lists tests that verify seed data features work correctly.

### Validation (Runtime)

These tests verify that GenLogic catches invalid seed data definitions:

- [x] [Non-existent column](../../tests/04-validation/seed-data-nonexistent-column) - Error when seed data references non-existent column
- [x] [$lookup to non-existent table](../../tests/04-validation/seed-data-lookup-nonexistent-table) - Error when $lookup references non-existent table
- [x] [$lookup to non-existent column](../../tests/04-validation/seed-data-lookup-nonexistent-column) - Error when $lookup where clause references non-existent column
- [x] [Missing required PK](../../tests/04-validation/seed-data-missing-pk) - Error when seed data missing required non-serial PK value

### Behavior (End-to-End Tests)

These tests verify seed data behavior with actual database insertion:

- [x] [Basic seed data insertion](../../tests/06-behavior/content-seed-data) - seed-rows with static data
- [x] [$lookup basic functionality](../../tests/06-behavior/seed-data-lookup) - Foreign key resolution using $lookup
- [x] [$lookup with multiple where conditions](../../tests/06-behavior/seed-data-lookup-multiple) - $lookup with multiple where conditions
- [x] [Unique column conflict resolution](../../tests/06-behavior/seed-data-unique-conflict) - ON CONFLICT using unique columns
- [x] [JSON/JSONB data](../../tests/06-behavior/seed-data-json) - JSON and JSONB value insertion
- [x] [Boolean and NULL values](../../tests/06-behavior/seed-data-bool-null) - Boolean and NULL value handling
- [x] [Idempotent behavior](../../tests/06-behavior/seed-data-idempotent) - ON CONFLICT DO NOTHING prevents duplicates
- [x] [Serial column omission](../../tests/06-behavior/seed-data-serial) - Auto-generated serial primary keys
- [x] [Date/time and string escaping](../../tests/06-behavior/seed-data-dates-strings) - Date, timestamp, and quote escaping

---

Previous: [Pattern Matching Tables](10-matching-tables.md) | Next: [Introduction](../70-integrity-features/00-introduction.md)
