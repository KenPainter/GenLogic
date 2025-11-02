import pkg from 'pg';
const { Pool } = pkg;
import type { Pool as PgPool, PoolClient } from 'pg';
import type {
  DatabaseConfig,
  DatabaseTable,
  DatabaseColumn,
  DatabaseForeignKey,
  DatabaseIndex,
  DatabaseTrigger,
  DatabaseCheckConstraint
} from './types.js';

/**
 * Database Introspection and Connection Management
 *
 * GENLOGIC APPROACH: Query PostgreSQL system catalogs to understand current state
 * This enables safe diffing and incremental updates without breaking existing data
 */
export class DatabaseManager {
  private pool: PgPool;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
    // Initialize pool with Unix socket connection (trusted/peer auth on localhost)
    // Setting host to socket directory forces Unix socket instead of TCP
    this.pool = new Pool({
      host: '/var/run/postgresql',
      database: config.database,
      user: config.user
    });
  }

  /**
   * Connect to database
   * Creates the database if it doesn't exist
   */
  async connect(): Promise<void> {
    // First, try to connect to the postgres database to check/create our target database
    const postgresPool = new Pool({
      host: '/var/run/postgresql',
      database: 'postgres',
      user: this.config.user
    });

    try {
      // Check if target database exists
      const result = await postgresPool.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [this.config.database]
      );

      if (result.rows.length === 0) {
        // Database doesn't exist, create it
        // Note: CREATE DATABASE cannot be run in a transaction or with parameters
        await postgresPool.query(`CREATE DATABASE ${this.config.database}`);
        console.log(`✅ Created database: ${this.config.database}`);
      }
    } finally {
      await postgresPool.end();
    }

    // Now connect to the target database and test the connection
    await this.pool.query('SELECT 1');

    // INTEGRITY: Verify user has CREATEROLE privilege
    // This is required for the two-user security model
    const privCheck = await this.pool.query(`
      SELECT rolsuper, rolcreaterole
      FROM pg_roles
      WHERE rolname = CURRENT_USER
    `);

    const canCreateRole = privCheck.rows[0]?.rolsuper || privCheck.rows[0]?.rolcreaterole;

    if (!canCreateRole) {
      throw new Error(
        `INTEGRITY REQUIREMENT: Current user '${this.config.user}' lacks CREATEROLE privilege.\n` +
        `GenLogic requires a privileged setup user to enforce database-level integrity.\n` +
        `Grant CREATEROLE to this user or run GenLogic as postgres superuser.\n` +
        `See: database-connections.md for the two-user model.`
      );
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Get current database schema information
   */
  async analyzeCurrentSchema(): Promise<Record<string, DatabaseTable>> {
    const tables: Record<string, DatabaseTable> = {};

    // Get all tables
    const tableNames = await this.getTables();

    for (const tableName of tableNames) {
      tables[tableName] = {
        name: tableName,
        columns: await this.getColumns(tableName),
        foreignKeys: await this.getForeignKeys(tableName),
        indexes: await this.getIndexes(tableName),
        triggers: await this.getTriggers(tableName),
        checkConstraints: await this.getCheckConstraints(tableName)
      };
    }

    return tables;
  }

  /**
   * Get list of user tables (excluding system tables)
   */
  private async getTables(): Promise<string[]> {
    const result = await this.pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    return result.rows.map(row => row.table_name);
  }

  /**
   * Get columns for a specific table
   */
  private async getColumns(tableName: string): Promise<DatabaseColumn[]> {
    const result = await this.pool.query(`
      SELECT
        c.column_name,
        c.data_type,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.is_nullable,
        c.column_default,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
        CASE WHEN uq.column_name IS NOT NULL THEN true ELSE false END as is_unique
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku
          ON tc.constraint_name = ku.constraint_name
        WHERE tc.table_name = $1
        AND tc.constraint_type = 'PRIMARY KEY'
      ) pk ON c.column_name = pk.column_name
      LEFT JOIN (
        SELECT ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku
          ON tc.constraint_name = ku.constraint_name
        WHERE tc.table_name = $1
        AND tc.constraint_type = 'UNIQUE'
      ) uq ON c.column_name = uq.column_name
      WHERE c.table_name = $1
      ORDER BY c.ordinal_position
    `, [tableName]);

    return result.rows.map(row => ({
      name: row.column_name,
      type: this.buildPostgreSQLType(row),
      nullable: row.is_nullable === 'YES',
      defaultValue: row.column_default,
      isPrimaryKey: row.is_primary_key,
      isUnique: row.is_unique
    }));
  }

  /**
   * Build PostgreSQL definition string from column information
   */
  private buildPostgreSQLType(row: any): string {
    let type = row.data_type;

    if (row.character_maximum_length) {
      type += `(${row.character_maximum_length})`;
    } else if (row.numeric_precision && row.numeric_scale !== null) {
      type += `(${row.numeric_precision},${row.numeric_scale})`;
    } else if (row.numeric_precision) {
      type += `(${row.numeric_precision})`;
    }

    return type;
  }

  /**
   * Get foreign keys for a specific table
   */
  private async getForeignKeys(tableName: string): Promise<DatabaseForeignKey[]> {
    const result = await this.pool.query(`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
      WHERE tc.table_name = $1
      AND tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.constraint_name
    `, [tableName]);

    return result.rows.map(row => ({
      name: row.constraint_name,
      column: row.column_name,
      referencedTable: row.foreign_table_name,
      referencedColumn: row.foreign_column_name,
      onDelete: row.delete_rule
    }));
  }

  /**
   * Get indexes for a specific table
   */
  private async getIndexes(tableName: string): Promise<DatabaseIndex[]> {
    const result = await this.pool.query(`
      SELECT
        i.relname AS index_name,
        array_agg(a.attname ORDER BY c.ordinality) AS column_names,
        idx.indisunique AS is_unique
      FROM pg_index idx
      JOIN pg_class i ON i.oid = idx.indexrelid
      JOIN pg_class t ON t.oid = idx.indrelid
      JOIN pg_attribute a ON a.attrelid = t.oid
      JOIN unnest(idx.indkey) WITH ORDINALITY AS c(attnum, ordinality)
        ON a.attnum = c.attnum
      WHERE t.relname = $1
      AND i.relname NOT LIKE '%_pkey'
      GROUP BY i.relname, idx.indisunique
      ORDER BY i.relname
    `, [tableName]);

    return result.rows.map(row => ({
      name: row.index_name,
      columns: row.column_names,
      isUnique: row.is_unique
    }));
  }

  /**
   * Get triggers for a specific table
   * GENLOGIC FOCUS: Identify our triggers by naming convention
   */
  private async getTriggers(tableName: string): Promise<DatabaseTrigger[]> {
    const result = await this.pool.query(`
      SELECT
        t.trigger_name,
        t.event_manipulation as event,
        t.action_timing as timing
      FROM information_schema.triggers t
      WHERE t.event_object_table = $1
      ORDER BY t.trigger_name
    `, [tableName]);

    return result.rows.map(row => ({
      name: row.trigger_name,
      table: tableName,
      event: row.event as 'INSERT' | 'UPDATE' | 'DELETE',
      when: row.timing as 'BEFORE' | 'AFTER',
      isGenLogicTrigger: this.isGenLogicTrigger(row.trigger_name)
    }));
  }

  /**
   * Check if trigger follows GenLogic naming convention
   * Convention: <TABLE>_before_<INSERT|UPDATE|DELETE>_genlogic
   */
  private isGenLogicTrigger(triggerName: string): boolean {
    return triggerName.endsWith('_genlogic');
  }

  /**
   * Get CHECK constraints for a table
   * Extracts column name from constraint definition for GenLogic numeric protection constraints
   */
  private async getCheckConstraints(tableName: string): Promise<DatabaseCheckConstraint[]> {
    const result = await this.pool.query(`
      SELECT
        con.conname as constraint_name,
        pg_get_constraintdef(con.oid) as constraint_definition,
        att.attname as column_name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      LEFT JOIN pg_attribute att ON att.attrelid = con.conrelid
        AND att.attnum = ANY(con.conkey)
      WHERE con.contype = 'c'
        AND rel.relname = $1
        AND nsp.nspname = 'public'
      ORDER BY con.conname
    `, [tableName]);

    return result.rows.map(row => ({
      name: row.constraint_name,
      columnName: row.column_name,
      definition: row.constraint_definition
    }));
  }

  /**
   * Get ALL GenLogic triggers in the database
   * Used for unconditional cleanup at start of processing
   */
  async getAllGenLogicTriggers(): Promise<Array<{ triggerName: string; tableName: string }>> {
    const result = await this.pool.query(`
      SELECT
        t.trigger_name,
        t.event_object_table as table_name
      FROM information_schema.triggers t
      WHERE t.event_object_schema = 'public'
        AND (t.trigger_name LIKE '%_genlogic'
             OR t.trigger_name LIKE '%_protect_update'
             OR t.trigger_name LIKE '%_protect_delete')
      ORDER BY t.event_object_table, t.trigger_name
    `);

    return result.rows.map(row => ({
      triggerName: row.trigger_name,
      tableName: row.table_name
    }));
  }

  /**
   * Generate SQL to drop all GenLogic triggers
   * Returns array of DROP TRIGGER statements
   */
  async generateDropAllGenLogicTriggersSQL(): Promise<string[]> {
    const triggers = await this.getAllGenLogicTriggers();
    return triggers.map(({ triggerName, tableName }) =>
      `DROP TRIGGER IF EXISTS ${triggerName} ON "${tableName}";`
    );
  }

  /**
   * Execute SQL within a transaction
   */
  async executeInTransaction(sqlStatements: string[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < sqlStatements.length; i++) {
        const sql = sqlStatements[i];
        try {
          await client.query(sql);
        } catch (sqlError: any) {
          await client.query('ROLLBACK');
          // Add context about which statement failed
          throw new Error(
            `SQL execution failed at statement ${i + 1}/${sqlStatements.length}: ${sqlError.message}\n` +
            `Full statement:\n${sql}`
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      // Ensure rollback on any error
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        // Ignore rollback errors
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a single SQL statement
   */
  async execute(sql: string): Promise<any> {
    return await this.pool.query(sql);
  }

  /**
   * Execute a query with optional parameters
   * Supports parameterized queries using $1, $2, etc.
   */
  async query(sql: string, params?: any[]): Promise<any> {
    return await this.pool.query(sql, params);
  }

  /**
   * Get the underlying Pool object for direct queries
   * Mainly for tests that need to run queries
   */
  getPool(): PgPool {
    return this.pool;
  }
}
