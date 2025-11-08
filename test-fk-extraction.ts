#!/usr/bin/env node

/**
 * Test the FK extraction and parsing
 */

import { loadYamlSchemaWithTracking } from './src/helpers-processor/yaml-loader.js';
import { extractConstants, extractTables, extractForeignKeys, createExtractedSchema } from './src/helpers-processor/schema-extractor.js';

// Create a test YAML schema
const testYaml = `
tables:
  Account:
    columns:
      id: integer
      name: string

  Transaction:
    columns:
      id: integer
      account_id: FK Account
      amount: numeric(10,2)

  Payment:
    columns:
      id: integer
      transaction_id: FK Transaction not null delete cascade
      date: date

  Audit:
    columns:
      id: integer
      account_ref: FK Account.account_id
      created_at: timestamp
`;

async function main() {
  try {
    // Write test YAML to temp file
    const fs = await import('fs');
    const path = await import('path');
    const testFile = path.join('/tmp', 'test-fk.yaml');
    fs.writeFileSync(testFile, testYaml);

    // Load and parse
    console.log('Loading YAML...');
    const expanded = loadYamlSchemaWithTracking(testFile);

    console.log('\n=== EXTRACTING CONSTANTS ===');
    const extracted = createExtractedSchema(testFile);
    extracted.constants = extractConstants(expanded);
    console.log(`Constants: ${extracted.constants.size}`);

    console.log('\n=== EXTRACTING TABLES ===');
    extracted.tables = extractTables(expanded);
    for (const [tableName, table] of extracted.tables) {
      console.log(`\nTable: ${tableName}`);
      for (const [colName, col] of table.columns) {
        const inferMsg = col._inferDefinitionFrom ? ` → infer from ${col._inferDefinitionFrom}` : '';
        console.log(`  ${colName}: "${col.definition}"${inferMsg}`);
      }
    }

    console.log('\n=== EXTRACTING FOREIGN KEYS ===');
    extracted.foreignKeys = extractForeignKeys(expanded, extracted.tables);
    for (const fk of extracted.foreignKeys) {
      const parentCol = fk.parentColumn || '(inferred)';
      const notNull = fk.notNull ? ' [NOT NULL]' : '';
      const autoCreate = fk.autoCreateParent ? ' [AUTO CREATE]' : '';
      console.log(`${fk.childTable}.${fk.childColumn} → ${fk.parentTable}.${parentCol} [${fk.deleteAction}]${notNull}${autoCreate}`);
    }

    console.log('\n✅ Test completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();
