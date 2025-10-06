#!/usr/bin/env bun
/**
 * CLI Test Runner - Black Box Testing
 *
 * Discovers and runs all CLI tests in a data-driven fashion.
 * Tests only interact with the CLI interface - no production code coupling.
 *
 * Test structure:
 *   tests/category/test-name/
 *     schema.yaml              - Input schema (optional for --help, --version)
 *     expect-exit-0.txt        - Success marker
 *     expect-exit-1.txt        - Failure marker
 *     expect-stdout.txt        - Patterns that must appear in stdout
 *     expect-stderr.txt        - Patterns that must appear in stderr
 *     verify-*.sql             - SQL queries to run against DB
 *     expect-*.txt             - Expected output for corresponding verify-*.sql
 *     setup-data.sql           - SQL to run before verify queries
 *     args.txt                 - Extra CLI args
 */

import { readdirSync, existsSync, readFileSync, statSync } from 'fs';
import { join, relative, basename } from 'path';
import { $ } from 'bun';
import { SQL } from 'bun';

const CLI_PATH = join(process.cwd(), 'src', 'cli.ts');
const TESTS_DIR = join(process.cwd(), 'tests');

// Password handling: optional for trust authentication
const TEST_PASSWORD = process.env.GENLOGIC_TEST_PASSWORD || '';
const TEST_USER = process.env.GENLOGIC_TEST_USER || process.env.USER || 'postgres';
const TEST_DB = process.env.GENLOGIC_TEST_DB || 'genlogic_test_cli';

interface TestCase {
  name: string;
  path: string;
  schemaPath: string;
  expectedExit: 0 | 1;
  expectedStdout?: string[];
  expectedStderr?: string[];
  verifySqlFiles: string[];  // e.g., verify-no-table.sql, verify-behavior.sql
  setupDataSql?: string;
  extraArgs: string[];
  skipCommon: boolean;
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
        const setupDataPath = join(fullPath, 'setup-data.sql');

        const expectedStdout = existsSync(stdoutPath)
          ? readFileSync(stdoutPath, 'utf-8').trim().split('\n').filter(l => l.length > 0)
          : undefined;

        const expectedStderr = existsSync(stderrPath)
          ? readFileSync(stderrPath, 'utf-8').trim().split('\n').filter(l => l.length > 0)
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
          setupDataSql: existsSync(setupDataPath) ? setupDataPath : undefined,
          extraArgs,
          skipCommon
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

async function runTest(test: TestCase, db: SQL): Promise<boolean> {
  // Clean database before each test
  try {
    await db`DROP SCHEMA public CASCADE`;
    await db`CREATE SCHEMA public`;
  } catch (e) {
    console.error(`Failed to clean database: ${e}`);
    return false;
  }

  // Common args (passwordless if no TEST_PASSWORD set)
  const commonArgs = [
    '-d', TEST_DB,
    '-u', TEST_USER,
    ...(TEST_PASSWORD ? ['-w', TEST_PASSWORD] : [])
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

  let passed = true;
  const errors: string[] = [];

  // Check exit code
  if (result.exitCode !== test.expectedExit) {
    passed = false;
    errors.push(`Expected exit ${test.expectedExit}, got ${result.exitCode}`);
  }

  // Check stdout patterns
  if (test.expectedStdout) {
    const stdout = result.stdout.toString();
    for (const pattern of test.expectedStdout) {
      if (!stdout.includes(pattern)) {
        passed = false;
        errors.push(`Expected stdout to contain: "${pattern}"`);
      }
    }
  }

  // Check stderr patterns
  if (test.expectedStderr) {
    const stderr = result.stderr.toString();
    for (const pattern of test.expectedStderr) {
      if (!stderr.includes(pattern)) {
        passed = false;
        errors.push(`Expected stderr to contain: "${pattern}"`);
      }
    }
  }

  // Run setup-data.sql if present
  if (test.setupDataSql) {
    const setupSql = readFileSync(test.setupDataSql, 'utf-8');
    try {
      await db.unsafe(setupSql);
    } catch (e) {
      passed = false;
      errors.push(`Failed to run setup-data.sql: ${e}`);
    }
  }

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

    try {
      const queryResult = await db.unsafe(sqlContent);
      const actualOutput = JSON.stringify(queryResult);
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
  console.log('🔍 Discovering CLI tests...\n');

  const tests = discoverTests();

  // Sort tests: 000-dry-run-safety must be first
  tests.sort((a, b) => {
    if (a.name.startsWith('000-dry-run-safety')) return -1;
    if (b.name.startsWith('000-dry-run-safety')) return 1;
    return a.name.localeCompare(b.name);
  });

  console.log(`Found ${tests.length} tests\n`);

  // Connect to database
  let db: SQL;
  try {
    db = new SQL({
      hostname: '127.0.0.1',
      database: TEST_DB,
      username: TEST_USER,
      ...(TEST_PASSWORD ? { password: TEST_PASSWORD } : {})
    });
  } catch (e) {
    console.error(`Failed to connect to database: ${e}`);
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = await runTest(test, db);
    if (result) {
      passed++;
    } else {
      failed++;

      // CRITICAL: If Test 0 fails, abort
      if (test.name.startsWith('000-dry-run-safety')) {
        console.error('\n🚨 CRITICAL FAILURE: Test 0 (dry-run safety) failed!');
        console.error('The system is UNSAFE - --dry-run does not prevent database modification.');
        console.error('ABORTING all remaining tests.');
        db.close();
        process.exit(1);
      }
    }
  }

  db.close();

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
