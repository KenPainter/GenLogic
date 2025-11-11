#!/usr/bin/env bun
/**
 * GenLogic Non-Subvertible Test Runner
 *
 * Tests that automated columns cannot be subverted by direct INSERT/UPDATE attempts
 * (Group 10: Non-Subvertible)
 * Following the go-right-framework.md design:
 * - Markdown files contain sequences of YAML builds, SQL statements, and JSON assertions
 * - Each test gets a fresh database (DROP/CREATE entire database for isolation)
 * - Tests run against real PostgreSQL to verify trigger overwrites and column-level permissions
 */

import { setupGoRightTests, runMarkdownTest } from './go-right-runner.js';
import { test, describe, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';

const setup = setupGoRightTests({
  schemasDir: join(import.meta.dir, 'non-subvertible'),
  dumpDir: join(import.meta.dir, 'non-subvertible-out'),
  suiteName: 'Non-Subvertible',
  testDatabase: 'genlogic_test_nonsubvertible'
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
