import { GenLogicProcessor } from './dist/processor.js';
import yaml from 'yaml';
import { readFileSync } from 'fs';

const schemaYaml = readFileSync('./EXAMPLE.yaml', 'utf-8');
const schema = yaml.parse(schemaYaml);

const processor = new GenLogicProcessor({
  host: 'localhost',
  port: 5432,
  database: 'test',
  user: 'test',
  password: 'test',
  dryRun: true,
  testMode: false
});

// Access internals for testing
const schemaProcessor = processor.schemaProcessor;
const processedSchema = schemaProcessor.processSchema(schema);

const diffEngine = processor.diffEngine;
const diff = diffEngine.generateDiff(processedSchema, {});

const sqlGen = processor.sqlGenerator;
const sqlStatements = sqlGen.generateSQL(diff);

console.log('\n=== CREATE TABLE STATEMENTS ===\n');
for (const stmt of sqlStatements.createTables) {
  console.log(stmt);
  console.log('\n');
}