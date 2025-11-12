#!/usr/bin/env bun
/**
 * CLI Trigger Recreate Test
 *
 * Tests that GenLogic always drops and recreates triggers on every build.
 * This is critical because:
 * - Trigger code changes must take effect
 * - Stale triggers could cause subtle calculation bugs
 * - Documentation claims "Triggers are always dropped and recreated"
 */

import { test, expect, beforeAll, afterAll } from 'bun:test';
import { $ } from 'bun';
import pkg from 'pg';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
const { Pool } = pkg;

const testDb = 'genlogic_tests'; // Use shared test database
const testUser = process.env.USER || 'postgres';
const dumpDir = '/tmp/genlogic_trigger_recreate_test';
const schemaPath = join(import.meta.dir, 'cli', 'trigger-recreate-test-schema.yaml');

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

test('triggers are dropped and recreated on every build', async () => {
  // First build - creates triggers
  await $`bun src/cli.ts --schema ${schemaPath} --database ${testDb} --dump-dir ${dumpDir}`.quiet();

  // Get trigger OIDs after first build
  const pool = new Pool({
    host: '/var/run/postgresql',
    database: testDb,
    user: testUser
  });

  const firstBuild = await pool.query(`
    SELECT tgname, oid
    FROM pg_trigger
    WHERE tgname LIKE '%genlogic%'
    ORDER BY tgname
  `);

  expect(firstBuild.rows.length).toBeGreaterThan(0); // Should have triggers

  const firstOids = firstBuild.rows.map(r => r.oid);
  const firstNames = firstBuild.rows.map(r => r.tgname);

  // Second build - IDENTICAL schema
  await $`bun src/cli.ts --schema ${schemaPath} --database ${testDb} --dump-dir ${dumpDir}`.quiet();

  // Get trigger OIDs after second build
  const secondBuild = await pool.query(`
    SELECT tgname, oid
    FROM pg_trigger
    WHERE tgname LIKE '%genlogic%'
    ORDER BY tgname
  `);

  expect(secondBuild.rows.length).toBe(firstBuild.rows.length); // Same number of triggers

  const secondOids = secondBuild.rows.map(r => r.oid);
  const secondNames = secondBuild.rows.map(r => r.tgname);

  // Trigger names should be identical
  expect(secondNames).toEqual(firstNames);

  // But OIDs should be DIFFERENT (proving drop/recreate)
  for (let i = 0; i < firstOids.length; i++) {
    expect(secondOids[i]).not.toBe(firstOids[i]);
  }

  await pool.end();
});

afterAll(async () => {
  // Cleanup dump directory
  if (existsSync(dumpDir)) {
    rmSync(dumpDir, { recursive: true });
  }
});
