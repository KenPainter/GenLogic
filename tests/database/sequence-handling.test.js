import { SQLGenerator } from './dist/sql-generator.js';
import { SchemaProcessor } from './dist/schema-processor.js';
import { DiffEngine } from './dist/diff-engine.js';
import yaml from 'yaml';
import { readFileSync } from 'fs';

const schemaYaml = readFileSync('./EXAMPLE.yaml', 'utf-8');
const schema = yaml.parse(schemaYaml);

const processor = new SchemaProcessor();
const processedSchema = processor.processSchema(schema);

const diffEngine = new DiffEngine();
// Mock current schema as empty
const currentSchema = { tables: {} };
const diff = diffEngine.diff(processedSchema, currentSchema);

const sqlGen = new SQLGenerator();
const sqlStatements = sqlGen.generateSQL(diff);

console.log('\n=== CREATE TABLE STATEMENTS ===\n');
for (const stmt of sqlStatements.createTables) {
  console.log(stmt);
  console.log('\n');
}