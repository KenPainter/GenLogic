#!/usr/bin/env bun
/**
 * Unified GenLogic Test Runner
 *
 * Convention:
 * - Test files can be either .yaml or .md format
 * - Markdown format contains YAML in code blocks plus expected errors and assertions
 * - Schemas WITH "NN-error" prefix (e.g., "10-error-foo.md"): expect FAILURE
 * - Schemas WITHOUT error prefix: expect SUCCESS
 *
 * Error tests are grouped into suites by their numeric prefix (e.g., all "10-error-*"
 * tests run in the "Error Group 10" suite). This helps organize related error cases.
 *
 * All tests (both success and error) run through the full processing pipeline.
 */

import { test, expect, describe } from 'bun:test';
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, basename } from 'path';
import { GenLogicProcessor } from '../src/processor.js';
import { matchFlattenAssertions, type Assertions } from './assertion-matcher.js';

/**
 * Parse markdown test file
 * Extracts YAML schema, expected error, and assertions from markdown code blocks
 */
function parseMarkdownTest(mdContent: string): {
  yaml: string;
  expectedError?: string;
  assertions?: Record<string, any>;
} {
  const lines = mdContent.split('\n');
  let inYamlBlock = false;
  const yamlLines: string[] = [];
  const errorLines: string[] = [];
  const assertionLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```yaml')) {
      inYamlBlock = true;
      continue;
    }
    if (line.trim().startsWith('```') && inYamlBlock) {
      inYamlBlock = false;
      continue;
    }
    if (inYamlBlock) {
      yamlLines.push(line);
    }

    // Check for Expected Error section
    if (line.trim() === '## Expected Error') {
      const nextBlockStart = i + 2; // Skip "## Expected Error" and blank line
      if (lines[nextBlockStart]?.trim() === '```') {
        let j = nextBlockStart + 1;
        while (j < lines.length && lines[j].trim() !== '```') {
          errorLines.push(lines[j]);
          j++;
        }
      }
    }

    // Check for Assertions section
    if (line.trim() === '## Assertions') {
      const nextBlockStart = i + 2; // Skip "## Assertions" and blank line
      if (lines[nextBlockStart]?.trim() === '```json') {
        let j = nextBlockStart + 1;
        while (j < lines.length && lines[j].trim() !== '```') {
          assertionLines.push(lines[j]);
          j++;
        }
      }
    }
  }

  return {
    yaml: yamlLines.join('\n'),
    expectedError: errorLines.length > 0 ? errorLines.join('\n').trim() : undefined,
    assertions: assertionLines.length > 0 ? JSON.parse(assertionLines.join('\n')) : undefined
  };
}

/**
 * Check assertions against JSON output files
 * Supports dotted paths like "content.tables._yamlLine"
 */
function checkAssertions(baseName: string, assertions: Record<string, any>): string[] {
  const failures: string[] = [];

  for (const [filetype, checks] of Object.entries(assertions)) {
    const filepath = join(DUMP_DIR, `${baseName}.${filetype}.json`);

    if (!existsSync(filepath)) {
      failures.push(`Missing output file: ${baseName}.${filetype}.json`);
      continue;
    }

    const data = JSON.parse(readFileSync(filepath, 'utf-8'));

    for (const [path, expectedValue] of Object.entries(checks)) {
      const actualValue = getValueByPath(data, path);

      if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
        failures.push(
          `${filetype}.${path}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`
        );
      }
    }
  }

  return failures;
}

/**
 * Get value from nested object by dotted path
 */
function getValueByPath(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

const SCHEMAS_DIR = join(import.meta.dir, 'schemas');
const DUMP_DIR = join(import.meta.dir, 'dumps');

// Clear and recreate dump directory before each test run
if (existsSync(DUMP_DIR)) {
  rmSync(DUMP_DIR, { recursive: true, force: true });
}
mkdirSync(DUMP_DIR, { recursive: true });

// Discover all test files (.yaml and .md)
const allTestFiles = readdirSync(SCHEMAS_DIR)
  .filter(f => f.endsWith('.yaml') || f.endsWith('.md'))
  .sort();

// Group schemas by category
const errorSchemas = new Map<string, string[]>();
const successSchemas: string[] = [];

for (const file of allTestFiles) {
  const errorMatch = file.match(/^(\d+)-error-/);
  if (errorMatch) {
    const phase = errorMatch[1];
    if (!errorSchemas.has(phase)) {
      errorSchemas.set(phase, []);
    }
    errorSchemas.get(phase)!.push(file);
  } else {
    successSchemas.push(file);
  }
}

/**
 * Test a schema that should fail
 */
async function testErrorSchema(file: string) {
  const isMarkdown = file.endsWith('.md');
  const baseName = file.replace(/\.(yaml|md)$/, '');

  let schemaPath: string;
  let expectedError: string;
  let tempFile: string | null = null;

  if (isMarkdown) {
    // Parse markdown file
    const mdPath = join(SCHEMAS_DIR, file);
    const mdContent = readFileSync(mdPath, 'utf-8');
    const parsed = parseMarkdownTest(mdContent);

    if (!parsed.expectedError) {
      throw new Error(`Markdown test ${file} missing Expected Error section`);
    }

    // Write YAML to temp file in /tmp for processing (not dumps)
    schemaPath = join('/tmp', `${baseName}.yaml`);
    tempFile = schemaPath;
    writeFileSync(schemaPath, parsed.yaml);
    expectedError = parsed.expectedError;
  } else {
    // Traditional .yaml + .expected-error.txt format
    schemaPath = join(SCHEMAS_DIR, file);
    const expectedErrorPath = join(SCHEMAS_DIR, `${baseName}.expected-error.txt`);

    if (!existsSync(expectedErrorPath)) {
      throw new Error(`Missing expected error file: ${baseName}.expected-error.txt`);
    }

    expectedError = readFileSync(expectedErrorPath, 'utf-8').trim();
  }

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

    // Clean up temp file if it was created
    if (tempFile && existsSync(tempFile)) {
      rmSync(tempFile);
    }
  }
}

// Create test suites for each error group (by prefix number)
for (const [group, files] of errorSchemas.entries()) {
  describe(`Error Group ${group}`, () => {
    for (const file of files) {
      test(`${file} should FAIL`, async () => {
        await testErrorSchema(file);
      });
    }
  });
}

// Create test suite for success schemas
// Success schemas run once without stopAfter (full pipeline)
describe('Success Schemas', () => {
  for (const file of successSchemas) {
    test(`${file} should PASS`, async () => {
      const isMarkdown = file.endsWith('.md');
      const baseName = file.replace(/\.(yaml|md)$/, '');

      let schemaPath: string;
      let assertions: Record<string, any> | undefined;
      let tempFile: string | null = null;

      if (isMarkdown) {
        // Parse markdown file
        const mdPath = join(SCHEMAS_DIR, file);
        const mdContent = readFileSync(mdPath, 'utf-8');
        const parsed = parseMarkdownTest(mdContent);

        // Write YAML to temp file in /tmp for processing
        // But use the original basename in the temp filename so dumps match
        schemaPath = join('/tmp', `${baseName}.yaml`);
        tempFile = schemaPath;
        writeFileSync(schemaPath, parsed.yaml);
        assertions = parsed.assertions;
      } else {
        schemaPath = join(SCHEMAS_DIR, file);
      }

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

        // Should not throw
        await expect(processor.process(schemaPath)).resolves.toBeUndefined();

        // Check assertions if present
        if (assertions) {
          const failures = checkAssertions(baseName, assertions);
          if (failures.length > 0) {
            throw new Error(`Assertions failed:\n${failures.join('\n')}`);
          }
        }
      } finally {
        console.log = originalLog;
        console.error = originalError;

        // Clean up temp file if it was created
        if (tempFile && existsSync(tempFile)) {
          rmSync(tempFile);
        }
      }
    });
  }
});
