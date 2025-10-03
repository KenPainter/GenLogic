/**
 * Group 2: End-to-End Database Tests - Setup and Basic Operations
 *
 * GENLOGIC TESTING: Verify database creation and basic schema processing
 * Tests the complete pipeline from YAML to PostgreSQL with real database
 */

import { GenLogicProcessor } from '../../src/processor';

describe('Group 2.1: Database Setup and Basic Operations', () => {
  let processor: GenLogicProcessor;
  const testDbName = 'genlogic_test_' + Date.now();

  beforeAll(async () => {
    // Create processor with test database
    processor = new GenLogicProcessor({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: testDbName,
      dryRun: false
    });
  });

  afterAll(async () => {
    // Clean up test database
    if (processor) {
      await processor.cleanup();
    }
  });

  describe('Database connection and setup', () => {
    test('should connect to PostgreSQL database', async () => {
      const result = await processor.testConnection();
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Connection failed:', result.error);
      }
    });

    test('should create database if it does not exist', async () => {
      const result = await processor.ensureDatabaseExists();
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Database creation failed:', result.error);
      }
    });
  });

  describe('Basic schema processing', () => {
    test('should process simple schema without errors', async () => {
      const schema = {
        columns: {
          id: { type: 'integer', sequence: true, primary_key: true },
          name: { type: 'varchar', size: 50 }
        },
        tables: {
          simple_table: {
            columns: {
              table_id: 'id',
              table_name: 'name'
            }
          }
        }
      };

      const result = await processor.processSchema(schema);
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should create tables in correct order', async () => {
      const schema = {
        columns: {
          id: { type: 'integer', sequence: true, primary_key: true },
          name: { type: 'varchar', size: 100 }
        },
        tables: {
          users: {
            columns: {
              user_id: 'id',
              username: 'name'
            }
          },
          accounts: {
            foreign_keys: {
              user_fk: { table: 'users' }
            },
            columns: {
              account_id: 'id',
              account_name: 'name'
            }
          }
        }
      };

      const result = await processor.processSchema(schema);
      expect(result.success).toBe(true);

      // Verify tables exist in database
      const tables = await processor.listTables();
      expect(tables).toContain('users');
      expect(tables).toContain('accounts');
    });
  });

  describe('Column inheritance processing', () => {
    test('should process null inheritance correctly', async () => {
      const schema = {
        columns: {
          timestamp_col: { type: 'timestamp' },
          id_col: { type: 'integer', sequence: true, primary_key: true }
        },
        tables: {
          events: {
            columns: {
              timestamp_col: null,  // Inherit same name
              id_col: null         // Inherit same name
            }
          }
        }
      };

      const result = await processor.processSchema(schema);
      expect(result.success).toBe(true);

      // Verify column types are correct
      const columns = await processor.getTableColumns('events');
      expect(columns.find(c => c.name === 'timestamp_col')?.type).toContain('timestamp');
      expect(columns.find(c => c.name === 'id_col')?.type).toContain('integer');
    });

    test('should process string inheritance correctly', async () => {
      const schema = {
        columns: {
          base_id: { type: 'integer', sequence: true, primary_key: true },
          base_name: { type: 'varchar', size: 50 }
        },
        tables: {
          renamed_table: {
            columns: {
              renamed_id: 'base_id',      // String reference with rename
              renamed_name: 'base_name'   // String reference with rename
            }
          }
        }
      };

      const result = await processor.processSchema(schema);
      expect(result.success).toBe(true);

      // Verify renamed columns exist
      const columns = await processor.getTableColumns('renamed_table');
      expect(columns.find(c => c.name === 'renamed_id')).toBeDefined();
      expect(columns.find(c => c.name === 'renamed_name')).toBeDefined();
    });

    test('should process $ref inheritance with overrides correctly', async () => {
      const schema = {
        columns: {
          base_amount: { type: 'numeric', size: 10, decimal: 2 }
        },
        tables: {
          enhanced_table: {
            columns: {
              large_amount: {
                $ref: 'base_amount',
                size: 15,           // Override size
                decimal: 4          // Override decimal
              }
            }
          }
        }
      };

      const result = await processor.processSchema(schema);
      expect(result.success).toBe(true);

      // Verify column has overridden properties
      const columns = await processor.getTableColumns('enhanced_table');
      const amountCol = columns.find(c => c.name === 'large_amount');
      expect(amountCol?.type).toContain('numeric(15,4)');
    });
  });
});