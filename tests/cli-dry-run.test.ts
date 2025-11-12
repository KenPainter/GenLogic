#!/usr/bin/env bun
/**
 * CLI Dry-Run Test
 *
 * Tests that --dry-run flag:
 * 1. Does NOT execute DDL against the database
 * 2. DOES generate SQL output files
 * 3. Successfully validates and processes the schema
 */

import { test, expect, beforeAll, afterAll } from 'bun:test';
import { $ } from 'bun';
import pkg from 'pg';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
const { Pool } = pkg;

const testDb = 'genlogic_tests'; // Use shared test database
const testUser = process.env.USER || 'postgres';
const dumpDir = '/tmp/genlogic_dry_run_test';
const schemaPath = join(import.meta.dir, 'cli', 'dry-run-test-schema.yaml');

beforeAll(async () => {
  // Clean up dump directory
  if (existsSync(dumpDir)) {
    rmSync(dumpDir, { recursive: true });
  }
  mkdirSync(dumpDir, { recursive: true });

  // Drop all tables in shared database
  const pool = new Pool({
    host: '/var/run/postgresql',
    database: testDb,
    user: testUser
  });

  const result = await pool.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
  `);

  for (const row of result.rows) {
    await pool.query(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE`);
  }

  await pool.end();
});

test('--dry-run does not modify database but generates files', async () => {
  // Run GenLogic with --dry-run
  const result = await $`bun src/cli.ts --schema ${schemaPath} --database ${testDb} --dry-run --dump-dir ${dumpDir}`.text();

  // Verify success message
  expect(result).toContain('GenLogic processing completed successfully');

  // Verify NO tables were created
  const testPool = new Pool({
    host: '/var/run/postgresql',
    database: testDb,
    user: testUser
  });

  const tableResult = await testPool.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
  `);

  expect(tableResult.rows.length).toBe(0); // No tables created

  await testPool.end();

  // Verify SQL files WERE generated
  const baseName = 'dry-run-test-schema';
  expect(existsSync(`${dumpDir}/${baseName}.sql`)).toBe(true);
  expect(existsSync(`${dumpDir}/${baseName}.sql.json`)).toBe(true);
  expect(existsSync(`${dumpDir}/${baseName}.newSchema.json`)).toBe(true);
  expect(existsSync(`${dumpDir}/${baseName}.diff.json`)).toBe(true);
});

afterAll(async () => {
  // Cleanup dump directory
  if (existsSync(dumpDir)) {
    rmSync(dumpDir, { recursive: true });
  }
});
