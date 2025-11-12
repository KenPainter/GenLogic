#!/usr/bin/env bun
/**
 * GenLogic Complex Business Logic Test Runner
 *
 * Tests complex multi-step automation patterns (Group 8: Complex Business Logic)
 * Following the go-right-framework.md design:
 * - Markdown files contain sequences of YAML builds, SQL statements, and JSON assertions
 * - Each test drops all tables for isolation
 * - Tests run against real PostgreSQL to verify complex trigger chains and safe loops
 */

import { setupGoRightTests, runMarkdownTest } from './go-right-runner.js';
import { test, describe, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';

const setup = setupGoRightTests({
  schemasDir: join(import.meta.dir, 'complex-biz-logic'),
  dumpDir: join(import.meta.dir, 'complex-biz-logic-out'),
  suiteName: 'Complex Business Logic',
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
