import { SchemaValidator } from './dist/validation.js';

const validator = new SchemaValidator();

// Test 1: invalidAutomationTable
console.log('\n=== Test 1: invalidAutomationTable ===');
const schema1 = {
  tables: {
    accounts: {
      columns: {
        account_id: { type: 'integer', primary_key: true },
        balance: {
          automation: {
            type: 'SUM',
            table: 'nonexistent_table',
            foreign_key: 'account_fk',
            column: 'amount'
          }
        }
      }
    }
  }
};
const result1 = validator.validate(schema1);
console.log('Valid:', result1.isValid);
console.log('Errors:', result1.errors);
console.log('Has "does not exist":', result1.errors.some(e => e.includes('does not exist')));

// Test 2: Multi-level references
console.log('\n=== Test 2: Multi-level references ===');
const schema2 = {
  columns: {
    base_id: { type: 'integer', primary_key: true },
    base_name: { type: 'varchar', size: 100 }
  },
  tables: {
    level1: {
      columns: {
        id: 'base_id',
        name: 'base_name'
      }
    },
    level2: {
      foreign_keys: {
        level1_fk: { table: 'level1' }
      },
      columns: {
        id: 'base_id',
        level1_name: {
          automation: {
            type: 'LATEST',
            table: 'level1',
            foreign_key: 'level1_fk',
            column: 'name'
          }
        }
      }
    }
  }
};
const result2 = validator.validate(schema2);
console.log('Valid:', result2.isValid);
console.log('Errors:', result2.errors);
