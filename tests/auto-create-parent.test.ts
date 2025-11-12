#!/usr/bin/env bun
/**
 * GenLogic Auto-Create Parent Test Runner
 *
 * Tests auto-create parent feature (Group 5: FK Auto-Create Parent)
 * Following the go-right-framework.md design:
 * - Markdown files contain sequences of YAML builds, SQL statements, and JSON assertions
 * - Each test gets a fresh database (DROP/CREATE entire database for isolation)
 * - Tests run against real PostgreSQL to verify auto-create parent functionality
 */

import { setupGoRightTests, runMarkdownTest } from './go-right-runner.js';
import { test, describe, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';

const setup = setupGoRightTests({
  schemasDir: join(import.meta.dir, 'auto-create-parent'),
  dumpDir: join(import.meta.dir, 'auto-create-parent-out'),
  suiteName: 'FK Auto-Create Parent',
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
