#!/usr/bin/env bun
/**
 * GenLogic Schema Reusable Tokens Test Runner
 *
 * Tests constants and reusable columns (Group 7: Schema Reusable Tokens)
 * Following the go-right-framework.md design:
 * - Markdown files contain sequences of YAML builds, SQL statements, and JSON assertions
 * - Each test gets a fresh database (DROP/CREATE entire database for isolation)
 * - Tests run against real PostgreSQL to verify constant substitution and reusable column definitions
 */

import { setupGoRightTests, runMarkdownTest } from './go-right-runner.js';
import { test, describe, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';

const setup = setupGoRightTests({
  schemasDir: join(import.meta.dir, 'schema-reusable-tokens'),
  dumpDir: join(import.meta.dir, 'schema-reusable-tokens-out'),
  suiteName: 'Group 7: Schema Reusable Tokens',
  testDatabase: 'genlogic_test_schema_reusable_tokens'
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
