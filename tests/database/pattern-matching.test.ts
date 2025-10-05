// Pattern Matching Database Tests
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { GenLogicSchema } from '../../src/types.js';
import { GenLogicProcessor } from '../../src/processor';
import { MatchingGenerator } from '../../src/matching-generator.js';
import { createTestHelper, TestHelper } from '../test-helper';

describe('Pattern Matching Database Operations', () => {
  let processor: GenLogicProcessor;
  let helper: TestHelper;
  let db: any;
  let generator: MatchingGenerator;
  const testDbConfig = {
    host: '127.0.0.1',  // TCP connection
    port: 5432,
    database: 'genlogic_test_matching',
    user: 'ken',
    password: 'password123',
    dryRun: false
  };

  beforeEach(async () => {
    processor = new GenLogicProcessor(testDbConfig);
    helper = createTestHelper(processor);
    db = helper.getSQL();
    await db`DROP SCHEMA public CASCADE`;
    await db`CREATE SCHEMA public`;
    generator = new MatchingGenerator();
  });

  afterEach(async () => {
    // Clean up test database
    if (helper) {
      await helper.cleanup();
    }
  });

  describe('Matching table creation', () => {
    test('should create matching table with correct structure', async () => {
      const schema: GenLogicSchema = {
        matching_tables: {
          expense_rules: {
            result_column_name: 'category'
          }
        }
      };

      const result = await helper.processSchema(schema);
      expect(result.success).toBe(true);

      // Verify table structure
      const tableCheck = await db`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'expense_rules'
        ORDER BY ordinal_position
      `;

      expect(tableCheck).toContainEqual(
        expect.objectContaining({
          column_name: 'id',
          data_type: 'integer'
        })
      );
      expect(tableCheck).toContainEqual(
        expect.objectContaining({
          column_name: 'string_match',
          data_type: 'character varying'
        })
      );
      expect(tableCheck).toContainEqual(
        expect.objectContaining({
          column_name: 'category',  // result_column_name
          data_type: 'character varying'
        })
      );
      expect(tableCheck).toContainEqual(
        expect.objectContaining({
          column_name: 'range_low_bound',
          data_type: 'numeric'
        })
      );
      expect(tableCheck).toContainEqual(
        expect.objectContaining({
          column_name: 'range_high_bound',
          data_type: 'numeric'
        })
      );
    });

    test('should create match_best function', async () => {
      const schema: GenLogicSchema = {
        matching_tables: {
          expense_rules: {
            result_column_name: 'category'
          }
        }
      };

      const result = await helper.processSchema(schema);
      expect(result.success).toBe(true);

      // Check function exists
      const functionCheck = await db`
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_name = 'expense_rules_match_best'
          AND routine_type = 'FUNCTION'
      `;

      expect(functionCheck).toHaveLength(1);
    });

    test('should create match_all function', async () => {
      const schema: GenLogicSchema = {
        matching_tables: {
          expense_rules: {
            result_column_name: 'category'
          }
        }
      };

      const result = await helper.processSchema(schema);
      expect(result.success).toBe(true);

      // Check function exists
      const functionCheck = await db`
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_name = 'expense_rules_match_all'
          AND routine_type = 'FUNCTION'
      `;

      expect(functionCheck).toHaveLength(1);
    });
  });

  describe('Pattern matching functionality', () => {
    test('should match patterns correctly with match_best', async () => {
      const schema: GenLogicSchema = {
        matching_tables: {
          expense_rules: {
            result_column_name: 'category'
          }
        }
      };

      const result = await helper.processSchema(schema);
      expect(result.success).toBe(true);

      // Insert test data
      await db`
        INSERT INTO expense_rules (string_match, category, range_low_bound, range_high_bound)
        VALUES
          ('%coffee%', 'Food & Drink', NULL, NULL),
          ('%starbucks%', 'Coffee', NULL, 20),
          ('%office%', 'Office Supplies', 50, NULL),
          ('%supplies%', 'General Supplies', NULL, NULL)
      `;

      // Test matching
      const matches = await db`
        SELECT * FROM expense_rules_match_best(
          '[{"id": 1, "description": "Starbucks coffee", "amount": 15},
            {"id": 2, "description": "Office supplies from Staples", "amount": 75},
            {"id": 3, "description": "Coffee beans", "amount": 60}]'::jsonb
        )
      `;

      expect(matches).toHaveLength(3);

      // Check specific matches
      const starbucksMatch = matches.find(r => r.input_id === 1);
      expect(starbucksMatch?.result_value).toBe('Coffee'); // More specific match

      const officeMatch = matches.find(r => r.input_id === 2);
      expect(officeMatch?.result_value).toBe('Office Supplies'); // Amount >= 50

      const coffeeMatch = matches.find(r => r.input_id === 3);
      expect(coffeeMatch?.result_value).toBe('Food & Drink'); // Amount > 50, doesn't match coffee rule
    });

    test('should rank matches by specificity', async () => {
      const schema: GenLogicSchema = {
        matching_tables: {
          priority_rules: {
            result_column_name: 'priority'
          }
        }
      };

      const result = await helper.processSchema(schema);
      expect(result.success).toBe(true);

      // Insert rules with varying specificity
      await db`
        INSERT INTO priority_rules (string_match, priority, range_low_bound, range_high_bound)
        VALUES
          ('%urgent%', 'High', NULL, NULL),
          ('%urgent%critical%', 'Critical', NULL, NULL),
          ('%', 'Low', NULL, NULL)  -- Catch-all
      `;

      // Test specificity ranking
      const matches = await db`
        SELECT * FROM priority_rules_match_all(
          '[{"id": 1, "description": "urgent critical issue", "amount": 0}]'::jsonb
        )
        ORDER BY match_rank
      `;

      expect(matches.length).toBeGreaterThan(0);
      // Most specific pattern should rank first
      expect(matches[0].result_value).toBe('Critical');
    });

    test('should handle numeric ranges correctly', async () => {
      const schema: GenLogicSchema = {
        matching_tables: {
          discount_rules: {
            result_column_name: 'discount_rate'
          }
        }
      };

      const result = await helper.processSchema(schema);
      expect(result.success).toBe(true);

      // Insert range-based rules
      await db`
        INSERT INTO discount_rules (string_match, discount_rate, range_low_bound, range_high_bound)
        VALUES
          ('%customer%', '5%', 0, 100),
          ('%customer%', '10%', 100, 500),
          ('%customer%', '15%', 500, NULL),
          ('%vip%', '20%', NULL, NULL)
      `;

      // Test range matching
      const matches = await db`
        SELECT * FROM discount_rules_match_best(
          '[{"id": 1, "description": "Regular customer", "amount": 50},
            {"id": 2, "description": "Regular customer", "amount": 250},
            {"id": 3, "description": "Regular customer", "amount": 1000},
            {"id": 4, "description": "VIP customer", "amount": 50}]'::jsonb
        )
        ORDER BY input_id
      `;

      expect(matches).toHaveLength(4);
      expect(matches[0].result_value).toBe('5%');   // 0-100 range
      expect(matches[1].result_value).toBe('10%');  // 100-500 range
      expect(matches[2].result_value).toBe('15%');  // 500+ range
      expect(matches[3].result_value).toBe('5%');   // customer match (range + pattern beats VIP pattern only)
    });
  });

  describe('Multiple matching tables', () => {
    test('should handle multiple matching tables independently', async () => {
      const schema: GenLogicSchema = {
        matching_tables: {
          expense_rules: {
            result_column_name: 'category'
          },
          vendor_rules: {
            result_column_name: 'vendor_type'
          }
        }
      };

      const result = await helper.processSchema(schema);
      expect(result.success).toBe(true);

      // Verify both tables exist
      const tableCheck = await db`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name IN ('expense_rules', 'vendor_rules')
        AND table_type = 'BASE TABLE'
      `;

      expect(tableCheck).toHaveLength(2);

      // Verify both sets of functions exist
      const functionCheck = await db`
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_name IN (
          'expense_rules_match_best', 'expense_rules_match_all',
          'vendor_rules_match_best', 'vendor_rules_match_all'
        )
        AND routine_type = 'FUNCTION'
      `;

      expect(functionCheck).toHaveLength(4);
    });
  });
});