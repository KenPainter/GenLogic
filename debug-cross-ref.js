import { SchemaValidator } from './dist/validation.js';
import { validSchemas } from './tests/fixtures/valid-schemas.js';

const validator = new SchemaValidator();

// Test 1: multipleAggregations
console.log('\n=== Test: multipleAggregations ===');
const result1 = validator.validate(validSchemas.multipleAggregations);
console.log('Valid:', result1.isValid);
console.log('Errors:', result1.errors);

// Test 2: simpleAccountLedger
console.log('\n=== Test: simpleAccountLedger ===');
const result2 = validator.validate(validSchemas.simpleAccountLedger);
console.log('Valid:', result2.isValid);
console.log('Errors:', result2.errors);
