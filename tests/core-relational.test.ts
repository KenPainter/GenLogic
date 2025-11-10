#!/usr/bin/env bun
/**
 * GenLogic Core Relational Test Runner
 *
 * Tests core relational database features (Group 1: Core Schema Operations)
 * Following the go-right-framework.md design:
 * - Markdown files contain sequences of YAML builds, SQL statements, and JSON assertions
 * - Each test gets a fresh database (DROP/CREATE entire database for isolation)
 * - Tests run against real PostgreSQL to verify DDL, triggers, and constraints
 */

import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { GenLogicProcessor } from '../src/processor.js';
import pkg from 'pg';
const { Pool } = pkg;

const SCHEMAS_DIR = join(import.meta.dir, 'core-relational');
const DUMP_DIR = join(import.meta.dir, 'core-relational-out');
const TEST_DATABASE = process.env.GENLOGIC_TEST_DB || 'genlogic_tests';
const TEST_USER = process.env.USER || 'postgres';

// Test step types
type TestStep =
  | { type: 'build'; content: string; lineNumber: number; heading?: string }
  | { type: 'sql'; content: string; lineNumber: number; heading?: string }
  | { type: 'assert'; content: string; lineNumber: number; heading?: string };

interface TestContext {
  lastBuildDumps: Record<string, any>;
  lastSelectResults: any[] | null;
  currentBaseName: string;
}

/**
 * Parse markdown test file into sequence of steps
 */
function parseMarkdownTest(mdContent: string): TestStep[] {
  const lines = mdContent.split('\n');
  const steps: TestStep[] = [];
  let currentType: 'yaml' | 'sql' | 'json' | null = null;
  let currentLines: string[] = [];
  let currentLineNumber = 0;
  let lastHeading: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track headings for better error messages
    if (line.trim().startsWith('##')) {
      lastHeading = line.trim();
    }

    // Check for code block start
    if (line.trim().startsWith('```yaml')) {
      currentType = 'yaml';
      currentLineNumber = i + 1;
      currentLines = [];
      continue;
    }
    if (line.trim().startsWith('```sql')) {
      currentType = 'sql';
      currentLineNumber = i + 1;
      currentLines = [];
      continue;
    }
    if (line.trim().startsWith('```json')) {
      currentType = 'json';
      currentLineNumber = i + 1;
      currentLines = [];
      continue;
    }

    // Check for code block end
    if (line.trim() === '```' && currentType) {
      // Create appropriate step
      if (currentType === 'yaml') {
        steps.push({
          type: 'build',
          content: currentLines.join('\n'),
          lineNumber: currentLineNumber,
          heading: lastHeading
        });
      } else if (currentType === 'sql') {
        steps.push({
          type: 'sql',
          content: currentLines.join('\n'),
          lineNumber: currentLineNumber,
          heading: lastHeading
        });
      } else if (currentType === 'json') {
        steps.push({
          type: 'assert',
          content: currentLines.join('\n'),
          lineNumber: currentLineNumber,
          heading: lastHeading
        });
      }
      currentType = null;
      currentLines = [];
      continue;
    }

    // Accumulate lines in current block
    if (currentType) {
      currentLines.push(line);
    }
  }

  return steps;
}

/**
 * Create test database (once at start of suite)
 */
async function createTestDatabase(dbName: string): Promise<void> {
  const adminPool = new Pool({
    host: '/var/run/postgresql',
    database: 'postgres',
    user: TEST_USER
  });

  try {
    // Check if database exists
    const result = await adminPool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );

    if (result.rows.length === 0) {
      // Create database
      await adminPool.query(`CREATE DATABASE ${dbName}`);
    }
  } finally {
    await adminPool.end();
  }
}

/**
 * Drop test database (once at end of suite)
 */
async function dropTestDatabase(dbName: string): Promise<void> {
  const adminPool = new Pool({
    host: '/var/run/postgresql',
    database: 'postgres',
    user: TEST_USER
  });

  try {
    // Terminate any existing connections
    await adminPool.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid()
    `, [dbName]);

    // Drop database
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  } finally {
    await adminPool.end();
  }
}

/**
 * Drop all tables in the test database (between tests)
 * Much faster than dropping the entire database
 */
async function dropAllTables(pool: any): Promise<void> {
  // Get all tables in public schema
  const result = await pool.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
  `);

  // Drop each table with CASCADE to handle dependencies
  for (const row of result.rows) {
    await pool.query(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE`);
  }
}

/**
 * Execute build step (YAML schema)
 */
async function executeBuildStep(
  step: TestStep & { type: 'build' },
  context: TestContext
): Promise<void> {
  // Write YAML to temp file
  const schemaPath = join('/tmp', `${context.currentBaseName}.yaml`);
  writeFileSync(schemaPath, step.content);

  try {
    const processor = new GenLogicProcessor({
      database: TEST_DATABASE,
      user: TEST_USER,
      dryRun: false, // LIVE MODE - actually create tables
      dumpDir: DUMP_DIR,
    });

    // Suppress console output
    const originalLog = console.log;
    const originalError = console.error;
    console.log = () => {};
    console.error = () => {};

    try {
      await processor.process(schemaPath);
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    // Load dump files into context
    context.lastBuildDumps = {};
    const dumpFiles = ['newSchema', 'live', 'diff', 'sql'];
    for (const dumpType of dumpFiles) {
      const dumpPath = join(DUMP_DIR, `${context.currentBaseName}.${dumpType}.json`);
      if (existsSync(dumpPath)) {
        context.lastBuildDumps[dumpType] = JSON.parse(readFileSync(dumpPath, 'utf-8'));
      }
    }

    // Clear SQL results context
    context.lastSelectResults = null;
  } finally {
    // Clean up temp file
    if (existsSync(schemaPath)) {
      rmSync(schemaPath);
    }
  }
}

/**
 * Execute SQL step
 * Handles multi-statement SQL blocks by splitting on semicolons
 * Stores results only from the last SELECT statement
 */
async function executeSQLStep(
  step: TestStep & { type: 'sql' },
  context: TestContext,
  pool: any
): Promise<void> {
  // Split SQL into individual statements
  const statements = step.content
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  let lastSelectResult: any[] | null = null;

  // Execute each statement
  for (const statement of statements) {
    const result = await pool.query(statement);

    // If this statement returned rows (SELECT), save them
    // This will keep overwriting, so we end up with the last SELECT result
    if (result.rows) {
      lastSelectResult = result.rows;
    }
  }

  // Store the last SELECT result (or null if no SELECT statements)
  context.lastSelectResults = lastSelectResult;
}

/**
 * Execute assertion step
 */
async function executeAssertStep(
  step: TestStep & { type: 'assert' },
  context: TestContext,
  fileName: string
): Promise<void> {
  const assertions = JSON.parse(step.content);

  // Check if it's an array (SQL result assertion)
  if (Array.isArray(assertions)) {
    assertSQLResults(context.lastSelectResults, assertions, fileName, step.lineNumber);
  }
  // Check if it's an object with dump file assertions
  else {
    assertDumps(context.lastBuildDumps, assertions, fileName, step.lineNumber);
  }
}

/**
 * Assert SQL results match expected
 */
function assertSQLResults(
  actual: any[] | null,
  expected: any[],
  fileName: string,
  lineNumber: number
): void {
  if (actual === null) {
    throw new Error(
      `[${fileName}:${lineNumber}] No SQL results available for assertion. ` +
      `Did you forget to run a SELECT query before this assertion?`
    );
  }

  const actualStr = JSON.stringify(actual, null, 2);
  const expectedStr = JSON.stringify(expected, null, 2);

  if (actualStr !== expectedStr) {
    throw new Error(
      `[${fileName}:${lineNumber}] SQL result mismatch\n\n` +
      `Expected:\n${expectedStr}\n\n` +
      `Actual:\n${actualStr}`
    );
  }
}

/**
 * Assert dump files match expectations
 */
function assertDumps(
  dumps: Record<string, any>,
  assertions: Record<string, any>,
  fileName: string,
  lineNumber: number
): void {
  const failures: string[] = [];

  for (const [dumpType, checks] of Object.entries(assertions)) {
    if (!dumps[dumpType]) {
      failures.push(`Missing dump file: ${dumpType}.json`);
      continue;
    }

    const data = dumps[dumpType];

    for (const [path, expectedValue] of Object.entries(checks)) {
      const actualValue = getValueByPath(data, path);

      // Handle sigil: @exists - checks if value exists (truthy, not null/undefined)
      if (expectedValue === '@exists') {
        if (actualValue === null || actualValue === undefined) {
          failures.push(
            `${dumpType}.${path}:\n` +
            `  Expected: value to exist (@exists)\n` +
            `  Actual:   ${actualValue}`
          );
        }
      }
      // Exact match comparison
      else if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
        failures.push(
          `${dumpType}.${path}:\n` +
          `  Expected: ${JSON.stringify(expectedValue)}\n` +
          `  Actual:   ${JSON.stringify(actualValue)}`
        );
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `[${fileName}:${lineNumber}] Dump assertion failures:\n\n${failures.join('\n\n')}`
    );
  }
}

/**
 * Get value from nested object by dotted path
 * Supports: "tables.users", "errors.length", "statements[0]"
 */
function getValueByPath(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Handle array index notation: "statements[0]"
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, arrayName, indexStr] = arrayMatch;
      current = current[arrayName];
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[parseInt(indexStr, 10)];
    } else {
      current = current[part];
    }
  }

  return current;
}

/**
 * Run a single markdown test file
 * Uses shared database and pool - just drops tables between tests
 */
async function runMarkdownTest(fileName: string, pool: any): Promise<void> {
  const baseName = fileName.replace(/\.md$/, '');
  const mdPath = join(SCHEMAS_DIR, fileName);
  const mdContent = readFileSync(mdPath, 'utf-8');
  const steps = parseMarkdownTest(mdContent);

  // Drop all tables to start fresh (much faster than recreating database)
  await dropAllTables(pool);

  const context: TestContext = {
    lastBuildDumps: {},
    lastSelectResults: null,
    currentBaseName: baseName
  };

  // Execute steps sequentially
  for (const step of steps) {
    try {
      switch (step.type) {
        case 'build':
          await executeBuildStep(step, context);
          break;
        case 'sql':
          await executeSQLStep(step, context, pool);
          break;
        case 'assert':
          await executeAssertStep(step, context, fileName);
          break;
      }
    } catch (error) {
      const heading = step.heading ? `\nSection: ${step.heading}` : '';
      throw new Error(
        `❌ Test Failed: ${fileName}${heading}\n` +
        `Line ${step.lineNumber}: ${step.type} step\n\n` +
        (error instanceof Error ? error.message : String(error))
      );
    }
  }
}

// Discover test files
if (!existsSync(SCHEMAS_DIR)) {
  console.warn(`Warning: Test directory does not exist: ${SCHEMAS_DIR}`);
  console.warn(`Skipping core-relational tests.`);
} else {
  // Clear and recreate dump directory
  if (existsSync(DUMP_DIR)) {
    rmSync(DUMP_DIR, { recursive: true, force: true });
  }
  mkdirSync(DUMP_DIR, { recursive: true });

  const testFiles = readdirSync(SCHEMAS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort();

  if (testFiles.length === 0) {
    console.warn(`Warning: No test files found in ${SCHEMAS_DIR}`);
  } else {
    // Shared database connection pool for all tests
    let sharedPool: any = null;

    describe('Group 1: Core Schema Operations', () => {
      // Setup: Create database and pool once before all tests
      beforeAll(async () => {
        await createTestDatabase(TEST_DATABASE);
        sharedPool = new Pool({
          host: '/var/run/postgresql',
          database: TEST_DATABASE,
          user: TEST_USER
        });
      });

      // Teardown: Close pool and drop database once after all tests
      afterAll(async () => {
        if (sharedPool) {
          await sharedPool.end();
        }
        if (!process.env.GENLOGIC_KEEP_TEST_DB) {
          await dropTestDatabase(TEST_DATABASE);
        }
      });

      // Run each test with the shared pool
      for (const file of testFiles) {
        test(file, async () => {
          await runMarkdownTest(file, sharedPool);
        }, { timeout: 30000 }); // 30 second timeout for database operations
      }
    });
  }
}
