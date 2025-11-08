#!/usr/bin/env bun
/**
 * Unified GenLogic Test Runner
 *
 * Convention:
 * - Test files can be either .yaml or .md format
 * - Markdown format contains YAML in code blocks plus expected errors and assertions
 * - Schemas WITH "NN-error" prefix (e.g., "10-error-foo.md"): expect FAILURE at phase NN
 * - Schemas WITHOUT error prefix: expect SUCCESS through all phases
 *
 * Phases:
 * - 10: yaml-validate (YAML loading, constant substitution, JSON schema validation)
 * - 20: flattened (Schema flattening into normalized arrays)
 * - 30: processed (Layer-by-layer processing with validation)
 * - 40: diffed (Diff generation between processed and current schema)
 * - 60: ddl (SQL DDL generation)
 *
 * Each phase has its own test suite. Error tests are grouped by phase number.
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

// Phase configuration: maps phase number to stopAfter value
const PHASES = {
  '10': { stopAfter: 'yaml-validate' },
  '20': { stopAfter: 'flattened' },
  '30': { stopAfter: 'processed' },
  '40': { stopAfter: 'diffed' },
  '60': { stopAfter: 'ddl' },
} as const;

type PhaseNumber = keyof typeof PHASES;

// Discover all test files (.yaml and .md)
const allTestFiles = readdirSync(SCHEMAS_DIR)
  .filter(f => f.endsWith('.yaml') || f.endsWith('.md'))
  .sort();

// Group schemas by category
const errorSchemas = new Map<PhaseNumber, string[]>();
const successSchemas: string[] = [];

for (const file of allTestFiles) {
  const errorMatch = file.match(/^(\d+)-error-/);
  if (errorMatch) {
    const phase = errorMatch[1] as PhaseNumber;
    if (!errorSchemas.has(phase)) {
      errorSchemas.set(phase, []);
    }
    errorSchemas.get(phase)!.push(file);
  } else {
    successSchemas.push(file);
  }
}

/**
 * Test a schema that should fail at a specific phase
 */
async function testErrorSchema(file: string, phase: PhaseNumber) {
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
    schemaPath = join('/tmp', `genlogic-test-${baseName}.yaml`);
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
    const phaseConfig = PHASES[phase];
    const processor = new GenLogicProcessor({
      database: 'dummy_db',
      user: process.env.USER || 'test',
      dryRun: true,
      stopAfter: phaseConfig.stopAfter as any,
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

// Create test suites for each phase's error schemas
for (const [phase, files] of errorSchemas.entries()) {
  describe(`Phase ${phase} - Error Cases`, () => {
    for (const file of files) {
      test(`${file} should FAIL at phase ${phase}`, async () => {
        await testErrorSchema(file, phase);
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

      if (isMarkdown) {
        // Parse markdown file
        const mdPath = join(SCHEMAS_DIR, file);
        const mdContent = readFileSync(mdPath, 'utf-8');
        const parsed = parseMarkdownTest(mdContent);

        // Write YAML to temp file in dumps directory for processing
        schemaPath = join(DUMP_DIR, `${baseName}.yaml`);
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
      }
    });
  }
});
