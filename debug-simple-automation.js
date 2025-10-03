import { SchemaValidator } from './dist/validation.js';

const validator = new SchemaValidator();

const schema = {
  columns: {
    balance: {
      type: 'numeric',
      size: 15,
      decimal: 2
    },
    amount: {
      type: 'numeric',
      size: 10,
      decimal: 2
    }
  },
  tables: {
    accounts: {
      columns: {
        account_id: {
          type: 'integer',
          sequence: true,
          primary_key: true
        },
        balance: {
          $ref: 'balance',
          automation: {
            type: 'SUM',
            table: 'ledger',
            foreign_key: 'account_fk',
            column: 'amount'
          }
        }
      }
    },
    ledger: {
      foreign_keys: {
        account_fk: {
          table: 'accounts'
        }
      },
      columns: {
        ledger_id: {
          type: 'integer',
          sequence: true,
          primary_key: true
        },
        amount: null
      }
    }
  }
};

const result = validator.validateSyntax(schema);
console.log('Valid:', result.isValid);
console.log('Errors:', result.errors);
