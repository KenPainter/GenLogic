Previous: [Numeric Integrity](20-numeric-integrity.md) | Next: [Additive Changes Only](40-additive-changes.md)

# Calculation Integrity Protection

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

GenLogic makes calculated columns non-subvertible - they cannot be corrupted by external updates. Protection is enforced through:

1. BEFORE INSERT triggers - Reset automated columns to NULL on insert
2. Column-level permissions - Revoke UPDATE permission on automated columns
3. SECURITY DEFINER triggers - GenLogic's own triggers run with elevated privileges

## Technical Approach

Why this specific implementation?

PostgreSQL's GENERATED columns would seem like a natural fit, but they have critical limitations:
- GENERATED ALWAYS columns cannot reference other tables (no SUM, COUNT across tables)
- GENERATED ALWAYS columns cannot reference other GENERATED ALWAYS columns
- Cannot be used for aggregations from child tables
- Limited to row-level expressions only

GenLogic's trigger + permissions approach provides:
- Full cross-table automation (SUM from child tables, SYNC from parent tables)
- Dynamic recalculation when source data changes
- Protection through both INSERT reset and UPDATE denial
- Explicit permission model that's auditable in pg_catalog

The two-user model separates concerns:
- Setup user (privileged) creates schema and security infrastructure
- Application user (restricted) cannot corrupt calculated values
- SECURITY DEFINER allows triggers to update protected columns

This provides the same non-subvertibility as GENERATED columns while supporting cross-table automation.

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

Behavior:

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

Behavior:

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

All calculated columns are protected, regardless of how the calculation is defined:

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

All automation types are protected:
- SUM - Aggregate sum from child table
- COUNT - Count rows in child table
- MAX - Maximum value from child table
- MIN - Minimum value from child table
- LAST_VALUE - Most recent value from child table
- SNAPSHOT - Point-in-time copy from parent table
- SYNC - Always-current copy from parent table

### Formula Columns

Columns with `formula` property are protected:

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

- BEFORE INSERT protection: `src/trigger-generator.ts` - `generateAutomatedColumnProtection()`
- Column permissions: `src/permissions-generator.ts` - `generateColumnPermissions()`
- SECURITY DEFINER: `src/trigger-generator.ts` - trigger function generation
- Automated column detection: `src/trigger-generator.ts` - `getAutomatedColumns()`

## Database Setup Requirements

The setup user must have `CREATEROLE` privilege:

```sql
ALTER ROLE setup_user CREATEROLE;
```

Without this privilege, GenLogic cannot create the admin role or set up proper permissions.

See [Database Connections](../../ai-docs/database-connections.md) for more details on the two-user model.

## Security Guarantees

With this system in place:

1. Applications cannot directly insert calculated values
2. Applications cannot directly update calculated values
3. GenLogic triggers can maintain calculated values
4. Calculated values always reflect their formulas
5. No possibility of calculated column corruption

Users can rely on automated columns with the same confidence as PRIMARY KEY or FOREIGN KEY constraints.

## Test Coverage

This feature is verified by:

- [x] [Formula Insert Protection](../../tests/06-behavior/formula-insert-protection)
  - Formula columns calculated on INSERT
  - BEFORE INSERT trigger resets formula columns to NULL
  - Application cannot override formula values on INSERT

- [x] [Formula Update Protection](../../tests/06-behavior/formula-update-protection)
  - Application cannot UPDATE formula columns (permission denied)
  - Column-level UPDATE permission is revoked for formula columns

- [x] [Automation Insert Protection](../../tests/06-behavior/automation-insert-protection)
  - Automation columns initialized correctly on INSERT
  - BEFORE INSERT trigger resets automation columns to NULL
  - Application cannot override automation values on INSERT
  - Correct SUM calculated from child table data

- [x] [Calculated Columns Update](../../tests/06-behavior/calculated-columns-update)
  - Formula columns recalculated when source columns change
  - Changes to source columns trigger recalculation via BEFORE UPDATE trigger

- [x] [Automations SUM](../../tests/06-behavior/automations-sum)
  - SUM automation calculates correctly
  - Values update when child rows change via child table triggers

- [x] [Automations SYNC](../../tests/06-behavior/automations-sync)
  - SYNC automation copies parent values
  - Values update when parent changes

- [x] [SNAPSHOT FK Change](../../tests/06-behavior/snapshot-fk-change)
  - SNAPSHOT captures point-in-time values
  - Values don't change when parent changes

---

Previous: [Numeric Integrity](20-numeric-integrity.md) | Next: [Additive Changes Only](40-additive-changes.md)
