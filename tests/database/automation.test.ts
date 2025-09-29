/**
 * Group 2: End-to-End Database Tests - Automation Testing
 *
 * GENLOGIC TESTING: Verify that automations work correctly in real database
 * Tests SUM, COUNT, MAX, MIN, LATEST aggregations with actual data
 */

import { GenLogicProcessor } from '../../src/processor';

describe('Group 2.2: Automation Testing', () => {
  let processor: GenLogicProcessor;
  const testDbName = 'genlogic_automation_test_' + Date.now();

  beforeAll(async () => {
    processor = new GenLogicProcessor({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: testDbName,
      dryRun: false
    });

    await processor.ensureDatabaseExists();
  });

  afterAll(async () => {
    if (processor) {
      await processor.cleanup();
    }
  });

  describe('SUM automation', () => {
    test('should calculate SUM correctly with incremental updates', async () => {
      const schema = {
        columns: {
          amount: { type: 'numeric', size: 10, decimal: 2 }
        },
        tables: {
          accounts: {
            columns: {
              account_id: { type: 'integer', sequence: true, primary_key: true },
              balance: {
                $ref: 'amount',
                automation: {
                  type: 'SUM',
                  table: 'transactions',
                  foreign_key: 'account_fk',
                  column: 'amount'
                }
              }
            }
          },
          transactions: {
            foreign_keys: {
              account_fk: { table: 'accounts' }
            },
            columns: {
              transaction_id: { type: 'integer', sequence: true, primary_key: true },
              amount: null
            }
          }
        }
      };

      // Process schema
      const result = await processor.processSchema(schema);
      expect(result.success).toBe(true);

      // Insert test data
      await processor.query(`
        INSERT INTO accounts (account_id) VALUES (1), (2);
      `);

      // Insert transactions
      await processor.query(`
        INSERT INTO transactions (account_fk, amount) VALUES
        (1, 100.00),
        (1, 250.50),
        (1, -50.25),
        (2, 500.00),
        (2, -100.00);
      `);

      // Verify SUM calculations
      const account1 = await processor.query(`
        SELECT balance FROM accounts WHERE account_id = 1;
      `);
      expect(parseFloat(account1.rows[0].balance)).toBeCloseTo(300.25);

      const account2 = await processor.query(`
        SELECT balance FROM accounts WHERE account_id = 2;
      `);
      expect(parseFloat(account2.rows[0].balance)).toBeCloseTo(400.00);

      // Test incremental update - add new transaction
      await processor.query(`
        INSERT INTO transactions (account_fk, amount) VALUES (1, 99.75);
      `);

      const updatedAccount1 = await processor.query(`
        SELECT balance FROM accounts WHERE account_id = 1;
      `);
      expect(parseFloat(updatedAccount1.rows[0].balance)).toBeCloseTo(400.00);
    });
  });

  describe('COUNT automation', () => {
    test('should calculate COUNT correctly with incremental updates', async () => {
      const schema = {
        columns: {
          amount: { type: 'numeric', size: 10, decimal: 2 }
        },
        tables: {
          customers: {
            columns: {
              customer_id: { type: 'integer', sequence: true, primary_key: true },
              order_count: {
                type: 'integer',
                automation: {
                  type: 'COUNT',
                  table: 'orders',
                  foreign_key: 'customer_fk',
                  column: 'amount'
                }
              }
            }
          },
          orders: {
            foreign_keys: {
              customer_fk: { table: 'customers' }
            },
            columns: {
              order_id: { type: 'integer', sequence: true, primary_key: true },
              amount: null
            }
          }
        }
      };

      const result = await processor.processSchema(schema);
      expect(result.success).toBe(true);

      // Insert test data
      await processor.query(`
        INSERT INTO customers (customer_id) VALUES (1), (2);
      `);

      await processor.query(`
        INSERT INTO orders (customer_fk, amount) VALUES
        (1, 100.00),
        (1, 200.00),
        (1, 300.00),
        (2, 150.00);
      `);

      // Verify COUNT calculations
      const customer1 = await processor.query(`
        SELECT order_count FROM customers WHERE customer_id = 1;
      `);
      expect(customer1.rows[0].order_count).toBe(3);

      const customer2 = await processor.query(`
        SELECT order_count FROM customers WHERE customer_id = 2;
      `);
      expect(customer2.rows[0].order_count).toBe(1);

      // Test incremental update
      await processor.query(`
        INSERT INTO orders (customer_fk, amount) VALUES (2, 250.00);
      `);

      const updatedCustomer2 = await processor.query(`
        SELECT order_count FROM customers WHERE customer_id = 2;
      `);
      expect(updatedCustomer2.rows[0].order_count).toBe(2);
    });
  });

  describe('MAX automation', () => {
    test('should calculate MAX correctly with incremental updates', async () => {
      const schema = {
        columns: {
          amount: { type: 'numeric', size: 10, decimal: 2 }
        },
        tables: {
          portfolios: {
            columns: {
              portfolio_id: { type: 'integer', sequence: true, primary_key: true },
              max_investment: {
                $ref: 'amount',
                automation: {
                  type: 'MAX',
                  table: 'investments',
                  foreign_key: 'portfolio_fk',
                  column: 'amount'
                }
              }
            }
          },
          investments: {
            foreign_keys: {
              portfolio_fk: { table: 'portfolios' }
            },
            columns: {
              investment_id: { type: 'integer', sequence: true, primary_key: true },
              amount: null
            }
          }
        }
      };

      const result = await processor.processSchema(schema);
      expect(result.success).toBe(true);

      // Insert test data
      await processor.query(`
        INSERT INTO portfolios (portfolio_id) VALUES (1), (2);
      `);

      await processor.query(`
        INSERT INTO investments (portfolio_fk, amount) VALUES
        (1, 1000.00),
        (1, 2500.00),
        (1, 750.00),
        (2, 500.00),
        (2, 800.00);
      `);

      // Verify MAX calculations
      const portfolio1 = await processor.query(`
        SELECT max_investment FROM portfolios WHERE portfolio_id = 1;
      `);
      expect(parseFloat(portfolio1.rows[0].max_investment)).toBeCloseTo(2500.00);

      const portfolio2 = await processor.query(`
        SELECT max_investment FROM portfolios WHERE portfolio_id = 2;
      `);
      expect(parseFloat(portfolio2.rows[0].max_investment)).toBeCloseTo(800.00);

      // Test incremental update - new max value
      await processor.query(`
        INSERT INTO investments (portfolio_fk, amount) VALUES (2, 1200.00);
      `);

      const updatedPortfolio2 = await processor.query(`
        SELECT max_investment FROM portfolios WHERE portfolio_id = 2;
      `);
      expect(parseFloat(updatedPortfolio2.rows[0].max_investment)).toBeCloseTo(1200.00);
    });
  });

  describe('LATEST automation', () => {
    test('should update LATEST value correctly', async () => {
      const schema = {
        tables: {
          devices: {
            columns: {
              device_id: { type: 'integer', sequence: true, primary_key: true },
              last_reading: {
                type: 'numeric',
                size: 8,
                decimal: 2,
                automation: {
                  type: 'LATEST',
                  table: 'readings',
                  foreign_key: 'device_fk',
                  column: 'value'
                }
              }
            }
          },
          readings: {
            foreign_keys: {
              device_fk: { table: 'devices' }
            },
            columns: {
              reading_id: { type: 'integer', sequence: true, primary_key: true },
              value: { type: 'numeric', size: 8, decimal: 2 },
              timestamp: { type: 'timestamp' }
            }
          }
        }
      };

      const result = await processor.processSchema(schema);
      expect(result.success).toBe(true);

      // Insert test data
      await processor.query(`
        INSERT INTO devices (device_id) VALUES (1);
      `);

      await processor.query(`
        INSERT INTO readings (device_fk, value, timestamp) VALUES
        (1, 23.5, '2024-01-01 10:00:00'),
        (1, 24.1, '2024-01-01 11:00:00'),
        (1, 22.8, '2024-01-01 12:00:00');
      `);

      // Verify LATEST value (should be the last inserted)
      const device = await processor.query(`
        SELECT last_reading FROM devices WHERE device_id = 1;
      `);
      expect(parseFloat(device.rows[0].last_reading)).toBeCloseTo(22.8);

      // Add another reading
      await processor.query(`
        INSERT INTO readings (device_fk, value, timestamp) VALUES
        (1, 25.2, '2024-01-01 13:00:00');
      `);

      const updatedDevice = await processor.query(`
        SELECT last_reading FROM devices WHERE device_id = 1;
      `);
      expect(parseFloat(updatedDevice.rows[0].last_reading)).toBeCloseTo(25.2);
    });
  });

  describe('Multiple automations on same table', () => {
    test('should handle multiple automations efficiently with consolidated triggers', async () => {
      const schema = {
        columns: {
          amount: { type: 'numeric', size: 10, decimal: 2 },
          transaction_date: { type: 'date' }
        },
        tables: {
          summary: {
            columns: {
              summary_id: { type: 'integer', sequence: true, primary_key: true },
              total_amount: {
                $ref: 'amount',
                automation: {
                  type: 'SUM',
                  table: 'details',
                  foreign_key: 'summary_fk',
                  column: 'amount'
                }
              },
              detail_count: {
                type: 'integer',
                automation: {
                  type: 'COUNT',
                  table: 'details',
                  foreign_key: 'summary_fk',
                  column: 'amount'
                }
              },
              max_amount: {
                $ref: 'amount',
                automation: {
                  type: 'MAX',
                  table: 'details',
                  foreign_key: 'summary_fk',
                  column: 'amount'
                }
              },
              latest_date: {
                $ref: 'transaction_date',
                automation: {
                  type: 'LATEST',
                  table: 'details',
                  foreign_key: 'summary_fk',
                  column: 'transaction_date'
                }
              }
            }
          },
          details: {
            foreign_keys: {
              summary_fk: { table: 'summary' }
            },
            columns: {
              detail_id: { type: 'integer', sequence: true, primary_key: true },
              amount: null,
              transaction_date: null
            }
          }
        }
      };

      const result = await processor.processSchema(schema);
      expect(result.success).toBe(true);

      // Insert test data
      await processor.query(`
        INSERT INTO summary (summary_id) VALUES (1);
      `);

      await processor.query(`
        INSERT INTO details (summary_fk, amount, transaction_date) VALUES
        (1, 100.00, '2024-01-01'),
        (1, 250.00, '2024-01-02'),
        (1, 75.50, '2024-01-03');
      `);

      // Verify all automations calculated correctly
      const summary = await processor.query(`
        SELECT total_amount, detail_count, max_amount, latest_date
        FROM summary WHERE summary_id = 1;
      `);

      const row = summary.rows[0];
      expect(parseFloat(row.total_amount)).toBeCloseTo(425.50);
      expect(row.detail_count).toBe(3);
      expect(parseFloat(row.max_amount)).toBeCloseTo(250.00);
      expect(row.latest_date.toISOString().split('T')[0]).toBe('2024-01-03');

      // Verify only one trigger was created (consolidated)
      const triggers = await processor.query(`
        SELECT COUNT(*) as trigger_count
        FROM information_schema.triggers
        WHERE event_object_table = 'details';
      `);
      expect(triggers.rows[0].trigger_count).toBe('1'); // Should be consolidated into one trigger
    });
  });
});