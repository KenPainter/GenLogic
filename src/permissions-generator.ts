import type { GenLogicSchema } from './types.js';
import type { ProcessedSchema } from './schema-processor.js';

/**
 * Permissions Generator
 *
 * GENLOGIC INTEGRITY: Generate database permissions to protect automated columns
 * Uses column-level UPDATE restrictions combined with SECURITY DEFINER triggers
 */
export class PermissionsGenerator {

  /**
   * Generate setup SQL for GenLogic admin role
   * This role owns all tables and triggers, allowing SECURITY DEFINER functions to work
   */
  generateAdminRoleSetup(databaseName: string): string[] {
    const roleName = `${databaseName}_genlogic_admin`;
    const sql: string[] = [];

    // Create admin role (INTEGRITY protection)
    // Fails if user lacks CREATEROLE privilege
    sql.push(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${roleName}') THEN
    CREATE ROLE ${roleName};
  END IF;
END $$;`);

    // Grant membership to current user so they can transfer ownership
    // This allows the setup user to ALTER TABLE ... OWNER TO admin_role
    sql.push(`GRANT ${roleName} TO CURRENT_USER;`);

    // Grant schema permissions to admin role
    // Required for ownership transfers to succeed
    sql.push(`GRANT ALL ON SCHEMA public TO ${roleName};`);
    sql.push(``);

    return sql;
  }

  /**
   * Generate ownership changes for all tables and triggers
   * All GenLogic-managed objects must be owned by the admin role
   */
  generateOwnershipChanges(databaseName: string, schema: GenLogicSchema, processedSchema: ProcessedSchema): string[] {
    const roleName = `${databaseName}_genlogic_admin`;
    const sql: string[] = [];

    if (!schema.tables) return sql;

    // Set ownership to GenLogic admin role (INTEGRITY protection)
    for (const tableName of Object.keys(schema.tables)) {
      // Table ownership
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
  generateColumnPermissions(databaseName: string, schema: GenLogicSchema, processedSchema: ProcessedSchema): string[] {
    const sql: string[] = [];

    if (!schema.tables) return sql;

    // Grant permissions (INTEGRITY: selective column UPDATE permissions)
    for (const [tableName, table] of Object.entries(schema.tables)) {
      const processedTable = processedSchema.tables?.[tableName];
      if (!processedTable) continue;

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

      // Grant all permissions on table to PUBLIC
      sql.push(`GRANT ALL ON TABLE "${tableName}" TO PUBLIC;`);

      // Revoke UPDATE on automated columns from PUBLIC
      if (automatedColumns.length > 0) {
        for (const col of automatedColumns) {
          sql.push(`REVOKE UPDATE ("${col}") ON "${tableName}" FROM PUBLIC;`);
        }
        sql.push(`-- Protected columns: ${automatedColumns.join(', ')}`);
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
  generateAllPermissions(databaseName: string, schema: GenLogicSchema, processedSchema: ProcessedSchema): string[] {
    const sql: string[] = [];

    // Step 1: Create admin role
    sql.push(...this.generateAdminRoleSetup(databaseName));

    // Step 2: Change ownership
    sql.push(...this.generateOwnershipChanges(databaseName, schema, processedSchema));

    // Step 3: Grant column permissions
    sql.push(...this.generateColumnPermissions(databaseName, schema, processedSchema));

    return sql;
  }
}
