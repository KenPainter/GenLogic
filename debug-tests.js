import { SchemaValidator } from './dist/validation.js';

const validator = new SchemaValidator();

// Test 1: Constraint additions
console.log('\n=== Test 1: Constraint additions ===');
const schema1 = {
  columns: {
    email: { type: 'varchar', size: 255 }
  },
  tables: {
    users: {
      columns: {
        primary_email: {
          $ref: 'email',
          unique: true,
          not_null: true
        }
      }
    }
  }
};
const result1 = validator.validateSyntax(schema1);
console.log('Valid:', result1.isValid);
console.log('Errors:', result1.errors);

// Test 2: Inheritance chains
console.log('\n=== Test 2: Inheritance chains ===');
const schema2 = {
  columns: {
    base_id: { type: 'integer' },
    enhanced_id: { $ref: 'base_id', sequence: true },
    primary_id: { $ref: 'enhanced_id', primary_key: true }
  },
  tables: {
    users: {
      columns: {
        user_id: 'primary_id'
      }
    }
  }
};
const result2 = validator.validateSyntax(schema2);
console.log('Valid:', result2.isValid);
console.log('Errors:', result2.errors);

// Test 3: Missing column references
console.log('\n=== Test 3: Missing null reference ===');
const schema3 = {
  columns: {
    id: { type: 'integer' }
  },
  tables: {
    users: {
      columns: {
        missing_column: null
      }
    }
  }
};
const result3 = validator.validateSyntax(schema3);
console.log('Valid:', result3.isValid);
console.log('Errors:', result3.errors);

// Test 4: Calculated + Automation
console.log('\n=== Test 4: Calculated + Automation ===');
const schema4 = {
  tables: {
    accounts: {
      columns: {
        account_id: { type: 'integer', primary_key: true, sequence: true }
      }
    },
    transactions: {
      foreign_keys: {
        account_fk: { table: 'accounts' }
      },
      columns: {
        amount: { type: 'numeric', size: 10, decimal: 2 },
        doubled: {
          type: 'numeric',
          size: 10,
          decimal: 2,
          calculated: 'amount * 2',
          automation: {
            type: 'SUM',
            table: 'transactions',
            foreign_key: 'account_fk',
            column: 'amount'
          }
        }
      }
    }
  }
};
const result4 = validator.validate(schema4);
console.log('Valid:', result4.isValid);
console.log('Errors:', result4.errors);

// Test 5: FK cycle
console.log('\n=== Test 5: FK cycle ===');
const schema5 = {
  tables: {
    categories: {
      foreign_keys: {
        parent_fk: { table: 'categories' }
      },
      columns: {
        id: { type: 'integer', primary_key: true },
        name: { type: 'varchar', size: 100 }
      }
    }
  }
};
const result5 = validator.validateSyntax(schema5);
console.log('Valid:', result5.isValid);
console.log('Errors:', result5.errors);
