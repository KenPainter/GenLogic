/**
 * Test Helper Utilities
 *
 * Provides helper methods for database testing that were previously
 * polluting the production GenLogicProcessor class.
 */

import { SQL } from 'bun';
import type { GenLogicProcessor } from '../src/processor.js';
import type { GenLogicSchema } from '../src/types.js';

/**
 * Test helper class that wraps GenLogicProcessor with test-specific utilities
 */
export class TestHelper {
  constructor(private processor: GenLogicProcessor) {}

  /**
   * Test database connection
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const db = this.processor.getDatabase();
      await db.connect();
      await db.disconnect();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown connection error'
      };
    }
  }

  /**
   * Ensure database exists by attempting connection
   */
  async ensureDatabaseExists(): Promise<{ success: boolean; error?: string }> {
    try {
      const db = this.processor.getDatabase();
      await db.connect();
      await db.disconnect();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown database connection error'
      };
    }
  }

  /**
   * Process schema with simplified interface for tests
   */
  async processSchema(schema: GenLogicSchema): Promise<{ success: boolean; errors: string[] }> {
    try {
      const db = this.processor.getDatabase();

      // Validate schema
      const validation = await this.validateSchema(schema);
      if (!validation.isValid) {
        return { success: false, errors: validation.errors };
      }

      // Process schema using the processor's internal components
      await db.connect();
      try {
        // Drop all existing GenLogic triggers first for clean slate
        const dropAllTriggersSQL = await db.generateDropAllGenLogicTriggersSQL();

        const currentSchema = await db.analyzeCurrentSchema();

        // Use processor's internal schema processor
        const schemaProcessor = (this.processor as any).schemaProcessor;
        const processedSchema = schemaProcessor.processSchema(schema);

        // Generate diff
        const diffEngine = (this.processor as any).diffEngine;
        const diff = diffEngine.generateDiff(processedSchema, currentSchema);

        // Generate SQL
        const sqlGenerator = (this.processor as any).sqlGenerator;
        const triggerGenerator = (this.processor as any).triggerGenerator;
        const matchingGenerator = (this.processor as any).matchingGenerator;

        const ddlStatements = sqlGenerator.generateSQL(diff);
        const triggerStatements = triggerGenerator.generateTriggers(schema, processedSchema);
        const matchingStatements = matchingGenerator.generateMatchingSQL(schema, processedSchema);

        const allStatements = [
          ...dropAllTriggersSQL,
          ...ddlStatements.createTables,
          ...ddlStatements.addColumns,
          ...ddlStatements.addForeignKeys,
          ...ddlStatements.createIndexes,
          ...ddlStatements.addComments,
          ...triggerStatements,
          ...matchingStatements
        ].filter(sql => sql.trim().length > 0 && !sql.startsWith('--'));

        if (allStatements.length > 0) {
          await db.executeInTransaction(allStatements);
        }

        return { success: true, errors: [] };
      } finally {
        await db.disconnect();
      }
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * List all tables in the database
   */
  async listTables(): Promise<string[]> {
    const db = this.processor.getDatabase();
    await db.connect();
    try {
      const sql = db.getSQL();
      const result = await sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name;
      `;
      return result.map((row: any) => row.table_name);
    } finally {
      await db.disconnect();
    }
  }

  /**
   * Get columns for a specific table
   */
  async getTableColumns(tableName: string): Promise<Array<{ name: string; type: string }>> {
    const db = this.processor.getDatabase();
    await db.connect();
    try {
      const sql = db.getSQL();
      const result = await sql`
        SELECT column_name, data_type,
               character_maximum_length, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_name = ${tableName} AND table_schema = 'public'
        ORDER BY ordinal_position;
      `;

      return result.map((row: any) => ({
        name: row.column_name,
        type: this.formatColumnType(row)
      }));
    } finally {
      await db.disconnect();
    }
  }

  /**
   * Clean up database by dropping and recreating public schema
   */
  async cleanup(): Promise<void> {
    const db = this.processor.getDatabase();
    try {
      await db.connect();
      await db.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
    } catch (error) {
      // Cleanup is best-effort for tests - warn but don't fail
      console.warn(`⚠️  Cleanup warning (non-fatal): ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      await db.disconnect();
    }
  }

  /**
   * Get direct access to SQL connection for tests
   */
  getSQL(): SQL {
    return this.processor.getDatabase().getSQL();
  }

  /**
   * Private helper to validate schema
   */
  private async validateSchema(schema: GenLogicSchema): Promise<{ isValid: boolean; errors: string[] }> {
    const validator = (this.processor as any).validator;
    const validation = validator.validateSyntax(schema);
    if (!validation.isValid) {
      return { isValid: false, errors: validation.errors };
    }
    return { isValid: true, errors: [] };
  }

  /**
   * Format column type for display
   */
  private formatColumnType(row: any): string {
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
}

/**
 * Create a test helper for a given processor
 */
export function createTestHelper(processor: GenLogicProcessor): TestHelper {
  return new TestHelper(processor);
}
