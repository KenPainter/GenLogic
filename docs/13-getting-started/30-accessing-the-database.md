# Accessing the Database

## Application User Privileges

After GenLogic builds the database, application code connects as a normal unprivileged user.

Create an application user:

```bash
sudo -u postgres psql -c "CREATE ROLE myapp_user WITH LOGIN PASSWORD 'secret';"
```

GenLogic configures column-level permissions so application users can:
- SELECT from all tables
- INSERT into all tables
- DELETE from all tables
- UPDATE non-automated columns

Application users cannot:
- UPDATE automated or formula columns (permission denied)
- Disable triggers (do not own tables)
- Modify trigger code (do not own functions)
- DROP or ALTER tables

## Why This Prevents Subverting Calculations

Triggers are created SECURITY DEFINER and owned by `<database_name>_genlogic_admin`.

When application code performs DML:
1. Application user has no privilege to UPDATE automated columns directly
2. Triggers fire with admin privileges regardless of invoking user
3. Triggers cannot be disabled or modified by application user
4. Automated column values are calculated correctly

This separation ensures calculated values cannot be corrupted by application code or malicious clients.

## Connection String Example

Application connects as unprivileged user:

```javascript
const pool = new Pool({
  host: 'localhost',
  database: 'myapp',
  user: 'myapp_user',
  password: 'secret'
});
```

Do not connect as the privileged user (database owner) for regular application operations.

## Testing Permissions

Verify application user cannot UPDATE automated columns:

```sql
-- This succeeds (non-automated column)
UPDATE products SET name = 'New Name' WHERE product_id = 1;

-- This fails with permission denied (automated column)
UPDATE customers SET order_count = 999 WHERE customer_id = 1;
```

The automated column is updated only by triggers, which execute with admin privileges.
