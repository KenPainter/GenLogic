import type { GenLogicSchema } from '../types.js';
import type { NewSchema } from '../new-schema.js';

/**
 * Permissions DDL Generator
 *
 * GENLOGIC INTEGRITY: Generate database permissions to protect automated columns
 * Uses column-level UPDATE restrictions combined with SECURITY DEFINER triggers
 */

/**
 * Generate setup SQL for GenLogic admin role
 * This role owns all tables and triggers, allowing SECURITY DEFINER functions to work
 */
export function generateAdminRoleSetup(databaseName: string): string[] {
  const roleName = `${databaseName}_genlogic_admin`;
  const sql: string[] = [];

  sql.push(`-- ========================================`);
  sql.push(`-- GenLogic Role Setup`);
  sql.push(`-- ========================================`);
  sql.push(``);

  // Create admin role (INTEGRITY protection)
  // Fails if user lacks CREATEROLE privilege
  sql.push(`-- Create admin role: ${roleName}`);
  sql.push(`-- This role will own all tables and trigger functions`);
  sql.push(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${roleName}') THEN
    CREATE ROLE ${roleName};
    RAISE NOTICE 'Created admin role: ${roleName}';
  ELSE
    RAISE NOTICE 'Admin role already exists: ${roleName}';
  END IF;
END $$;`);
  sql.push(``);

  // Grant membership to current user so they can transfer ownership
  // This allows the setup user to ALTER TABLE ... OWNER TO admin_role
  sql.push(`-- Grant admin role to current user (setup user)`);
  sql.push(`-- This allows ownership transfers to succeed`);
  sql.push(`GRANT ${roleName} TO CURRENT_USER;`);
  sql.push(``);

  // Grant schema permissions to admin role
  // Required for ownership transfers to succeed
  sql.push(`-- Grant schema permissions to admin role`);
  sql.push(`GRANT ALL ON SCHEMA public TO ${roleName};`);
  sql.push(``);

  return sql;
}

/**
 * Generate setup SQL for GenLogic unprivileged application user
 * This user has normal permissions and will be blocked from updating automated columns
 */
export function generateAppUserSetup(databaseName: string): string[] {
  const appUserName = `${databaseName}_app_user`;
  const sql: string[] = [];

  sql.push(`-- Create unprivileged application user: ${appUserName}`);
  sql.push(`-- This user represents normal application connections`);
  sql.push(`-- It will have PUBLIC permissions but cannot update automated columns`);
  sql.push(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appUserName}') THEN
    CREATE ROLE ${appUserName} WITH LOGIN;
    RAISE NOTICE 'Created application user: ${appUserName}';
  ELSE
    RAISE NOTICE 'Application user already exists: ${appUserName}';
  END IF;
END $$;`);
  sql.push(``);

  return sql;
}

/**
 * Generate ownership changes for all tables and triggers
 * All GenLogic-managed objects must be owned by the admin role
 */
export function generateOwnershipChanges(
  databaseName: string,
  schema: GenLogicSchema,
  newSchema: NewSchema
): string[] {
  const roleName = `${databaseName}_genlogic_admin`;
  const sql: string[] = [];

  if (!schema.tables) return sql;

  sql.push(`-- ========================================`);
  sql.push(`-- Transfer Ownership to Admin Role`);
  sql.push(`-- ========================================`);
  sql.push(``);

  // Set ownership to GenLogic admin role (INTEGRITY protection)
  for (const tableName of Object.keys(schema.tables)) {
    // Table ownership
    sql.push(`-- Table: ${tableName}`);
    sql.push(`ALTER TABLE "${tableName}" OWNER TO ${roleName};`);

    // Trigger function ownership (only for functions that exist)
    const triggerFunctions = [
      `${tableName}_before_insert_genlogic`,
      `${tableName}_after_insert_genlogic`,
      `${tableName}_before_update_genlogic`,
      `${tableName}_after_update_genlogic`,
      `${tableName}_before_delete_genlogic`
    ];

    for (const funcName of triggerFunctions) {
      sql.push(`DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = '${funcName}') THEN
    ALTER FUNCTION ${funcName}() OWNER TO ${roleName};
  END IF;
END $$;`);
    }
  }

  sql.push(``);
  return sql;
}

/**
 * Generate GRANT statements for column-level permissions
 * Users can SELECT/INSERT/DELETE any column, but UPDATE only non-automated columns
 */
export function generateColumnPermissions(
  databaseName: string,
  schema: GenLogicSchema,
  newSchema: NewSchema
): string[] {
  const sql: string[] = [];

  if (!schema.tables) return sql;

  sql.push(`-- ========================================`);
  sql.push(`-- Grant Column-Level Permissions`);
  sql.push(`-- PUBLIC can SELECT/INSERT/DELETE all columns`);
  sql.push(`-- PUBLIC can UPDATE only non-automated columns`);
  sql.push(`-- ========================================`);
  sql.push(``);

  // Grant permissions (INTEGRITY: selective column UPDATE permissions)
  for (const [tableName, table] of Object.entries(schema.tables)) {
    const processedTable = newSchema.tables?.[tableName];
    if (!processedTable || !processedTable.columns) continue;

    // Identify automated columns
    const automatedColumns: string[] = [];
    const userColumns: string[] = [];

    for (const [columnName, column] of Object.entries(processedTable.columns)) {
      if (column.automation || column.formula) {
        automatedColumns.push(columnName);
      } else {
        userColumns.push(columnName);
      }
    }

    sql.push(`-- Table: ${tableName}`);

    // Grant SELECT, INSERT, DELETE (but NOT UPDATE) on table to PUBLIC
    // UPDATE is granted per-column to exclude automated columns
    sql.push(`GRANT SELECT, INSERT, DELETE ON TABLE "${tableName}" TO PUBLIC;`);

    // Grant UPDATE only on non-automated columns
    if (userColumns.length > 0) {
      sql.push(`-- Granting UPDATE on user columns: ${userColumns.join(', ')}`);
      for (const col of userColumns) {
        sql.push(`GRANT UPDATE ("${col}") ON "${tableName}" TO PUBLIC;`);
      }
    }

    if (automatedColumns.length > 0) {
      sql.push(`-- Protected automated columns (no UPDATE): ${automatedColumns.join(', ')}`);
    }

    sql.push(``);
  }

  // Grant USAGE on sequences (for serial columns) - once for all sequences
  sql.push(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO PUBLIC;`);
  sql.push(``);

  return sql;
}

/**
 * Generate all permission SQL
 * Returns array of SQL statements in correct order
 */
export function generatePermissionsDDL(
  databaseName: string,
  schema: GenLogicSchema,
  newSchema: NewSchema
): string[] {
  const sql: string[] = [];

  // Step 1: Create admin role (owns tables/triggers, allows SECURITY DEFINER to work)
  sql.push(...generateAdminRoleSetup(databaseName));

  // Step 2: Create unprivileged application user (for testing and normal app usage)
  sql.push(...generateAppUserSetup(databaseName));

  // Step 3: Transfer ownership to admin role (prevents application users from altering tables)
  sql.push(...generateOwnershipChanges(databaseName, schema, newSchema));

  // Step 4: Grant column-level permissions to PUBLIC (blocks UPDATE on automated columns)
  sql.push(...generateColumnPermissions(databaseName, schema, newSchema));

  return sql;
}
