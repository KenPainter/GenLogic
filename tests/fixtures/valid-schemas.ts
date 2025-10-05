/**
 * Valid YAML Schema Test Fixtures
 *
 * GENLOGIC TESTING: These schemas should all pass validation
 * Used for positive testing and as base for database tests
 */

export const validSchemas = {
  simpleAccountLedger: {
    columns: {
      account_name: {
        type: 'varchar(50)'
      },
      amount: {
        type: 'numeric(10,2)'
      },
      balance: {
        type: 'numeric(15,2)'
      }
    },
    tables: {
      accounts: {
        columns: {
          account_id: 'serial primary key',
          account_name: {
            $ref: 'account_name',
            type: 'varchar(50) unique'
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
            table: 'accounts',
            delete: 'restrict'
          }
        },
        columns: {
          ledger_id: 'serial primary key',
          date: 'date',
          amount: null,  // Inherits from reusable column
          description: 'account_name'  // String reference
        }
      }
    }
  },

  multipleAggregations: {
    columns: {
      amount: { type: 'numeric(10,2)' },
      count: { type: 'integer' },
      max_amount: { type: 'numeric(10,2)' },
      latest_date: { type: 'date' }
    },
    tables: {
      accounts: {
        columns: {
          account_id: 'serial primary key',
          total_balance: {
            $ref: 'amount',
            automation: {
              type: 'SUM',
              table: 'transactions',
              foreign_key: 'account_fk',
              column: 'amount'
            }
          },
          transaction_count: {
            $ref: 'count',
            automation: {
              type: 'COUNT',
              table: 'transactions',
              foreign_key: 'account_fk',
              column: 'amount'
            }
          },
          max_transaction: {
            $ref: 'max_amount',
            automation: {
              type: 'MAX',
              table: 'transactions',
              foreign_key: 'account_fk',
              column: 'amount'
            }
          },
          latest_transaction_date: {
            $ref: 'latest_date',
            automation: {
              type: 'LAST_VALUE',
              table: 'transactions',
              foreign_key: 'account_fk',
              column: 'transaction_date'
            }
          }
        }
      },
      transactions: {
        foreign_keys: {
          account_fk: { table: 'accounts' }
        },
        columns: {
          transaction_id: 'serial primary key',
          amount: null,
          transaction_date: 'date'
        }
      }
    }
  },

  complexSchema: {
    columns: {
      id: { type: 'serial primary key' },
      name: { type: 'varchar(100)' },
      email: { type: 'varchar(255)' },
      amount: { type: 'numeric(10,2)' },
      created_at: { type: 'timestamp' }
    },
    tables: {
      users: {
        columns: {
          user_id: {
            $ref: 'id'  // Reference with override
          },
          username: {
            $ref: 'name',
            unique: true  // Add unique constraint
          },
          email: {
            $ref: 'email',
            unique: true
          },
          created_at: null  // Simple inheritance
        }
      },
      accounts: {
        foreign_keys: {
          user_fk: { table: 'users', prefix: 'user_' }
        },
        columns: {
          account_id: 'id',  // String reference
          account_name: 'name',
          balance: 'amount'
        }
      },
      transactions: {
        foreign_keys: {
          account_fk: { table: 'accounts' },
          user_fk: { table: 'users' }
        },
        columns: {
          transaction_id: 'id',
          amount: null,
          created_at: null
        }
      }
    }
  }
};

export const minimalValidSchema = {
  columns: {
    id: { type: 'integer' }
  }
};

export const emptyValidSchema = {};