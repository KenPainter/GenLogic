import { readFileSync, writeFileSync } from 'fs';
import { parse, stringify } from 'yaml';
import { SchemaProcessor } from './dist/schema-processor.js';
import { ResolvedSchemaGenerator } from './dist/resolved-schema-generator.js';

const schemaText = readFileSync('./test_column_ui_notes.yaml', 'utf8');
const schema = parse(schemaText);

const processor = new SchemaProcessor();
const resolvedGen = new ResolvedSchemaGenerator();

const processedSchema = processor.processSchema(schema);
const resolved = resolvedGen.generateResolvedSchema(
  schema,
  processedSchema,
  'test_column_ui_notes.yaml',
  'test_db'
);

console.log('='.repeat(80));
console.log('COLUMN-LEVEL UI-NOTES TEST');
console.log('='.repeat(80));
console.log('');

// Write resolved schema to file
const resolvedYaml = stringify(resolved);
writeFileSync('./test_column_ui_notes.yaml.resolved.yaml', resolvedYaml, 'utf8');

console.log('Resolved schema written to test_column_ui_notes.yaml.resolved.yaml');
console.log('');
console.log('Column ui-notes in resolved schema:');
console.log('');

// Show ui-notes for each column
const userTable = resolved.tables.user;
for (const [columnName, columnDef] of Object.entries(userTable.columns)) {
  if (columnDef.ui_notes) {
    console.log(`${columnName}:`);
    console.log(JSON.stringify(columnDef.ui_notes, null, 2));
    console.log('');
  }
}
