import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { SchemaProcessor } from './dist/schema-processor.js';
import { ContentManager } from './dist/content-manager.js';

const schemaText = readFileSync('./schema/schema.yaml', 'utf8');
const schema = parse(schemaText);

const processor = new SchemaProcessor();
const contentManager = new ContentManager();

const processedSchema = processor.processSchema(schema);

console.log('='.repeat(80));
console.log('CONTENT INSERT STATEMENTS');
console.log('='.repeat(80));
console.log('');

const statements = contentManager.generateContentInserts(schema, processedSchema);

statements.forEach((stmt, i) => {
  console.log(`-- Statement ${i + 1}:`);
  console.log(stmt);
  console.log('');
});

// Also show what columns exist in begin_balance
console.log('='.repeat(80));
console.log('BEGIN_BALANCE COLUMNS:');
console.log('='.repeat(80));
const bb = processedSchema.tables.begin_balance;
console.log('Explicit columns:', Object.keys(bb.columns));
console.log('Generated columns:', Object.keys(bb.generatedColumns));
