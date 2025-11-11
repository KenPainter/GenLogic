# 4A2: String Concatenation Formulas

Tests string manipulation in formula columns.
Covers: concatenation, UPPER, LOWER, substring operations.

## Build Schema

```yaml
tables:
  customers:
    columns:
      customer_id: serial primary key
      first_name: varchar(50)
      last_name: varchar(50)
      email_domain: varchar(100)

      # Formula: Full name concatenation
      full_name:
        definition: varchar(150)
        formula: "first_name || ' ' || last_name"

      # Formula: Email address
      email:
        definition: varchar(200)
        formula: "LOWER(first_name || '.' || last_name || '@' || email_domain)"

      # Formula: Initials
      initials:
        definition: varchar(5)
        formula: "UPPER(SUBSTRING(first_name, 1, 1) || SUBSTRING(last_name, 1, 1))"
```

## Insert Customer

```sql
INSERT INTO customers (first_name, last_name, email_domain)
VALUES ('John', 'Smith', 'example.com');
```

## Verify String Formulas

```sql
SELECT first_name, last_name, full_name, email, initials
FROM customers;
```

```json
[
  {
    "first_name": "John",
    "last_name": "Smith",
    "full_name": "John Smith",
    "email": "john.smith@example.com",
    "initials": "JS"
  }
]
```

## Insert Multiple Customers

```sql
INSERT INTO customers (first_name, last_name, email_domain)
VALUES
  ('Mary', 'Johnson', 'techcorp.io'),
  ('Robert', 'Williams', 'startup.co'),
  ('Patricia', 'Brown', 'example.com');
```

## Verify All Customers

```sql
SELECT first_name, last_name, full_name, email, initials
FROM customers
ORDER BY customer_id;
```

```json
[
  {
    "first_name": "John",
    "last_name": "Smith",
    "full_name": "John Smith",
    "email": "john.smith@example.com",
    "initials": "JS"
  },
  {
    "first_name": "Mary",
    "last_name": "Johnson",
    "full_name": "Mary Johnson",
    "email": "mary.johnson@techcorp.io",
    "initials": "MJ"
  },
  {
    "first_name": "Robert",
    "last_name": "Williams",
    "full_name": "Robert Williams",
    "email": "robert.williams@startup.co",
    "initials": "RW"
  },
  {
    "first_name": "Patricia",
    "last_name": "Brown",
    "full_name": "Patricia Brown",
    "email": "patricia.brown@example.com",
    "initials": "PB"
  }
]
```

## Update Name

```sql
UPDATE customers
SET first_name = 'Pat', last_name = 'Brown-Smith'
WHERE first_name = 'Patricia';
```

## Verify Formulas Recalculated

```sql
SELECT first_name, last_name, full_name, email, initials
FROM customers
WHERE last_name = 'Brown-Smith';
```

```json
[
  {
    "first_name": "Pat",
    "last_name": "Brown-Smith",
    "full_name": "Pat Brown-Smith",
    "email": "pat.brown-smith@example.com",
    "initials": "PB"
  }
]
```

## Update Email Domain

```sql
UPDATE customers
SET email_domain = 'newdomain.net'
WHERE full_name = 'Mary Johnson';
```

## Verify Email Updated

```sql
SELECT full_name, email_domain, email
FROM customers
WHERE full_name = 'Mary Johnson';
```

```json
[
  {
    "full_name": "Mary Johnson",
    "email_domain": "newdomain.net",
    "email": "mary.johnson@newdomain.net"
  }
]
```
