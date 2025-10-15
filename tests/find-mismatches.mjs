#!/usr/bin/env node

/**
 * find-mismatches.mjs
 *
 * Validates that TEST-COVERAGE.md stays in sync with actual test directories.
 *
 * Reports:
 * 1. Broken links - Links in TEST-COVERAGE.md pointing to non-existent directories
 * 2. Orphaned tests - Test directories not documented in TEST-COVERAGE.md
 *
 * A test directory is recognized by the presence of expect-exit-0.txt or expect-exit-1.txt
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COVERAGE_DOC = join(__dirname, 'TEST-COVERAGE.md');
const TESTS_DIR = __dirname;

/**
 * Extract all test directory links from TEST-COVERAGE.md
 * Matches patterns like: [text](./path/to/test)
 * Returns normalized paths relative to tests directory
 * Excludes links in code blocks and inline code
 */
function extractLinksFromCoverage() {
  const content = readFileSync(COVERAGE_DOC, 'utf-8');
  const lines = content.split('\n');
  const links = new Set();

  let inCodeBlock = false;
  const linkPattern = /\[([^\]]+)\]\(\.\/([^)]+)\)/g;

  for (const line of lines) {
    // Track code fences (```)
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    // Skip lines in code blocks
    if (inCodeBlock) {
      continue;
    }

    // Skip lines with inline code containing links (backticks before [)
    // This catches lines like: `- [x] [Feature name](./path/to/test) - Brief description`
    if (line.includes('`') && line.indexOf('`') < line.indexOf('[')) {
      continue;
    }

    // Extract links from this line
    let match;
    linkPattern.lastIndex = 0; // Reset regex state
    while ((match = linkPattern.exec(line)) !== null) {
      const linkPath = match[2];
      // Normalize path and remove any trailing slashes
      const normalized = linkPath.replace(/\/$/, '');
      links.add(normalized);
    }
  }

  return links;
}

/**
 * Recursively find all test directories in ./tests
 * A directory is a test if it contains expect-exit-0.txt or expect-exit-1.txt
 * Returns paths relative to tests directory
 */
function findTestDirectories(dir = TESTS_DIR, baseDir = TESTS_DIR) {
  const tests = new Set();

  try {
    const entries = readdirSync(dir);

    // Check if this directory is a test directory
    const hasExpectExit0 = entries.includes('expect-exit-0.txt');
    const hasExpectExit1 = entries.includes('expect-exit-1.txt');

    if (hasExpectExit0 || hasExpectExit1) {
      // This is a test directory
      const relativePath = dir.substring(baseDir.length + 1);
      if (relativePath) { // Don't add the root tests directory itself
        tests.add(relativePath);
      }
    }

    // Recursively search subdirectories
    for (const entry of entries) {
      const fullPath = join(dir, entry);

      try {
        const stat = statSync(fullPath);

        if (stat.isDirectory() && !entry.startsWith('.')) {
          const subTests = findTestDirectories(fullPath, baseDir);
          for (const test of subTests) {
            tests.add(test);
          }
        }
      } catch (err) {
        // Skip entries we can't stat (permissions, etc.)
        continue;
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err.message);
  }

  return tests;
}

/**
 * Main validation function
 */
function findMismatches() {
  console.log('🔍 Scanning TEST-COVERAGE.md and test directories...\n');

  const linkedTests = extractLinksFromCoverage();
  const actualTests = findTestDirectories();

  console.log(`📄 Found ${linkedTests.size} test links in TEST-COVERAGE.md`);
  console.log(`📁 Found ${actualTests.size} test directories in filesystem\n`);

  // Find broken links (in doc but not on filesystem)
  const brokenLinks = [];
  for (const link of linkedTests) {
    const fullPath = join(TESTS_DIR, link);
    if (!existsSync(fullPath)) {
      brokenLinks.push(link);
    }
  }

  // Find orphaned tests (on filesystem but not in doc)
  const orphanedTests = [];
  for (const test of actualTests) {
    if (!linkedTests.has(test)) {
      orphanedTests.push(test);
    }
  }

  // Report results
  let exitCode = 0;

  if (brokenLinks.length > 0) {
    console.log('❌ BROKEN LINKS (in TEST-COVERAGE.md but directory does not exist):');
    console.log('─'.repeat(80));
    for (const link of brokenLinks.sort()) {
      console.log(`  ./${link}`);
    }
    console.log();
    exitCode = 1;
  }

  if (orphanedTests.length > 0) {
    console.log('⚠️  ORPHANED TESTS (directory exists but not linked in TEST-COVERAGE.md):');
    console.log('─'.repeat(80));
    for (const test of orphanedTests.sort()) {
      console.log(`  ./${test}`);
    }
    console.log();
    exitCode = 1;
  }

  if (brokenLinks.length === 0 && orphanedTests.length === 0) {
    console.log('✅ All tests are properly documented!');
    console.log('   No broken links or orphaned tests found.\n');
  } else {
    console.log('Summary:');
    console.log(`  ${brokenLinks.length} broken link(s)`);
    console.log(`  ${orphanedTests.length} orphaned test(s)\n`);
  }

  process.exit(exitCode);
}

// Run the validation
findMismatches();
