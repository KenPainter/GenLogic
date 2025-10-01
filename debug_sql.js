import { GenLogicProcessor } from './dist/processor.js';
import yaml from 'yaml';
import { readFileSync } from 'fs';

const schemaPath = process.argv[2];
if (!schemaPath) {
  console.error('Usage: node debug_sql.js <schema.yaml>');
  process.exit(1);
}

const schemaYaml = readFileSync(schemaPath, 'utf-8');
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

try {
  await processor.process(schemaPath);
} catch (error) {
  console.error('Error:', error.message);
  if (error.sql) {
    console.error('Failed SQL:', error.sql);
  }
}
