#!/usr/bin/env bun
/**
 * Phase 20 Test Suite - Schema Flattening
 *
 * Tests Phase 20: Schema flattening and dependency graph validation
 *
 * Convention:
 * - Schemas WITHOUT "20-error" in name: expect SUCCESS
 * - Schemas WITH "20-error" in name: expect FAILURE
 * - Schemas with .assertions.json: validate specific keys/values
 */

import { test, expect, describe } from 'bun:test';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { GenLogicProcessor } from '../src/processor.js';
import { matchFlattenAssertions, type Assertions } from './assertion-matcher.js';

const SCHEMAS_DIR = join(import.meta.dir, 'schemas');
const DUMP_DIR = join(import.meta.dir, '20-flattened');

// Find all .yaml files in schemas directory
// Only include files without error prefix, or files with 20-error prefix
const schemaFiles = readdirSync(SCHEMAS_DIR)
  .filter(f => f.endsWith('.yaml'))
  .filter(f => !f.match(/^\d+-error/) || f.startsWith('20-error'))
  .sort();

describe('Phase 20 - Schema Flattening', () => {
  for (const file of schemaFiles) {
    const schemaPath = join(SCHEMAS_DIR, file);
    const expectFailure = file.startsWith('20-error');

    // Check if assertions file exists
    const baseName = file.replace(/\.yaml$/, '');
    const assertionsPath = join(SCHEMAS_DIR, `${baseName}.assertions.json`);
    const hasAssertions = existsSync(assertionsPath);

    if (expectFailure) {
      test(`${file} should FAIL flattening`, async () => {
        // Check for expected error file
        const expectedErrorPath = join(SCHEMAS_DIR, `${baseName}.expected-error.txt`);

        if (!existsSync(expectedErrorPath)) {
          throw new Error(`Missing expected error file: ${baseName}.expected-error.txt`);
        }

        const expectedError = readFileSync(expectedErrorPath, 'utf-8').trim();

        // Suppress console output during tests
        const originalLog = console.log;
        const originalError = console.error;
        console.log = () => {};
        console.error = () => {};

        try {
          const processor = new GenLogicProcessor({
            database: 'dummy_db',
            user: process.env.USER || 'test',
            dryRun: true,
            stopAfter: 'flattened',
            dumpDir: DUMP_DIR
          });

          // Should throw an error with expected message
          await processor.process(schemaPath);

          // If we get here, test failed - no error was thrown
          throw new Error(`Expected error but process succeeded`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          if (!errorMessage.includes(expectedError)) {
            throw new Error(
              `Wrong error message.\nExpected to include: "${expectedError}"\nActual: "${errorMessage}"`
            );
          }
        } finally {
          console.log = originalLog;
          console.error = originalError;
        }
      });
    } else {
      const testDescription = hasAssertions
        ? `${file} should PASS flattening (with assertions)`
        : `${file} should PASS flattening`;

      test(testDescription, async () => {
        // Suppress console output during tests
        const originalLog = console.log;
        const originalError = console.error;
        console.log = () => {};
        console.error = () => {};

        try {
          const processor = new GenLogicProcessor({
            database: 'dummy_db',
            user: process.env.USER || 'test',
            dryRun: true,
            stopAfter: 'flattened',
            dumpDir: DUMP_DIR
          });

          // Should not throw
          await expect(processor.process(schemaPath)).resolves.toBeUndefined();

          if (hasAssertions) {
            const assertions: Assertions = JSON.parse(
              readFileSync(assertionsPath, 'utf-8')
            );

            if (assertions.flatten) {
              // Read the generated .flat.json output
              const flatJsonPath = join(DUMP_DIR, `${baseName}.flat.json`);
              const flatSchema = JSON.parse(readFileSync(flatJsonPath, 'utf-8'));

              // Match assertions
              const result = matchFlattenAssertions(flatSchema, assertions.flatten);

              if (!result.pass) {
                throw new Error(
                  `Flatten assertions failed:\n${result.failures.join('\n')}`
                );
              }
            }
          }
        } finally {
          console.log = originalLog;
          console.error = originalError;
        }
      });
    }
  }
});
