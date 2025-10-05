import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import yaml from 'yaml';
import { GenLogicProcessor } from '../../src/processor.js';

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: 'genlogic_test_calc',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  dryRun: false,
  testMode: true
};

describe('Calculated Columns Database Tests', () => {
  let processor: GenLogicProcessor;
  let db: SQL;

  beforeAll(async () => {
    processor = new GenLogicProcessor(DB_CONFIG);
    db = new SQL({
      hostname: DB_CONFIG.host,
      port: DB_CONFIG.port,
      database: DB_CONFIG.database,
      username: DB_CONFIG.user,
      password: DB_CONFIG.password,
    });

    // Ensure test database exists
    await processor.ensureDatabaseExists();
  });

  afterAll(async () => {
    // Close connection
    if (db) {
      db.close();
    }
  });

  describe('Simple Calculated Columns', () => {
    test('should calculate simple arithmetic on INSERT', async () => {
      const schemaYaml = `
tables:
  orders:
    columns:
      order_id: { type: integer, primary_key: true, sequence: true }
      price: { type: numeric, size: 10, decimal: 2 }
      quantity: { type: integer }
      total:
        type: numeric
        size: 10
        decimal: 2
        calculated: "price * quantity"
`;

      const schema = yaml.parse(schemaYaml);
      const result = await processor.processSchema(schema);

      expect(result.success).toBe(true);

      // Insert a row and verify calculation
      await db`INSERT INTO orders (price, quantity) VALUES (${10.50}, ${3})`;

      const queryResult = await db`
        SELECT price, quantity, total
        FROM orders
        WHERE price = ${10.50}
      `;

      expect(queryResult).toHaveLength(1);
      expect(parseFloat(queryResult[0].total)).toBe(31.50);

      // Cleanup
      await db`DROP TABLE IF EXISTS orders CASCADE`;
    });

    test('should recalculate on UPDATE', async () => {
      const schemaYaml = `
tables:
  products:
    columns:
      product_id: { type: integer, primary_key: true, sequence: true }
      base_price: { type: numeric, size: 10, decimal: 2 }
      markup_percent: { type: numeric, size: 5, decimal: 2 }
      selling_price:
        type: numeric
        size: 10
        decimal: 2
        calculated: "base_price * (1 + markup_percent / 100)"
`;

      const schema = yaml.parse(schemaYaml);
      const result = await processor.processSchema(schema);

      expect(result.success).toBe(true);

      // Insert a product
      await db`
        INSERT INTO products (base_price, markup_percent)
        VALUES (${100.00}, ${20.00})
      `;

      let queryResult = await db`
        SELECT base_price, markup_percent, selling_price
        FROM products
        WHERE base_price = ${100.00}
      `;

      expect(queryResult).toHaveLength(1);
      expect(parseFloat(queryResult[0].selling_price)).toBe(120.00);

      // Update the markup
      await db`
        UPDATE products
        SET markup_percent = ${30.00}
        WHERE base_price = ${100.00}
      `;

      queryResult = await db`
        SELECT base_price, markup_percent, selling_price
        FROM products
        WHERE base_price = ${100.00}
      `;

      expect(parseFloat(queryResult[0].selling_price)).toBe(130.00);

      // Cleanup
      await db`DROP TABLE IF EXISTS products CASCADE`;
    });
  });

  describe('CASE Expression Calculations', () => {
    test('should handle CASE WHEN expressions', async () => {
      const schemaYaml = `
tables:
  invoices:
    columns:
      invoice_id: { type: integer, primary_key: true, sequence: true }
      amount: { type: numeric, size: 10, decimal: 2 }
      status:
        type: text
        calculated: "case when amount > 0 then 'positive' when amount < 0 then 'negative' else 'zero' end"
`;

      const schema = yaml.parse(schemaYaml);
      const result = await processor.processSchema(schema);

      expect(result.success).toBe(true);

      // Insert test data
      await db`INSERT INTO invoices (amount) VALUES (${100.00})`;
      await db`INSERT INTO invoices (amount) VALUES (${-50.00})`;
      await db`INSERT INTO invoices (amount) VALUES (${0.00})`;

      const queryResult = await db`
        SELECT amount, status
        FROM invoices
        ORDER BY amount DESC
      `;

      expect(queryResult).toHaveLength(3);
      expect(queryResult[0].status).toBe('positive');
      expect(queryResult[1].status).toBe('zero');
      expect(queryResult[2].status).toBe('negative');

      // Cleanup
      await db`DROP TABLE IF EXISTS invoices CASCADE`;
    });
  });

  describe('Dependent Calculated Columns', () => {
    test('should calculate columns in dependency order', async () => {
      const schemaYaml = `
tables:
  sales:
    columns:
      sale_id: { type: integer, primary_key: true, sequence: true }
      price: { type: numeric, size: 10, decimal: 2 }
      quantity: { type: integer }
      subtotal:
        type: numeric
        size: 10
        decimal: 2
        calculated: "price * quantity"
      tax:
        type: numeric
        size: 10
        decimal: 2
        calculated: "subtotal * 0.1"
      total:
        type: numeric
        size: 10
        decimal: 2
        calculated: "subtotal + tax"
`;

      const schema = yaml.parse(schemaYaml);
      const result = await processor.processSchema(schema);

      expect(result.success).toBe(true);

      // Insert a sale
      await db`
        INSERT INTO sales (price, quantity)
        VALUES (${50.00}, ${2})
      `;

      const queryResult = await db`
        SELECT price, quantity, subtotal, tax, total
        FROM sales
        WHERE price = ${50.00}
      `;

      expect(queryResult).toHaveLength(1);
      const row = queryResult[0];

      expect(parseFloat(row.subtotal)).toBe(100.00);
      expect(parseFloat(row.tax)).toBe(10.00);
      expect(parseFloat(row.total)).toBe(110.00);

      // Update and verify recalculation
      await db`
        UPDATE sales
        SET quantity = ${3}
        WHERE price = ${50.00}
      `;

      const updatedResult = await db`
        SELECT price, quantity, subtotal, tax, total
        FROM sales
        WHERE price = ${50.00}
      `;

      const updatedRow = updatedResult[0];
      expect(parseFloat(updatedRow.subtotal)).toBe(150.00);
      expect(parseFloat(updatedRow.tax)).toBe(15.00);
      expect(parseFloat(updatedRow.total)).toBe(165.00);

      // Cleanup
      await db`DROP TABLE IF EXISTS sales CASCADE`;
    });
  });

  describe('NULL Handling', () => {
    test('should handle NULL values in calculations', async () => {
      const schemaYaml = `
tables:
  measurements:
    columns:
      measurement_id: { type: integer, primary_key: true, sequence: true }
      value1: { type: numeric, size: 10, decimal: 2 }
      value2: { type: numeric, size: 10, decimal: 2 }
      sum_result:
        type: numeric
        size: 10
        decimal: 2
        calculated: "COALESCE(value1, 0) + COALESCE(value2, 0)"
`;

      const schema = yaml.parse(schemaYaml);
      const result = await processor.processSchema(schema);

      expect(result.success).toBe(true);

      // Insert with one NULL value
      await db`
        INSERT INTO measurements (value1, value2)
        VALUES (${10.00}, ${null})
      `;

      const queryResult = await db`
        SELECT value1, value2, sum_result
        FROM measurements
        WHERE value1 = ${10.00}
      `;

      expect(queryResult).toHaveLength(1);
      expect(parseFloat(queryResult[0].sum_result)).toBe(10.00);

      // Cleanup
      await db`DROP TABLE IF EXISTS measurements CASCADE`;
    });
  });

  describe('Integration with Non-Calculated Columns', () => {
    test('should work alongside regular columns', async () => {
      const schemaYaml = `
tables:
  employees:
    columns:
      employee_id: { type: integer, primary_key: true, sequence: true }
      first_name: { type: text }
      last_name: { type: text }
      full_name:
        type: text
        calculated: "first_name || ' ' || last_name"
      hourly_rate: { type: numeric, size: 10, decimal: 2 }
      hours_worked: { type: numeric, size: 10, decimal: 2 }
      total_pay:
        type: numeric
        size: 10
        decimal: 2
        calculated: "hourly_rate * hours_worked"
`;

      const schema = yaml.parse(schemaYaml);
      const result = await processor.processSchema(schema);

      expect(result.success).toBe(true);

      // Insert an employee
      await db`
        INSERT INTO employees (first_name, last_name, hourly_rate, hours_worked)
        VALUES (${'John'}, ${'Doe'}, ${25.00}, ${40})
      `;

      const queryResult = await db`
        SELECT first_name, last_name, full_name, hourly_rate, hours_worked, total_pay
        FROM employees
        WHERE first_name = ${'John'}
      `;

      expect(queryResult).toHaveLength(1);
      const row = queryResult[0];

      expect(row.full_name).toBe('John Doe');
      expect(parseFloat(row.total_pay)).toBe(1000.00);

      // Cleanup
      await db`DROP TABLE IF EXISTS employees CASCADE`;
    });
  });
});