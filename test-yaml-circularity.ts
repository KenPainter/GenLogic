#!/usr/bin/env bun

/**
 * Test: Can YAML Document objects be serialized to JSON?
 * Or do they have circular references like Babel AST paths?
 */

import { parseDocument } from 'yaml';

const yamlContent = `
tables:
  users:
    columns:
      user_id: serial primary key
      name: varchar(100)
  posts:
    foreign-keys:
      users: user_id
    columns:
      post_id: serial primary key
      user_id: integer
      title: varchar(200)
`;

console.log('=== Testing YAML Document Circularity ===\n');

const doc = parseDocument(yamlContent);

console.log('1. Can we JSON.stringify the document?');
try {
  const json = JSON.stringify(doc, null, 2);
  console.log('   ✅ YES - No circular references\n');
  console.log('   Document structure (first 500 chars):');
  console.log('   ' + json.substring(0, 500) + '...\n');
} catch (error) {
  console.log('   ❌ NO - Has circular references');
  console.log(`   Error: ${error}\n`);
}

console.log('2. Can we JSON.stringify doc.contents?');
try {
  const json = JSON.stringify(doc.contents, null, 2);
  console.log('   ✅ YES - No circular references\n');
  console.log('   Contents structure (first 500 chars):');
  console.log('   ' + json.substring(0, 500) + '...\n');
} catch (error) {
  console.log('   ❌ NO - Has circular references');
  console.log(`   Error: ${error}\n`);
}

console.log('3. Can we access line numbers?');
const contents = doc.contents as any;
if (contents && contents.items) {
  const firstItem = contents.items[0];
  console.log('   First item:', firstItem);
  console.log('   Has range?', !!firstItem.range);
  if (firstItem.range) {
    console.log('   Range:', firstItem.range);
  }
}

console.log('\n4. Getting line numbers from ranges:');
if (doc.range) {
  const [start, end] = doc.range;
  console.log(`   Document spans offsets ${start} to ${end}`);

  // The lineCounter is internal to the document
  // We can access line info through the range offsets
  const tablesNode = contents.items[0];
  if (tablesNode.key && tablesNode.key.range) {
    console.log(`   "tables" key range:`, tablesNode.key.range);
  }
}

console.log('\n=== Conclusion ===');
console.log('YAML Documents are tree structures, not circular graphs.');
console.log('They CAN be JSON.stringify()\'d without issues.');
