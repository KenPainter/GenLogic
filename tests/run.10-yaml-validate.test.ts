#!/usr/bin/env bun
/**
 * Phase 10 Test Suite - Schema Validation
 *
 * Tests Phase 10.x: YAML loading, constant substitution, and JSON schema validation
 *
 * Convention:
 * - Schemas WITHOUT "10-error" in name: expect SUCCESS
 * - Schemas WITH "10-error" in name: expect FAILURE
 */

import { test, expect, describe } from 'bun:test';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { GenLogicProcessor } from '../src/processor.js';

const SCHEMAS_DIR = join(import.meta.dir, 'schemas');

// Find all .yaml files in schemas directory
// Only include files without error prefix, or files with 10-error prefix
const schemaFiles = readdirSync(SCHEMAS_DIR)
  .filter(f => f.endsWith('.yaml'))
  .filter(f => !f.match(/^\d+-error/) || f.startsWith('10-error'))
  .sort();

describe('Phase 10 - Schema Validation', () => {
  for (const file of schemaFiles) {
    const schemaPath = join(SCHEMAS_DIR, file);
    const expectFailure = file.startsWith('10-error');

    if (expectFailure) {
      test(`${file} should FAIL validation`, async () => {
        // Check for expected error file
        const baseName = file.replace(/\.yaml$/, '');
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
            stopAfter: 'yaml-validate'
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
      test(`${file} should PASS validation`, async () => {
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
            stopAfter: 'yaml-validate'
          });

          // Should not throw
          await expect(processor.process(schemaPath)).resolves.toBeUndefined();
        } finally {
          console.log = originalLog;
          console.error = originalError;
        }
      });
    }
  }
});
