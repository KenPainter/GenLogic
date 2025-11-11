#!/usr/bin/env bun
/**
 * GenLogic Seed Rows Test Runner
 *
 * Tests seed data functionality (Group 6: Seed Data)
 * Following the go-right-framework.md design:
 * - Markdown files contain sequences of YAML builds, SQL statements, and JSON assertions
 * - Each test gets a fresh database (DROP/CREATE entire database for isolation)
 * - Tests run against real PostgreSQL to verify seed data insertion and trigger execution
 */

import { setupGoRightTests, runMarkdownTest } from './go-right-runner.js';
import { test, describe, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';

const setup = setupGoRightTests({
  schemasDir: join(import.meta.dir, 'seed-rows'),
  dumpDir: join(import.meta.dir, 'seed-rows-out'),
  suiteName: 'Seed Data',
  testDatabase: 'genlogic_test_seed_rows'
});

// Only create describe block if setup succeeded
if (setup) {
  describe(setup.config.suiteName, () => {
    let pool: any = null;

    beforeAll(async () => {
      pool = await setup.createPool();
    });

    afterAll(async () => {
      await setup.cleanup(pool);
    });

    for (const file of setup.testFiles) {
      test(file, async () => {
        await runMarkdownTest(file, pool, setup.config);
      }, { timeout: setup.timeout });
    }
  });
}
