import { Client } from 'pg';
import type {
  DatabaseConfig,
  DatabaseTable,
  DatabaseColumn,
  DatabaseForeignKey,
  DatabaseIndex,
  DatabaseTrigger
} from './types.js';

/**
 * Database Introspection and Connection Management
 *
 * GENLOGIC APPROACH: Query PostgreSQL system catalogs to understand current state
 * This enables safe diffing and incremental updates without breaking existing data
 */
export class DatabaseManager {
  private client: Client;

  constructor(config: DatabaseConfig) {
    this.client = new Client({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
    });
  }

  /**
   * Connect to database
   */
  async connect(): Promise<void> {
    await this.client.connect();
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    await this.client.end();
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
        triggers: await this.getTriggers(tableName)
      };
    }

    return tables;
  }

  /**
   * Get list of user tables (excluding system tables)
   */
  private async getTables(): Promise<string[]> {
    const query = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    const result = await this.client.query(query);
    return result.rows.map(row => row.table_name);
  }

  /**
   * Get columns for a specific table
   */
  private async getColumns(tableName: string): Promise<DatabaseColumn[]> {
    const query = `
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
    `;

    const result = await this.client.query(query, [tableName]);

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
   * Build PostgreSQL type string from column information
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
    const query = `
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
    `;

    const result = await this.client.query(query, [tableName]);

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
    const query = `
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
      AND i.relname NOT LIKE '%_pkey' -- Exclude primary key indexes
      GROUP BY i.relname, idx.indisunique
      ORDER BY i.relname
    `;

    const result = await this.client.query(query, [tableName]);

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
    const query = `
      SELECT
        t.trigger_name,
        t.event_manipulation as event,
        t.action_timing as timing
      FROM information_schema.triggers t
      WHERE t.event_object_table = $1
      ORDER BY t.trigger_name
    `;

    const result = await this.client.query(query, [tableName]);

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
   * Get ALL GenLogic triggers in the database
   * Used for unconditional cleanup at start of processing
   */
  async getAllGenLogicTriggers(): Promise<Array<{ triggerName: string; tableName: string }>> {
    const query = `
      SELECT
        t.trigger_name,
        t.event_object_table as table_name
      FROM information_schema.triggers t
      WHERE t.event_object_schema = 'public'
        AND t.trigger_name LIKE '%_genlogic'
      ORDER BY t.event_object_table, t.trigger_name
    `;

    const result = await this.client.query(query);
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
    await this.client.query('BEGIN');

    try {
      for (let i = 0; i < sqlStatements.length; i++) {
        const sql = sqlStatements[i];
        try {
          await this.client.query(sql);
        } catch (sqlError: any) {
          // Add context about which statement failed
          throw new Error(
            `SQL execution failed at statement ${i + 1}/${sqlStatements.length}: ${sqlError.message}\n` +
            `Full statement:\n${sql}`
          );
        }
      }
      await this.client.query('COMMIT');
    } catch (error) {
      await this.client.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Execute a single SQL statement
   */
  async execute(sql: string): Promise<any> {
    return await this.client.query(sql);
  }

  /**
   * Execute a query with optional parameters
   */
  async query(sql: string, params?: any[]): Promise<any> {
    return await this.client.query(sql, params);
  }
}