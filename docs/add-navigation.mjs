#!/usr/bin/env node

/**
 * Add prev/next navigation links to documentation files
 *
 * Reads docs/toc.md to get the ordered list of example files,
 * then adds navigation links at the top and bottom of each file.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read toc.md and extract ordered list of files
function extractFileList(tocPath) {
  const content = fs.readFileSync(tocPath, 'utf-8');
  const files = [];

  // Match markdown links: [Title](path)
  const linkRegex = /\[([^\]]+)\]\(([^\)]+\.md)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const title = match[1];
    const filePath = match[2];

    // Only include files in examples/ directory
    if (filePath.startsWith('examples/')) {
      files.push({ title, path: filePath });
    }
  }

  return files;
}

// Remove existing navigation from content
function removeExistingNavigation(content) {
  // Remove navigation at top (before first # heading)
  content = content.replace(/^(Previous:.*?\n\n|Next:.*?\n\n)+(#)/m, '$2');

  // Remove navigation at bottom (after last content, before or after ---)
  content = content.replace(/\n---\n\n(Previous|Next):.*$/s, '');
  content = content.replace(/\n\n(Previous|Next):.*$/s, '');

  return content.trim();
}

// Add navigation to content
function addNavigation(content, prev, next) {
  let result = content;

  // Build navigation line
  const navParts = [];
  if (prev) {
    navParts.push(`Previous: [${prev.title}](${prev.path.replace('examples/', '../')})`);
  }
  if (next) {
    navParts.push(`Next: [${next.title}](${next.path.replace('examples/', '../')})`);
  }
  const navLine = navParts.join(' | ');

  // Add at top
  if (navLine) {
    result = navLine + '\n\n' + result;
  }

  // Add at bottom
  if (navLine) {
    result = result + '\n\n---\n\n' + navLine;
  }

  return result;
}

// Main execution
function main() {
  const tocPath = path.join(__dirname, 'toc.md');
  const files = extractFileList(tocPath);

  console.log(`Found ${files.length} files in toc.md`);

  files.forEach((file, index) => {
    const filePath = path.join(__dirname, file.path);

    if (!fs.existsSync(filePath)) {
      console.warn(`Warning: File not found: ${filePath}`);
      return;
    }

    // Read file
    let content = fs.readFileSync(filePath, 'utf-8');

    // Remove existing navigation
    content = removeExistingNavigation(content);

    // Add new navigation
    const prev = index > 0 ? files[index - 1] : null;
    const next = index < files.length - 1 ? files[index + 1] : null;
    content = addNavigation(content, prev, next);

    // Write file
    fs.writeFileSync(filePath, content + '\n');

    console.log(`Updated: ${file.path}`);
  });

  console.log('Done!');
}

main();
