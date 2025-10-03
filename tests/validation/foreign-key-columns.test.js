import { SchemaProcessor } from './dist/schema-processor.js';
import yaml from 'yaml';
import { readFileSync } from 'fs';

const schemaYaml = readFileSync('./EXAMPLE.yaml', 'utf-8');
const schema = yaml.parse(schemaYaml);

const processor = new SchemaProcessor();
const processedSchema = processor.processSchema(schema);

console.log('\n=== PROCESSED SCHEMA ===\n');
console.log('Tables:', Object.keys(processedSchema.tables));

for (const [tableName, table] of Object.entries(processedSchema.tables)) {
  console.log(`\n${tableName}:`);
  console.log('  columns:', Object.keys(table.columns || {}));
  console.log('  generatedColumns:', Object.keys(table.generatedColumns || {}));
  console.log('  foreignKeys:', Object.keys(table.foreignKeys || {}));
}
