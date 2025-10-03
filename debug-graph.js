import { SchemaValidator } from './dist/validation.js';

const validator = new SchemaValidator();

// Test: Automation dependency chains
console.log('\n=== Test: Automation dependency chains ===');
const schema1 = {
  columns: {
    amount: { type: 'numeric', size: 10, decimal: 2 }
  },
  tables: {
    level1: {
      columns: {
        id: { type: 'integer', primary_key: true },
        total: {
          automation: {
            type: 'SUM',
            table: 'level2',
            foreign_key: 'level1_fk',
            column: 'amount'
          }
        }
      }
    },
    level2: {
      foreign_keys: {
        level1_fk: { table: 'level1' },
        level3_fk: { table: 'level3' }
      },
      columns: {
        id: { type: 'integer', primary_key: true },
        subtotal: {
          automation: {
            type: 'SUM',
            table: 'level3',
            foreign_key: 'level3_fk',
            column: 'amount'
          }
        }
      }
    },
    level3: {
      columns: {
        id: { type: 'integer', primary_key: true },
        amount: null
      }
    }
  }
};
const result1 = validator.validateSyntax(schema1);
console.log('Valid:', result1.isValid);
console.log('Errors:', result1.errors);
