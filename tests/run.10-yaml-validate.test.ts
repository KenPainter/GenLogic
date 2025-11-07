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
import { readdirSync } from 'fs';
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

          // Should throw an error
          await expect(processor.process(schemaPath)).rejects.toThrow();
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
