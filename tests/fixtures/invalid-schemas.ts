/**
 * Invalid YAML Schema Test Fixtures
 *
 * GENLOGIC TESTING: These schemas should all fail validation
 * Each fixture includes the expected error message for verification
 */

export const invalidSchemas = {
  // 8.1.1 Schema Syntax Validation
  invalidTopLevelKey: {
    schema: {
      columns: { id: { type: 'integer' } },
      tables: { users: { columns: { id: null } } },
      invalid_key: 'should not be allowed'
    },
    expectedError: 'additionalProperties'
  },

  invalidColumnName: {
    schema: {
      columns: {
        '123invalid': { type: 'integer' }  // Starts with number
      }
    },
    expectedError: 'does not match pattern'
  },

  invalidTableName: {
    schema: {
      tables: {
        'my-table': {  // Contains hyphen
          columns: { id: { type: 'integer' } }
        }
      }
    },
    expectedError: 'does not match pattern'
  },

  // 8.1.2 Type System Validation
  missingTypeField: {
    schema: {
      columns: {
        name: {
          size: 50  // Missing required 'type' field
        }
      }
    },
    expectedError: 'type'
  },

  varcharWithoutSize: {
    schema: {
      columns: {
        name: {
          type: 'varchar'  // varchar requires size
        }
      }
    },
    expectedError: 'size is required'
  },

  dateWithSize: {
    schema: {
      columns: {
        created: {
          type: 'date',
          size: 10  // date cannot have size
        }
      }
    },
    expectedError: 'not'
  },

  decimalWithoutSize: {
    schema: {
      columns: {
        amount: {
          type: 'numeric',
          decimal: 2  // decimal requires size
        }
      }
    },
    expectedError: 'decimal'
  },

  // 8.1.3 Cross-Reference Validation
  invalidRefColumn: {
    schema: {
      tables: {
        users: {
          columns: {
            name: {
              $ref: 'nonexistent_column'  // References missing column
            }
          }
        }
      }
    },
    expectedError: 'does not exist in reusable columns'
  },

  invalidStringReference: {
    schema: {
      tables: {
        users: {
          columns: {
            name: 'missing_column'  // String reference to missing column
          }
        }
      }
    },
    expectedError: 'does not exist in reusable columns'
  },

  invalidAutomationTable: {
    schema: {
      columns: {
        balance: { type: 'numeric', size: 10, decimal: 2 }
      },
      tables: {
        accounts: {
          columns: {
            balance: {
              $ref: 'balance',
              automation: {
                type: 'SUM',
                table: 'nonexistent_table',  // References missing table
                foreign_key: 'account_fk',
                column: 'amount'
              }
            }
          }
        }
      }
    },
    expectedError: 'does not exist'
  },

  invalidAutomationForeignKey: {
    schema: {
      columns: {
        balance: { type: 'numeric', size: 10, decimal: 2 }
      },
      tables: {
        accounts: {
          columns: {
            balance: {
              $ref: 'balance',
              automation: {
                type: 'SUM',
                table: 'ledger',
                foreign_key: 'nonexistent_fk',  // References missing FK
                column: 'amount'
              }
            }
          }
        },
        ledger: {
          foreign_keys: {
            account_fk: { table: 'accounts' }  // Different FK name
          },
          columns: {
            amount: { type: 'numeric', size: 10, decimal: 2 }
          }
        }
      }
    },
    expectedError: 'does not exist in table'
  },

  invalidForeignKeyTable: {
    schema: {
      tables: {
        ledger: {
          foreign_keys: {
            account_fk: {
              table: 'nonexistent_table'  // References missing table
            }
          },
          columns: {
            amount: { type: 'numeric', size: 10, decimal: 2 }
          }
        }
      }
    },
    expectedError: 'does not exist'
  },

  // 8.1.4 Data Flow Graph Validation - Cycles
  foreignKeyCycle: {
    schema: {
      tables: {
        table_a: {
          foreign_keys: {
            b_fk: { table: 'table_b' }
          },
          columns: { id: { type: 'integer', primary_key: true } }
        },
        table_b: {
          foreign_keys: {
            c_fk: { table: 'table_c' }
          },
          columns: { id: { type: 'integer', primary_key: true } }
        },
        table_c: {
          foreign_keys: {
            a_fk: { table: 'table_a' }  // Creates cycle A→B→C→A
          },
          columns: { id: { type: 'integer', primary_key: true } }
        }
      }
    },
    expectedError: 'Cycle detected'
  },

  // 8.1.5 Column Inheritance Edge Cases
  emptyReferenceToMissing: {
    schema: {
      tables: {
        users: {
          columns: {
            missing_column: null  // References missing reusable column
          }
        }
      }
    },
    expectedError: 'references missing reusable column'
  }
};

export const partiallyValidSchemas = {
  // Schemas that pass JSON Schema but fail cross-reference validation
  missingReusableColumn: {
    columns: {
      name: { type: 'varchar', size: 50 }
    },
    tables: {
      users: {
        columns: {
          email: 'missing_email_column'  // Valid syntax, missing reference
        }
      }
    }
  }
};