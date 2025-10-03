import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { SchemaProcessor } from './dist/schema-processor.js';
import { TriggerGenerator } from './dist/trigger-generator.js';

const schemaText = readFileSync('./test_spread.yaml', 'utf8');
const schema = parse(schemaText);

const processor = new SchemaProcessor();
const triggerGen = new TriggerGenerator();

const processedSchema = processor.processSchema(schema);
const triggers = triggerGen.generateTriggers(schema, processedSchema);

console.log('='.repeat(80));
console.log('SPREAD FEATURE - Generate Multiple Rows from Date Range');
console.log('='.repeat(80));
console.log('');

console.log(`Total triggers generated: ${triggers.length}`);
console.log('');

// Show all triggers
triggers.forEach((trigger, i) => {
  console.log(`-- Trigger ${i + 1}:`);
  console.log(trigger);
  console.log('');
});
