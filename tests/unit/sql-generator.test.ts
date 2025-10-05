// SQL Generator Unit Tests
import { describe, test, expect, beforeEach } from 'bun:test';
import { SQLGenerator } from '../../src/sql-generator.js';
import type { SchemaDiff } from '../../src/diff-engine.js';

describe('SQLGenerator', () => {
  let generator: SQLGenerator;

  beforeEach(() => {
    generator = new SQLGenerator();
  });

  describe('CREATE TABLE statements', () => {
    test('should generate CREATE TABLE with simple columns', () => {
      const diff: SchemaDiff = {
        tablesToCreate: [{
          tableName: 'users',
          columns: [
            {
              name: 'id',
              definition: { type: 'integer', primary_key: true, sequence: true }
            },
            {
              name: 'name',
              definition: { type: 'varchar', size: 100 }
            }
          ]
        }],
        columnsToAdd: [],
        foreignKeysToAdd: [],
        indexesToCreate: []
      };

      const result = generator.generateSQL(diff);

      expect(result.createTables).toHaveLength(1);
      const sql = result.createTables[0];
      expect(sql).toContain('CREATE TABLE "users"');
      expect(sql).toContain('"id" SERIAL');
      expect(sql).toContain('"name" VARCHAR(100)');
      expect(sql).toContain('PRIMARY KEY ("id")');
    });

    test('should generate CREATE TABLE with composite primary key', () => {
      const diff: SchemaDiff = {
        tablesToCreate: [{
          tableName: 'order_items',
          columns: [
            {
              name: 'order_id',
              definition: { type: 'integer', primary_key: true }
            },
            {
              name: 'item_id',
              definition: { type: 'integer', primary_key: true }
            },
            {
              name: 'quantity',
              definition: { type: 'integer' }
            }
          ]
        }],
        columnsToAdd: [],
        foreignKeysToAdd: [],
        indexesToCreate: []
      };

      const result = generator.generateSQL(diff);

      expect(result.createTables).toHaveLength(1);
      const sql = result.createTables[0];
      expect(sql).toContain('PRIMARY KEY ("order_id", "item_id")');
    });

    test('should generate CREATE TABLE with unique constraints', () => {
      const diff: SchemaDiff = {
        tablesToCreate: [{
          tableName: 'users',
          columns: [
            {
              name: 'id',
              definition: { type: 'integer', primary_key: true, sequence: true }
            },
            {
              name: 'email',
              definition: { type: 'varchar', size: 255, unique: true }
            }
          ]
        }],
        columnsToAdd: [],
        foreignKeysToAdd: [],
        indexesToCreate: []
      };

      const result = generator.generateSQL(diff);

      expect(result.createTables).toHaveLength(1);
      const sql = result.createTables[0];
      expect(sql).toContain('"email" VARCHAR(255) UNIQUE');
    });

    test('should handle various data types', () => {
      const diff: SchemaDiff = {
        tablesToCreate: [{
          tableName: 'test_types',
          columns: [
            { name: 'int_col', definition: { type: 'integer' } },
            { name: 'bigint_col', definition: { type: 'bigint' } },
            { name: 'smallint_col', definition: { type: 'smallint' } },
            { name: 'varchar_col', definition: { type: 'varchar', size: 50 } },
            { name: 'text_col', definition: { type: 'text' } },
            { name: 'numeric_col', definition: { type: 'numeric', size: 10, decimal: 2 } },
            { name: 'date_col', definition: { type: 'date' } },
            { name: 'timestamp_col', definition: { type: 'timestamp' } },
            { name: 'boolean_col', definition: { type: 'boolean' } },
            { name: 'jsonb_col', definition: { type: 'jsonb' } }
          ]
        }],
        columnsToAdd: [],
        foreignKeysToAdd: [],
        indexesToCreate: []
      };

      const result = generator.generateSQL(diff);

      const sql = result.createTables[0];
      expect(sql).toContain('"int_col" INTEGER');
      expect(sql).toContain('"bigint_col" BIGINT');
      expect(sql).toContain('"smallint_col" SMALLINT');
      expect(sql).toContain('"varchar_col" VARCHAR(50)');
      expect(sql).toContain('"text_col" TEXT');
      expect(sql).toContain('"numeric_col" NUMERIC(10, 2)');
      expect(sql).toContain('"date_col" DATE');
      expect(sql).toContain('"timestamp_col" TIMESTAMP');
      expect(sql).toContain('"boolean_col" BOOLEAN');
      expect(sql).toContain('"jsonb_col" JSONB');
    });

    test('should handle SERIAL types correctly', () => {
      const diff: SchemaDiff = {
        tablesToCreate: [{
          tableName: 'test_serials',
          columns: [
            { name: 'id', definition: { type: 'integer', sequence: true } },
            { name: 'big_id', definition: { type: 'bigint', sequence: true } },
            { name: 'small_id', definition: { type: 'smallint', sequence: true } }
          ]
        }],
        columnsToAdd: [],
        foreignKeysToAdd: [],
        indexesToCreate: []
      };

      const result = generator.generateSQL(diff);

      const sql = result.createTables[0];
      expect(sql).toContain('"id" SERIAL');
      expect(sql).toContain('"big_id" BIGSERIAL');
      expect(sql).toContain('"small_id" SMALLSERIAL');
    });
  });

  describe('ALTER TABLE ADD COLUMN statements', () => {
    test('should generate ADD COLUMN statement', () => {
      const diff: SchemaDiff = {
        tablesToCreate: [],
        columnsToAdd: [{
          tableName: 'users',
          columnName: 'phone',
          definition: { type: 'varchar', size: 20 }
        }],
        foreignKeysToAdd: [],
        indexesToCreate: []
      };

      const result = generator.generateSQL(diff);

      expect(result.addColumns).toHaveLength(1);
      const sql = result.addColumns[0];
      expect(sql).toBe('ALTER TABLE "users" ADD COLUMN "phone" VARCHAR(20);');
    });

    test('should generate ADD COLUMN with constraints', () => {
      const diff: SchemaDiff = {
        tablesToCreate: [],
        columnsToAdd: [{
          tableName: 'users',
          columnName: 'username',
          definition: { type: 'varchar', size: 50, unique: true }
        }],
        foreignKeysToAdd: [],
        indexesToCreate: []
      };

      const result = generator.generateSQL(diff);

      const sql = result.addColumns[0];
      expect(sql).toContain('UNIQUE');
    });
  });

  describe('Automation defaults', () => {
    test('should add DEFAULT 0 for SUM automation', () => {
      const diff: SchemaDiff = {
        tablesToCreate: [{
          tableName: 'orders',
          columns: [{
            name: 'total',
            definition: {
              type: 'numeric',
              size: 10,
              decimal: 2,
              automation: {
                type: 'SUM',
                table: 'order_items',
                foreign_key: 'order_fk',
                column: 'amount'
              }
            }
          }]
        }],
        columnsToAdd: [],
        foreignKeysToAdd: [],
        indexesToCreate: []
      };

      const result = generator.generateSQL(diff);

      const sql = result.createTables[0];
      expect(sql).toContain('DEFAULT 0');
    });

    test('should add DEFAULT 0 for COUNT automation', () => {
      const diff: SchemaDiff = {
        tablesToCreate: [{
          tableName: 'orders',
          columns: [{
            name: 'item_count',
            definition: {
              type: 'integer',
              automation: {
                type: 'COUNT',
                table: 'order_items',
                foreign_key: 'order_fk',
                column: 'id'
              }
            }
          }]
        }],
        columnsToAdd: [],
        foreignKeysToAdd: [],
        indexesToCreate: []
      };

      const result = generator.generateSQL(diff);

      const sql = result.createTables[0];
      expect(sql).toContain('DEFAULT 0');
    });

    test('should not add DEFAULT for LATEST automation', () => {
      const diff: SchemaDiff = {
        tablesToCreate: [{
          tableName: 'orders',
          columns: [{
            name: 'latest_status',
            definition: {
              type: 'varchar',
              size: 50,
              automation: {
                type: 'LATEST',
                table: 'order_items',
                foreign_key: 'order_fk',
                column: 'status'
              }
            }
          }]
        }],
        columnsToAdd: [],
        foreignKeysToAdd: [],
        indexesToCreate: []
      };

      const result = generator.generateSQL(diff);

      const sql = result.createTables[0];
      expect(sql).not.toContain('DEFAULT');
    });
  });

  describe('CREATE INDEX statements', () => {
    test('should generate CREATE INDEX', () => {
      const diff: SchemaDiff = {
        tablesToCreate: [],
        columnsToAdd: [],
        foreignKeysToAdd: [],
        indexesToCreate: [{
          indexName: 'idx_users_email',
          tableName: 'users',
          columns: ['email'],
          isUnique: false
        }]
      };

      const result = generator.generateSQL(diff);

      expect(result.createIndexes).toHaveLength(1);
      const sql = result.createIndexes[0];
      expect(sql).toBe('CREATE INDEX "idx_users_email" ON "users" ("email");');
    });

    test('should generate CREATE UNIQUE INDEX', () => {
      const diff: SchemaDiff = {
        tablesToCreate: [],
        columnsToAdd: [],
        foreignKeysToAdd: [],
        indexesToCreate: [{
          indexName: 'idx_users_username',
          tableName: 'users',
          columns: ['username'],
          isUnique: true
        }]
      };

      const result = generator.generateSQL(diff);

      const sql = result.createIndexes[0];
      expect(sql).toContain('CREATE UNIQUE INDEX');
    });

    test('should generate composite index', () => {
      const diff: SchemaDiff = {
        tablesToCreate: [],
        columnsToAdd: [],
        foreignKeysToAdd: [],
        indexesToCreate: [{
          indexName: 'idx_orders_user_date',
          tableName: 'orders',
          columns: ['user_id', 'created_date'],
          isUnique: false
        }]
      };

      const result = generator.generateSQL(diff);

      const sql = result.createIndexes[0];
      expect(sql).toBe('CREATE INDEX "idx_orders_user_date" ON "orders" ("user_id", "created_date");');
    });
  });

  describe('Multiple operations', () => {
    test('should handle multiple table creates', () => {
      const diff: SchemaDiff = {
        tablesToCreate: [
          {
            tableName: 'users',
            columns: [{ name: 'id', definition: { type: 'integer', primary_key: true } }]
          },
          {
            tableName: 'posts',
            columns: [{ name: 'id', definition: { type: 'integer', primary_key: true } }]
          }
        ],
        columnsToAdd: [],
        foreignKeysToAdd: [],
        indexesToCreate: []
      };

      const result = generator.generateSQL(diff);

      expect(result.createTables).toHaveLength(2);
      expect(result.createTables[0]).toContain('CREATE TABLE "users"');
      expect(result.createTables[1]).toContain('CREATE TABLE "posts"');
    });

    test('should handle mixed operations', () => {
      const diff: SchemaDiff = {
        tablesToCreate: [{
          tableName: 'new_table',
          columns: [{ name: 'id', definition: { type: 'integer', primary_key: true } }]
        }],
        columnsToAdd: [{
          tableName: 'existing_table',
          columnName: 'new_column',
          definition: { type: 'varchar', size: 100 }
        }],
        foreignKeysToAdd: [],
        indexesToCreate: [{
          indexName: 'idx_test',
          tableName: 'test_table',
          columns: ['test_col'],
          isUnique: false
        }]
      };

      const result = generator.generateSQL(diff);

      expect(result.createTables).toHaveLength(1);
      expect(result.addColumns).toHaveLength(1);
      expect(result.createIndexes).toHaveLength(1);
    });
  });

  describe('Edge cases', () => {
    test('should handle empty diff', () => {
      const diff: SchemaDiff = {
        tablesToCreate: [],
        columnsToAdd: [],
        foreignKeysToAdd: [],
        indexesToCreate: []
      };

      const result = generator.generateSQL(diff);

      expect(result.createTables).toHaveLength(0);
      expect(result.addColumns).toHaveLength(0);
      expect(result.createIndexes).toHaveLength(0);
    });

    test('should handle table with no primary key', () => {
      const diff: SchemaDiff = {
        tablesToCreate: [{
          tableName: 'logs',
          columns: [
            { name: 'timestamp', definition: { type: 'timestamp' } },
            { name: 'message', definition: { type: 'text' } }
          ]
        }],
        columnsToAdd: [],
        foreignKeysToAdd: [],
        indexesToCreate: []
      };

      const result = generator.generateSQL(diff);

      const sql = result.createTables[0];
      expect(sql).not.toContain('PRIMARY KEY');
    });

    test('should handle column names that need quoting', () => {
      const diff: SchemaDiff = {
        tablesToCreate: [{
          tableName: 'users',
          columns: [
            { name: 'user-id', definition: { type: 'integer', primary_key: true } },
            { name: 'first name', definition: { type: 'varchar', size: 50 } }
          ]
        }],
        columnsToAdd: [],
        foreignKeysToAdd: [],
        indexesToCreate: []
      };

      const result = generator.generateSQL(diff);

      const sql = result.createTables[0];
      expect(sql).toContain('"user-id"');
      expect(sql).toContain('"first name"');
    });
  });
});