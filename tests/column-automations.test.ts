#!/usr/bin/env bun
/**
 * GenLogic Column Automations Test Runner
 *
 * Tests column automation features (Groups 2, 3, 4: SYNC, SNAPSHOT, Aggregations, Formulas)
 * Following the go-right-framework.md design:
 * - Markdown files contain sequences of YAML builds, SQL statements, and JSON assertions
 * - Each test gets a fresh database (DROP all tables for isolation)
 * - Tests run against real PostgreSQL to verify DDL, triggers, and constraints
 */

import { setupGoRightTests, runMarkdownTest } from './go-right-runner.js';
import { test, describe, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';

const setup = setupGoRightTests({
  schemasDir: join(import.meta.dir, 'column-automations'),
  dumpDir: join(import.meta.dir, 'column-automations-out'),
  suiteName: 'Column Automations',
  testDatabase: 'genlogic_tests'
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
