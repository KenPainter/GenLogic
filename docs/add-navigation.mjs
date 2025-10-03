#!/usr/bin/env node

/**
 * Add prev/next navigation links to documentation files
 *
 * Reads docs/toc.md to get the ordered list of files,
 * finds their actual locations on disk (in case they've been moved),
 * updates toc.md with corrected paths,
 * then adds navigation links at the top and bottom of each file.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find actual location of a file by searching docs directory
function findFile(filename, docsDir) {
  const basename = path.basename(filename);

  function searchDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && entry.name !== 'node_modules') {
        const found = searchDir(fullPath);
        if (found) return found;
      } else if (entry.isFile() && entry.name === basename) {
        // Return path relative to docs directory
        return path.relative(docsDir, fullPath);
      }
    }

    return null;
  }

  return searchDir(docsDir);
}

// Read toc.md and extract ordered list of files
function extractFileList(tocPath, docsDir) {
  const content = fs.readFileSync(tocPath, 'utf-8');
  const files = [];

  // Match markdown links: [Title](path)
  const linkRegex = /\[([^\]]+)\]\(([^\)]+\.md)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const title = match[1];
    const pathInToc = match[2];

    // Skip external links and anchor links
    if (pathInToc.startsWith('http') || pathInToc.startsWith('#')) {
      continue;
    }

    // Try to find actual location
    const actualPath = findFile(pathInToc, docsDir);

    if (actualPath) {
      files.push({
        title,
        pathInToc,  // Path as written in toc.md
        actualPath  // Path where file actually exists
      });
    } else {
      console.warn(`Warning: File not found: ${pathInToc}`);
    }
  }

  return files;
}

// Update toc.md with corrected paths
function updateTocPaths(tocPath, files) {
  let content = fs.readFileSync(tocPath, 'utf-8');
  let updated = false;

  for (const file of files) {
    if (file.pathInToc !== file.actualPath) {
      // Escape special regex characters in path
      const escapedOldPath = file.pathInToc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\[${file.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\(${escapedOldPath}\\)`, 'g');

      if (content.match(regex)) {
        content = content.replace(regex, `[${file.title}](${file.actualPath})`);
        console.log(`Updated toc.md: ${file.pathInToc} -> ${file.actualPath}`);
        updated = true;
      }
    }
  }

  if (updated) {
    fs.writeFileSync(tocPath, content);
    console.log('toc.md updated with corrected paths');
  } else {
    console.log('toc.md: all paths are correct');
  }
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

// Calculate relative path from one file to another
function calculateRelativePath(fromPath, toPath) {
  const fromDir = path.dirname(fromPath);
  const relativePath = path.relative(fromDir, toPath);

  // Ensure forward slashes for markdown links
  return relativePath.replace(/\\/g, '/');
}

// Add navigation to content
function addNavigation(content, currentPath, prev, next) {
  let result = content;

  // Build navigation line
  const navParts = [];
  if (prev) {
    const relativePath = calculateRelativePath(currentPath, prev.actualPath);
    navParts.push(`Previous: [${prev.title}](${relativePath})`);
  }
  if (next) {
    const relativePath = calculateRelativePath(currentPath, next.actualPath);
    navParts.push(`Next: [${next.title}](${relativePath})`);
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
  const docsDir = __dirname;
  const tocPath = path.join(docsDir, 'toc.md');

  console.log('Step 1: Extracting file list from toc.md...');
  const files = extractFileList(tocPath, docsDir);
  console.log(`Found ${files.length} files in toc.md`);

  console.log('\nStep 2: Updating toc.md with corrected paths...');
  updateTocPaths(tocPath, files);

  console.log('\nStep 3: Adding navigation to files...');
  files.forEach((file, index) => {
    const filePath = path.join(docsDir, file.actualPath);

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
    content = addNavigation(content, file.actualPath, prev, next);

    // Write file
    fs.writeFileSync(filePath, content + '\n');

    console.log(`Updated: ${file.actualPath}`);
  });

  console.log('\nDone!');
}

main();
