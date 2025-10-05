// CLI Integration Tests
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { $ } from 'bun';
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(process.cwd(), 'debug', 'cli-test');
const CLI_PATH = join(process.cwd(), 'src', 'cli.ts');

// Test database credentials for CLI integration tests
const TEST_DB = 'genlogic_test_cli';
const TEST_USER = 'ken';
const TEST_PASSWORD = 'password123';

describe('CLI Integration Tests', () => {
  beforeAll(() => {
    // Create test directory
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    // Clean up test directory
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('Help and Version', () => {
    test('should display help', async () => {
      const result = await $`bun run ${CLI_PATH} --help`.quiet().nothrow();
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain('GenLogic');
      expect(result.stdout.toString()).toContain('--database');
      expect(result.stdout.toString()).toContain('--schema');
    });

    test('should display version', async () => {
      const result = await $`bun run ${CLI_PATH} --version`.quiet().nothrow();
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('Validation Mode', () => {
    test('should validate a simple schema in dry-run mode', async () => {
      const schemaPath = join(TEST_DIR, 'simple.yaml');
      const schema = `
columns:
  id: serial primary key
  name: varchar(100)

tables:
  users:
    columns:
      id: null
      name: null
`;
      writeFileSync(schemaPath, schema);

      const result = await $`bun run ${CLI_PATH} -s ${schemaPath} -d ${TEST_DB} -u ${TEST_USER} -w ${TEST_PASSWORD} --dry-run`.quiet().nothrow();
      expect(result.exitCode).toBe(0);

      unlinkSync(schemaPath);
    });

    test('should detect invalid column reference', async () => {
      const schemaPath = join(TEST_DIR, 'invalid.yaml');
      const schema = `
columns:
  id: integer primary key

tables:
  users:
    columns:
      id: null
      nonexistent: null  # This column doesn't exist
`;
      writeFileSync(schemaPath, schema);

      const result = await $`bun run ${CLI_PATH} -s ${schemaPath} -d ${TEST_DB} -u ${TEST_USER} -w ${TEST_PASSWORD} --dry-run`.quiet().nothrow();
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain('nonexistent');

      unlinkSync(schemaPath);
    });

    test('should detect circular foreign key references', async () => {
      const schemaPath = join(TEST_DIR, 'circular.yaml');
      const schema = `
tables:
  a:
    columns:
      id: integer primary key
      b_id: integer
    foreign_keys:
      b: { table: b }

  b:
    columns:
      id: integer primary key
      a_id: integer
    foreign_keys:
      a: { table: a }
`;
      writeFileSync(schemaPath, schema);

      const result = await $`bun run ${CLI_PATH} -s ${schemaPath} -d ${TEST_DB} -u ${TEST_USER} -w ${TEST_PASSWORD} --dry-run`.quiet().nothrow();
      // Should detect cycle
      expect(result.exitCode).toBe(1);

      unlinkSync(schemaPath);
    });
  });

  describe('Dry Run Mode', () => {
    test('should show SQL without executing in dry run mode', async () => {
      const schemaPath = join(TEST_DIR, 'dryrun.yaml');
      const schema = `
tables:
  products:
    columns:
      id: serial primary key
      name: varchar(100)
      price: numeric(10,2)
`;
      writeFileSync(schemaPath, schema);

      const result = await $`bun run ${CLI_PATH} -s ${schemaPath} -d genlogic_test_calc -u ken -w password123 --dry-run`.quiet().nothrow();

      const output = result.stdout.toString();
      expect(output).toContain('CREATE TABLE');
      expect(output).toContain('products');

      unlinkSync(schemaPath);
    });
  });

  describe('Error Handling', () => {
    test('should require database name', async () => {
      const schemaPath = join(TEST_DIR, 'test.yaml');
      writeFileSync(schemaPath, 'tables: {}');

      const result = await $`bun run ${CLI_PATH} -s ${schemaPath}`.quiet().nothrow();
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain('Database name is required');

      unlinkSync(schemaPath);
    });

    test('should require username', async () => {
      const schemaPath = join(TEST_DIR, 'test.yaml');
      writeFileSync(schemaPath, 'tables: {}');

      const result = await $`bun run ${CLI_PATH} -s ${schemaPath} -d testdb`.quiet().nothrow();
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain('Username is required');

      unlinkSync(schemaPath);
    });

    test('should require password', async () => {
      const schemaPath = join(TEST_DIR, 'test.yaml');
      writeFileSync(schemaPath, 'tables: {}');

      const result = await $`bun run ${CLI_PATH} -s ${schemaPath} -d testdb -u testuser`.quiet().nothrow();
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain('Password is required');

      unlinkSync(schemaPath);
    });

    test('should handle missing schema file', async () => {
      const result = await $`bun run ${CLI_PATH} -s nonexistent.yaml -d ${TEST_DB} -u ${TEST_USER} -w ${TEST_PASSWORD} --dry-run`.quiet().nothrow();
      expect(result.exitCode).toBe(1);
    });

    test('should handle invalid YAML', async () => {
      const schemaPath = join(TEST_DIR, 'invalid-yaml.yaml');
      writeFileSync(schemaPath, 'tables:\n  invalid: [unclosed');

      const result = await $`bun run ${CLI_PATH} -s ${schemaPath} -d ${TEST_DB} -u ${TEST_USER} -w ${TEST_PASSWORD} --dry-run`.quiet().nothrow();
      expect(result.exitCode).toBe(1);

      unlinkSync(schemaPath);
    });
  });

  describe('Schema Features', () => {
    test('should validate calculated columns', async () => {
      const schemaPath = join(TEST_DIR, 'calculated.yaml');
      const schema = `
tables:
  orders:
    columns:
      price: numeric(10,2)
      quantity: integer
      total:
        type: numeric(10,2)
        generated: price * quantity
`;
      writeFileSync(schemaPath, schema);

      const result = await $`bun run ${CLI_PATH} -s ${schemaPath} -d ${TEST_DB} -u ${TEST_USER} -w ${TEST_PASSWORD} --dry-run`.quiet().nothrow();
      expect(result.exitCode).toBe(0);

      unlinkSync(schemaPath);
    });

    test('should validate pattern matching tables', async () => {
      const schemaPath = join(TEST_DIR, 'matching.yaml');
      const schema = `
matching_tables:
  expense_rules:
    result_column_name: category
`;
      writeFileSync(schemaPath, schema);

      const result = await $`bun run ${CLI_PATH} -s ${schemaPath} -d ${TEST_DB} -u ${TEST_USER} -w ${TEST_PASSWORD} --dry-run`.quiet().nothrow();
      expect(result.exitCode).toBe(0);

      unlinkSync(schemaPath);
    });

    test('should validate foreign keys', async () => {
      const schemaPath = join(TEST_DIR, 'fks.yaml');
      const schema = `
tables:
  users:
    columns:
      id: integer primary key

  posts:
    columns:
      id: integer primary key
      user_id: integer
    foreign_keys:
      user:
        table: users
`;
      writeFileSync(schemaPath, schema);

      const result = await $`bun run ${CLI_PATH} -s ${schemaPath} -d ${TEST_DB} -u ${TEST_USER} -w ${TEST_PASSWORD} --dry-run`.quiet().nothrow();
      expect(result.exitCode).toBe(0);

      unlinkSync(schemaPath);
    });

    test('should validate inheritance', async () => {
      const schemaPath = join(TEST_DIR, 'inheritance.yaml');
      const schema = `
columns:
  id: serial primary key
  created_at: timestamp

tables:
  users:
    columns:
      id: null  # Inherit from columns
      name: varchar(100)
      created_at: null  # Inherit from columns
`;
      writeFileSync(schemaPath, schema);

      const result = await $`bun run ${CLI_PATH} -s ${schemaPath} -d ${TEST_DB} -u ${TEST_USER} -w ${TEST_PASSWORD} --dry-run`.quiet().nothrow();
      expect(result.exitCode).toBe(0);

      unlinkSync(schemaPath);
    });
  });

  describe('Command Line Options', () => {
    test('should accept custom host and port', async () => {
      const schemaPath = join(TEST_DIR, 'test.yaml');
      writeFileSync(schemaPath, 'tables: {}');

      const result = await $`bun run ${CLI_PATH} -s ${schemaPath} -h 127.0.0.1 -p 5432 -d ${TEST_DB} -u ${TEST_USER} -w ${TEST_PASSWORD} --dry-run`.quiet().nothrow();
      expect(result.exitCode).toBe(0);

      unlinkSync(schemaPath);
    });

    test('should use default schema path', async () => {
      const defaultSchemaPath = join(process.cwd(), 'schema.yaml');
      const schema = `
tables:
  test:
    columns:
      id: integer primary key
`;
      writeFileSync(defaultSchemaPath, schema);

      const result = await $`bun run ${CLI_PATH} -d ${TEST_DB} -u ${TEST_USER} -w ${TEST_PASSWORD} --dry-run`.quiet().nothrow();
      expect(result.exitCode).toBe(0);

      unlinkSync(defaultSchemaPath);
    });
  });
});