#!/usr/bin/env bun
/**
 * CLI Test Runner - Black Box Testing
 *
 * Discovers and runs all CLI tests in a data-driven fashion.
 * Tests only interact with the CLI interface - no production code coupling.
 *
 * Usage:
 *   bun tests/run-cli-tests.ts              # Run all tests
 *   bun tests/run-cli-tests.ts 01-cli       # Run tests matching "01-cli"
 *   bun tests/run-cli-tests.ts 02-schema    # Run tests matching "02-schema"
 *
 * Test structure:
 *   tests/category/test-name/
 *     schema.yaml              - Input schema (optional for --help, --version)
 *     expect-exit-0.txt        - Success marker
 *     expect-exit-1.txt        - Failure marker
 *     expect-stdout.txt        - Patterns that must appear in stdout (supports regex: /pattern/)
 *     expect-stderr.txt        - Patterns that must appear in stderr (supports regex: /pattern/)
 *     test-setup.sql           - SQL to run BEFORE CLI execution (set up initial DB state)
 *     test-result.sql          - SQL to run AFTER CLI execution (insert data to test result)
 *     verify-*.sql             - SQL queries to run against DB
 *     expect-*.txt             - Expected output for corresponding verify-*.sql
 *     args.txt                 - Extra CLI args
 *     run-as-app-user.txt      - Run verify SQL as restricted app user (not setup user)
 *
 * Pattern matching:
 *   - Lines starting with # are comments (ignored)
 *   - Lines like /regex/ are treated as regex patterns
 *   - Other lines are treated as literal substrings
 */

import { readdirSync, existsSync, readFileSync, statSync } from 'fs';
import { join, relative, basename } from 'path';
import { $ } from 'bun';
import pkg from 'pg';
const { Pool } = pkg;
import type { Pool as PgPool } from 'pg';

const CLI_PATH = join(process.cwd(), 'src', 'cli.ts');
const TESTS_DIR = join(process.cwd(), 'tests');

// Test configuration - Unix socket peer authentication
const TEST_USER = process.env.USER;
if (!TEST_USER) {
  console.error('Error: Cannot determine current user (USER environment variable not set)');
  process.exit(1);
}
const TEST_DB = process.env.GENLOGIC_TEST_DB || 'genlogic_test_cli';

interface TestCase {
  name: string;
  path: string;
  schemaPath: string;
  expectedExit: 0 | 1;
  expectedStdout?: string[];
  expectedStderr?: string[];
  verifySqlFiles: string[];  // e.g., verify-no-table.sql, verify-behavior.sql
  testSetupSql?: string;     // SQL to run BEFORE CLI execution
  testResultSql?: string;    // SQL to run AFTER CLI execution (was setupDataSql)
  extraArgs: string[];
  skipCommon: boolean;
  runAsAppUser: boolean;     // If true, run verify SQL as app user (not setup user)
}

function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

function discoverTests(): TestCase[] {
  const tests: TestCase[] = [];

  function scanDir(dir: string) {
    // Skip node_modules, .git, etc
    const dirName = basename(dir);
    if (dirName.startsWith('.') || dirName === 'node_modules') return;

    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      if (!statSync(fullPath).isDirectory()) continue;

      const hasExit0 = existsSync(join(fullPath, 'expect-exit-0.txt'));
      const hasExit1 = existsSync(join(fullPath, 'expect-exit-1.txt'));

      if (hasExit0 || hasExit1) {
        // This is a test directory
        if (hasExit0 && hasExit1) {
          console.error(`❌ Test ${relative(TESTS_DIR, fullPath)} has both expect-exit-0.txt and expect-exit-1.txt`);
          process.exit(1);
        }

        const expectedExit = hasExit0 ? 0 : 1;

        const schemaPath = join(fullPath, 'schema.yaml');
        const stdoutPath = join(fullPath, 'expect-stdout.txt');
        const stderrPath = join(fullPath, 'expect-stderr.txt');
        const argsPath = join(fullPath, 'args.txt');
        const testSetupPath = join(fullPath, 'test-setup.sql');
        const testResultPath = join(fullPath, 'test-result.sql');
        const runAsAppUserPath = join(fullPath, 'run-as-app-user.txt');

        const expectedStdout = existsSync(stdoutPath)
          ? readFileSync(stdoutPath, 'utf-8').trim().split('\n').filter(l => l.length > 0 && !l.trim().startsWith('#'))
          : undefined;

        const expectedStderr = existsSync(stderrPath)
          ? readFileSync(stderrPath, 'utf-8').trim().split('\n').filter(l => l.length > 0 && !l.trim().startsWith('#'))
          : undefined;

        // Find all verify-*.sql files
        const verifySqlFiles = entries
          .filter(e => e.startsWith('verify-') && e.endsWith('.sql'))
          .map(e => join(fullPath, e));

        let extraArgs: string[] = [];
        let skipCommon = false;
        if (existsSync(argsPath)) {
          const argsContent = readFileSync(argsPath, 'utf-8');
          const lines = argsContent.split('\n').filter(l => !l.trim().startsWith('#'));
          const argsStr = lines.join(' ').trim();
          if (argsStr.includes('--skip-common')) {
            skipCommon = true;
            extraArgs = argsStr.replace('--skip-common', '').trim().split(/\s+/).filter(a => a.length > 0);
          } else {
            extraArgs = argsStr.split(/\s+/).filter(a => a.length > 0);
          }
        }

        tests.push({
          name: relative(TESTS_DIR, fullPath),
          path: fullPath,
          schemaPath: existsSync(schemaPath) ? schemaPath : '',
          expectedExit,
          expectedStdout,
          expectedStderr,
          verifySqlFiles,
          testSetupSql: existsSync(testSetupPath) ? testSetupPath : undefined,
          testResultSql: existsSync(testResultPath) ? testResultPath : undefined,
          extraArgs,
          skipCommon,
          runAsAppUser: existsSync(runAsAppUserPath)
        });
      } else {
        // Recurse into subdirectory
        scanDir(fullPath);
      }
    }
  }

  scanDir(TESTS_DIR);
  return tests;
}

async function runTest(test: TestCase, setupPool: PgPool, appPool: PgPool | null): Promise<boolean> {
  // Clean database before each test (always use setup pool for this)
  try {
    await setupPool.query('DROP SCHEMA public CASCADE');
    await setupPool.query('CREATE SCHEMA public');
  } catch (e) {
    console.error(`Failed to clean database: ${e}`);
    return false;
  }

  let passed = true;
  const errors: string[] = [];

  // Run test-setup.sql if present (BEFORE CLI execution)
  if (test.testSetupSql) {
    const setupSql = readFileSync(test.testSetupSql, 'utf-8');
    try {
      await setupPool.query(setupSql);
    } catch (e) {
      passed = false;
      errors.push(`Failed to run test-setup.sql: ${e}`);
      return false; // Cannot continue if setup fails
    }
  }

  // Common args - Unix socket peer authentication
  const commonArgs = [
    '-d', TEST_DB
  ];

  // Build full command
  const args = [
    'run',
    CLI_PATH,
    ...(test.schemaPath ? ['-s', test.schemaPath] : []),
    ...(test.skipCommon ? [] : commonArgs),
    ...test.extraArgs
  ];

  const result = await $`bun ${args}`.nothrow().quiet();

  // Check exit code
  if (result.exitCode !== test.expectedExit) {
    passed = false;
    errors.push(`Expected exit ${test.expectedExit}, got ${result.exitCode}`);
  }

  // Check stdout patterns
  if (test.expectedStdout) {
    const stdout = result.stdout.toString().trim();
    for (const pattern of test.expectedStdout) {
      // Check if pattern is a regex (starts with / and ends with /)
      if (pattern.startsWith('/') && pattern.endsWith('/')) {
        const regex = new RegExp(pattern.slice(1, -1));
        if (!regex.test(stdout)) {
          passed = false;
          errors.push(`Expected stdout to match regex: ${pattern}`);
        }
      } else {
        if (!stdout.includes(pattern)) {
          passed = false;
          errors.push(`Expected stdout to contain: "${pattern}"`);
        }
      }
    }
  }

  // Check stderr patterns
  if (test.expectedStderr) {
    const stderr = result.stderr.toString().trim();
    for (const pattern of test.expectedStderr) {
      // Check if pattern is a regex (starts with / and ends with /)
      if (pattern.startsWith('/') && pattern.endsWith('/')) {
        const regex = new RegExp(pattern.slice(1, -1));
        if (!regex.test(stderr)) {
          passed = false;
          errors.push(`Expected stderr to match regex: ${pattern}`);
        }
      } else {
        if (!stderr.includes(pattern)) {
          passed = false;
          errors.push(`Expected stderr to contain: "${pattern}"`);
        }
      }
    }
  }

  // Run test-result.sql if present (AFTER CLI execution)
  if (test.testResultSql) {
    const resultSql = readFileSync(test.testResultSql, 'utf-8');
    try {
      await setupPool.query(resultSql);
    } catch (e) {
      passed = false;
      errors.push(`Failed to run test-result.sql: ${e}`);
    }
  }

  // Choose pool based on test configuration
  const verifyPool = test.runAsAppUser ? appPool : setupPool;

  // Run all verify-*.sql files and check results
  for (const verifySqlPath of test.verifySqlFiles) {
    const sqlContent = readFileSync(verifySqlPath, 'utf-8');
    const verifyName = basename(verifySqlPath, '.sql'); // e.g., "verify-no-table"
    const expectName = `expect-${verifyName.replace('verify-', '')}.txt`; // e.g., "expect-no-table.txt"
    const expectPath = join(test.path, expectName);

    if (!existsSync(expectPath)) {
      passed = false;
      errors.push(`Missing ${expectName} for ${basename(verifySqlPath)}`);
      continue;
    }

    // If test requires app user but none exists, error
    if (test.runAsAppUser && !verifyPool) {
      passed = false;
      errors.push(`Test requires app user but app user pool not available`);
      continue;
    }

    try {
      const queryResult = await verifyPool!.query(sqlContent);
      const actualOutput = JSON.stringify(queryResult.rows);
      const expectedOutput = readFileSync(expectPath, 'utf-8').trim();

      // Normalize whitespace for comparison
      const normalizedActual = normalizeWhitespace(actualOutput);
      const normalizedExpected = normalizeWhitespace(expectedOutput);

      if (normalizedActual !== normalizedExpected) {
        passed = false;
        errors.push(`${basename(verifySqlPath)} output mismatch`);
        errors.push(`  Expected: ${normalizedExpected}`);
        errors.push(`  Actual: ${normalizedActual}`);
      }
    } catch (e) {
      passed = false;
      errors.push(`Failed to run ${basename(verifySqlPath)}: ${e}`);
    }
  }

  // Report results
  if (passed) {
    console.log(`✅ ${test.name}`);
  } else {
    console.log(`❌ ${test.name}`);
    for (const error of errors) {
      console.log(`   ${error}`);
    }
  }

  return passed;
}

async function main() {
  // Optional filter: bun tests/run-cli-tests.ts [filter]
  const filter = process.argv[2];

  console.log('🔍 Discovering CLI tests...\n');

  let tests = discoverTests();

  // Apply filter if provided
  if (filter) {
    tests = tests.filter(t => t.name.includes(filter));
    console.log(`Filter: "${filter}"`);
  }

  // Sort tests: 000-dry-run-safety must be first
  tests.sort((a, b) => {
    if (a.name.startsWith('000-dry-run-safety')) return -1;
    if (b.name.startsWith('000-dry-run-safety')) return 1;
    return a.name.localeCompare(b.name);
  });

  console.log(`Found ${tests.length} tests\n`);

  // Connect to database as setup user using Unix socket
  let setupPool: PgPool;
  try {
    setupPool = new Pool({
      host: '/var/run/postgresql',
      database: TEST_DB,
      user: TEST_USER
    });
    // Test connection
    await setupPool.query('SELECT 1');
  } catch (e) {
    console.error(`Failed to connect to database: ${e}`);
    process.exit(1);
  }

  // Create app user if it doesn't exist (for permission testing)
  const APP_USER = `${TEST_DB}_app_user`;
  try {
    await setupPool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_USER}') THEN
          CREATE ROLE ${APP_USER} LOGIN;
        END IF;
      END $$;
    `);
  } catch (e) {
    console.error(`Failed to create app user: ${e}`);
    await setupPool.end();
    process.exit(1);
  }

  // Connect to database as app user (for permission testing)
  let appPool: PgPool | null = null;
  try {
    appPool = new Pool({
      host: '/var/run/postgresql',
      database: TEST_DB,
      user: APP_USER
    });
    // Test connection
    await appPool.query('SELECT 1');
  } catch (e) {
    console.error(`Warning: Failed to connect as app user (${APP_USER}): ${e}`);
    console.error(`Tests requiring app user will be skipped.`);
  }

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = await runTest(test, setupPool, appPool);
    if (result) {
      passed++;
    } else {
      failed++;

      // CRITICAL: If Test 0 fails, abort
      if (test.name.startsWith('000-dry-run-safety')) {
        console.error('\n🚨 CRITICAL FAILURE: Test 0 (dry-run safety) failed!');
        console.error('The system is UNSAFE - --dry-run does not prevent database modification.');
        console.error('ABORTING all remaining tests.');
        await setupPool.end();
        if (appPool) await appPool.end();
        process.exit(1);
      }
    }
  }

  await setupPool.end();
  if (appPool) await appPool.end();

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
