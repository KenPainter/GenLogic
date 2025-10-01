import { TriggerGenerator } from './dist/trigger-generator.js';
import { SchemaProcessor } from './dist/schema-processor.js';
import yaml from 'yaml';
import { readFileSync } from 'fs';

const schemaYaml = readFileSync('./EXAMPLE.yaml', 'utf-8');
const schema = yaml.parse(schemaYaml);

const processor = new SchemaProcessor();
const processedSchema = processor.processSchema(schema);

const triggerGen = new TriggerGenerator();
const triggers = triggerGen.generateTriggers(schema, processedSchema);

console.log('\n=== GENERATED TRIGGERS ===\n');
for (const trigger of triggers) {
  console.log(trigger);
  console.log('\n' + '='.repeat(80) + '\n');
}