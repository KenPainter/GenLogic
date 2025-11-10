#!/usr/bin/env bun
/**
 * GenLogic Error Test Runner
 *
 * Focused test runner for schema validation errors.
 * Each test validates exact error count and error message patterns.
 */

import { test, expect, describe } from 'bun:test';
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { GenLogicProcessor } from '../src/processor.js';

const SCHEMAS_DIR = join(import.meta.dir, 'schema-errors');
const DUMP_DIR = join(import.meta.dir, 'schema-errors-out');

// Clear and recreate dump directory before test run
if (existsSync(DUMP_DIR)) {
  rmSync(DUMP_DIR, { recursive: true, force: true });
}
mkdirSync(DUMP_DIR, { recursive: true });

/**
 * Parse markdown test file
 * Extracts YAML schema and expected errors from markdown code blocks
 */
function parseMarkdownTest(mdContent: string): {
  yaml: string;
  expectedErrors: Array<{ location: string; message: string }>;
} {
  const lines = mdContent.split('\n');
  let inYamlBlock = false;
  let inErrorsBlock = false;
  const yamlLines: string[] = [];
  const errorLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // YAML block
    if (line.trim().startsWith('```yaml')) {
      inYamlBlock = true;
      continue;
    }
    if (line.trim() === '```' && inYamlBlock) {
      inYamlBlock = false;
      continue;
    }
    if (inYamlBlock) {
      yamlLines.push(line);
      continue;
    }

    // Expected Errors section
    if (line.trim() === '## Expected Errors') {
      const nextBlockStart = i + 2; // Skip "## Expected Errors" and blank line
      if (lines[nextBlockStart]?.trim() === '```json') {
        let j = nextBlockStart + 1;
        while (j < lines.length && lines[j].trim() !== '```') {
          errorLines.push(lines[j]);
          j++;
        }
      }
    }
  }

  if (yamlLines.length === 0) {
    throw new Error('No YAML schema found in markdown');
  }

  if (errorLines.length === 0) {
    throw new Error('No Expected Errors section found in markdown');
  }

  const expectedErrors = JSON.parse(errorLines.join('\n'));

  if (!Array.isArray(expectedErrors)) {
    throw new Error('Expected Errors must be a JSON array');
  }

  return {
    yaml: yamlLines.join('\n'),
    expectedErrors
  };
}

/**
 * Test a schema that should fail with specific errors
 */
async function testErrorSchema(file: string) {
  const baseName = file.replace(/\.md$/, '');

  // Parse markdown file
  const mdPath = join(SCHEMAS_DIR, file);
  const mdContent = readFileSync(mdPath, 'utf-8');
  const parsed = parseMarkdownTest(mdContent);

  // Write YAML to temp file for processing
  const schemaPath = join('/tmp', `${baseName}.yaml`);
  writeFileSync(schemaPath, parsed.yaml);

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
      dumpDir: DUMP_DIR,
    });

    // Should exit with errors - process.exit(1) will throw in test environment
    await processor.process(schemaPath);

    // If we get here, test failed - no error was detected
    throw new Error(`Expected schema validation to fail, but it succeeded`);
  } catch (error) {
    // Expected to fail - now verify the errors match
    const newSchemaPath = join(DUMP_DIR, `${baseName}.newSchema.json`);

    if (!existsSync(newSchemaPath)) {
      throw new Error(`Missing newSchema dump file: ${baseName}.newSchema.json`);
    }

    const newSchema = JSON.parse(readFileSync(newSchemaPath, 'utf-8'));
    const actualErrors = newSchema.errors || [];

    // Verify error count matches
    if (actualErrors.length !== parsed.expectedErrors.length) {
      throw new Error(
        `[${file}] Error count mismatch\n` +
        `  Expected: ${parsed.expectedErrors.length} error(s)\n` +
        `  Actual:   ${actualErrors.length} error(s)\n\n` +
        `Expected errors:\n${JSON.stringify(parsed.expectedErrors, null, 2)}\n\n` +
        `Actual errors:\n${JSON.stringify(actualErrors, null, 2)}`
      );
    }

    // Verify each error matches
    for (let i = 0; i < parsed.expectedErrors.length; i++) {
      const expected = parsed.expectedErrors[i];
      const actual = actualErrors[i];

      if (actual.location !== expected.location) {
        throw new Error(
          `[${file}] Error ${i + 1}/${actualErrors.length} - LOCATION mismatch\n` +
          `  Expected location: "${expected.location}"\n` +
          `  Actual location:   "${actual.location}"\n` +
          `  Expected message:  "${expected.message}"\n` +
          `  Actual message:    "${actual.message}"`
        );
      }

      if (actual.message !== expected.message) {
        throw new Error(
          `[${file}] Error ${i + 1}/${actualErrors.length} - MESSAGE mismatch\n` +
          `  Location: "${actual.location}"\n` +
          `  Expected message: "${expected.message}"\n` +
          `  Actual message:   "${actual.message}"`
        );
      }
    }
  } finally {
    console.log = originalLog;
    console.error = originalError;

    // Clean up temp file
    if (existsSync(schemaPath)) {
      rmSync(schemaPath);
    }
  }
}

// Discover all error test files
const errorTestFiles = readdirSync(SCHEMAS_DIR)
  .filter(f => f.endsWith('.md'))
  .sort();

// Create one test suite
describe('Schema Validation Errors', () => {
  for (const file of errorTestFiles) {
    test(file, async () => {
      await testErrorSchema(file);
    });
  }
});
