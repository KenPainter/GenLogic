Previous: [Numeric Integrity](20-numeric-integrity.md) | Next: [Additive Changes Only](40-additive-changes.md)

# Non-Subvertible Calculated Columns

GenLogic provides automated and formula columns that are automatically maintained by the database. To ensure data integrity, these calculated values must be protected from direct modification by application code.

## The Problem

Without protection, applications could corrupt calculated values:

```sql
-- BAD: Application directly sets automated column
UPDATE accounts SET balance = 999999
WHERE account_id = 1;
-- Balance should be SUM of transactions, not arbitrary value!
```

This breaks the fundamental guarantee that automated columns reflect their formulas.

## GenLogic's Solution

GenLogic makes calculated columns **non-subvertible** - they cannot be corrupted by external updates. Protection is enforced through:

1. **BEFORE INSERT triggers** - Reset automated columns to NULL on insert
2. **Column-level permissions** - Revoke UPDATE permission on automated columns
3. **SECURITY DEFINER triggers** - GenLogic's own triggers run with elevated privileges

## Two-User Model

GenLogic uses a two-user security model:

### Setup User (Privileged)

- Has `CREATEROLE` privilege
- Runs GenLogic CLI to create/modify schema
- Creates the application user
- Creates admin role: `<database_name>_genlogic_admin`
- Not used by applications

### Application User (Restricted)

- Created by GenLogic during setup
- Has restricted permissions on automated columns
- Cannot UPDATE automated columns
- Used by your application code

## How It Works

### INSERT Protection

BEFORE INSERT triggers reset all automated columns to NULL:

```sql
CREATE OR REPLACE FUNCTION accounts_before_insert_genlogic()
RETURNS TRIGGER AS $$
BEGIN
  -- Reset automated columns to NULL
  NEW.balance := NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Behavior:**

```sql
-- Application tries to set balance
INSERT INTO accounts (account_name, balance)
VALUES ('Checking', 999999);

-- BEFORE INSERT trigger resets balance to NULL
-- AFTER INSERT trigger calculates correct balance from transactions
-- Result: balance = correct SUM, not 999999
```

### UPDATE Protection

Column-level UPDATE permissions are revoked:

```sql
REVOKE UPDATE (balance) ON accounts FROM app_user;
```

**Behavior:**

```sql
-- Application tries to update balance
UPDATE accounts SET balance = 999999 WHERE account_id = 1;
-- ERROR: permission denied for column "balance"
```

### Trigger Privileges

GenLogic triggers use `SECURITY DEFINER` and run as the admin role:

```sql
CREATE TRIGGER accounts_after_insert_genlogic
  AFTER INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION accounts_after_insert_genlogic();

-- Function definition includes SECURITY DEFINER
CREATE OR REPLACE FUNCTION accounts_after_insert_genlogic()
RETURNS TRIGGER AS $$
BEGIN
  -- This runs with admin privileges
  -- Can UPDATE balance even though app_user cannot
  UPDATE accounts SET balance = (
    SELECT COALESCE(SUM(amount), 0)
    FROM transactions
    WHERE account_id = NEW.account_id
  )
  WHERE account_id = NEW.account_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

This allows GenLogic's triggers to update automated columns while preventing application code from doing so.

## What Gets Protected

### Automated Columns

Columns with `automation` property are protected:

```yaml
tables:
  accounts:
    columns:
      balance:
        definition: numeric(10,2)
        automation: SUM @transactions.amount  # PROTECTED
```

Automation types:
- SUM
- COUNT
- MAX
- MIN
- LAST_VALUE
- SNAPSHOT
- SYNC

### Generated Columns

Columns with `generated` property are protected:

```yaml
tables:
  orders:
    columns:
      total:
        definition: numeric(10,2)
        formula: "@subtotal + @tax"  # PROTECTED
```

## Implementation Details

See the GenLogic codebase for implementation:

- **BEFORE INSERT protection**: `src/trigger-generator.ts` - `generateAutomatedColumnProtection()`
- **Column permissions**: `src/permissions-generator.ts` - `generateColumnPermissions()`
- **SECURITY DEFINER**: `src/trigger-generator.ts` - trigger function generation
- **Automated column detection**: `src/trigger-generator.ts` - `getAutomatedColumns()`

## Database Setup Requirements

The setup user must have `CREATEROLE` privilege:

```sql
ALTER ROLE setup_user CREATEROLE;
```

Without this privilege, GenLogic cannot create the admin role or set up proper permissions.

See [Database Connections](../../ai-docs/database-connections.md) for more details on the two-user model.

## Security Guarantees

With this system in place:

1. Applications **cannot** directly insert calculated values
2. Applications **cannot** directly update calculated values
3. GenLogic triggers **can** maintain calculated values
4. Calculated values **always** reflect their formulas
5. No possibility of calculated column corruption

Users can rely on automated columns with the same confidence as PRIMARY KEY or FOREIGN KEY constraints.

---

Previous: [Numeric Integrity](20-numeric-integrity.md) | Next: [Additive Changes Only](40-additive-changes.md)
