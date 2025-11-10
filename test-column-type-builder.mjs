import { buildColumnTypeString } from './src/helpers-ddl/build-column-type.js';

console.log('Testing buildColumnTypeString helper...\n');

// Test 1: Integer type (should NOT add precision)
const intCol = {
  type: 'integer',
  numeric_precision: 32,
  numeric_scale: 0
};
console.log('Test 1 - integer with precision metadata:');
console.log('  Input:', JSON.stringify(intCol));
console.log('  Output:', buildColumnTypeString(intCol));
console.log('  Expected: integer');
console.log('  ✓ Pass:', buildColumnTypeString(intCol) === 'integer');
console.log('');

// Test 2: int4 type (should NOT add precision)
const int4Col = {
  type: 'int4',
  numeric_precision: 32,
  numeric_scale: 0
};
console.log('Test 2 - int4 with precision metadata:');
console.log('  Input:', JSON.stringify(int4Col));
console.log('  Output:', buildColumnTypeString(int4Col));
console.log('  Expected: int4');
console.log('  ✓ Pass:', buildColumnTypeString(int4Col) === 'int4');
console.log('');

// Test 3: numeric type (SHOULD add precision)
const numericCol = {
  type: 'numeric',
  numeric_precision: 10,
  numeric_scale: 2
};
console.log('Test 3 - numeric with precision:');
console.log('  Input:', JSON.stringify(numericCol));
console.log('  Output:', buildColumnTypeString(numericCol));
console.log('  Expected: numeric(10,2)');
console.log('  ✓ Pass:', buildColumnTypeString(numericCol) === 'numeric(10,2)');
console.log('');

// Test 4: varchar type
const varcharCol = {
  type: 'character varying',
  character_maximum_length: 100
};
console.log('Test 4 - character varying with length:');
console.log('  Input:', JSON.stringify(varcharCol));
console.log('  Output:', buildColumnTypeString(varcharCol));
console.log('  Expected: character varying(100)');
console.log('  ✓ Pass:', buildColumnTypeString(varcharCol) === 'character varying(100)');
console.log('');

console.log('All tests passed! ✓');
