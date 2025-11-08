#!/usr/bin/env bun

/**
 * Test: Explore how to preserve range information from YAML documents
 */

import { parseDocument } from 'yaml';

const yamlContent = `# Formula column - computed from other columns
tables:
  accounts:
    columns:
      account_id: serial primary key
      debits: numeric(12,2) default 0
      credits: numeric(12,2) default 0
      balance:
        definition: numeric(12,2)
        formula: "@debits - @credits"
`;

const doc = parseDocument(yamlContent);

console.log('=== Document Structure ===\n');
console.log('Type of doc:', typeof doc);
console.log('Doc range:', doc.range);
console.log('\n');

console.log('=== Walking the tree to extract ranges ===\n');

function extractWithRanges(node: any, path: string = ''): any {
  if (!node) return null;

  if (node.items) {
    // YAMLMap - has key-value pairs
    const result: any = {};
    for (const pair of node.items) {
      const key = pair.key?.value;
      const keyRange = pair.key?.range;
      const valueRange = pair.value?.range;

      result[key] = {
        _keyRange: keyRange,
        _valueRange: valueRange,
        ...extractWithRanges(pair.value, `${path}.${key}`)
      };
    }
    return result;
  } else if (node.value !== undefined) {
    // Scalar - just return the value with range
    return {
      _value: node.value,
      _range: node.range
    };
  } else if (typeof node === 'object' && node.toJSON) {
    // Has toJSON but not items - try to get more info
    return {
      _value: node.toJSON(),
      _range: node.range
    };
  } else {
    return node;
  }
}

const contentsWithRanges = extractWithRanges(doc.contents);
console.log(JSON.stringify(contentsWithRanges, null, 2));
