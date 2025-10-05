/**
 * Test FK column nullability behavior
 */

import { describe, test, expect } from 'bun:test';
import { SchemaProcessor } from '../../src/schema-processor.js';
import { SQLGenerator } from '../../src/sql-generator.js';
import { DiffEngine } from '../../src/diff-engine.js';

describe('FK Nullable Behavior', () => {
  test('should generate nullable FK columns by default', () => {
    const schema = {
      tables: {
        users: {
          columns: {
            user_id: 'serial primary key'
          }
        },
        accounts: {
          foreign_keys: {
            user_id: 'users'  // Simple FK - should be nullable by default
          },
          columns: {
            account_id: 'serial primary key'
          }
        }
      }
    };

    const processor = new SchemaProcessor();
    const processed = processor.processSchema(schema);

    // Check the FK column definition
    const userIdColumn = processed.tables.accounts.generatedColumns.user_id;
    expect(userIdColumn).toBeDefined();
    expect(userIdColumn.not_null).toBeUndefined(); // Should NOT have not_null property

    // Generate SQL (empty current schema means creating all tables)
    const diffEngine = new DiffEngine();
    const diff = diffEngine.generateDiff(processed, {});
    const sqlGenerator = new SQLGenerator();
    const sql = sqlGenerator.generateSQL(diff);

    // Find the accounts table creation SQL
    const accountsSQL = sql.createTables.find(s => s.includes('CREATE TABLE "accounts"'));
    expect(accountsSQL).toBeDefined();

    // FK column should NOT have NOT NULL constraint
    expect(accountsSQL).toContain('"user_id" INTEGER');
    expect(accountsSQL).not.toContain('"user_id" INTEGER NOT NULL');
  });

  test('should generate NOT NULL FK columns when not_null: true', () => {
    const schema = {
      tables: {
        users: {
          columns: {
            user_id: 'serial primary key'
          }
        },
        orders: {
          foreign_keys: {
            user_fk: {
              table: 'users',
              not_null: true
            }
          },
          columns: {
            order_id: 'serial primary key'
          }
        }
      }
    };

    const processor = new SchemaProcessor();
    const processed = processor.processSchema(schema);

    // Check the FK column definition - simple FK uses FK name as column name
    const userFkColumn = processed.tables.orders.generatedColumns.user_fk;
    expect(userFkColumn).toBeDefined();
    expect(userFkColumn.not_null).toBe(true);

    // Generate SQL (empty current schema means creating all tables)
    const diffEngine = new DiffEngine();
    const diff = diffEngine.generateDiff(processed, {});
    const sqlGenerator = new SQLGenerator();
    const sql = sqlGenerator.generateSQL(diff);

    // Find the orders table creation SQL
    const ordersSQL = sql.createTables.find(s => s.includes('CREATE TABLE "orders"'));
    expect(ordersSQL).toBeDefined();

    // FK column SHOULD have NOT NULL constraint
    expect(ordersSQL).toContain('"user_fk" INTEGER NOT NULL');
  });
});
