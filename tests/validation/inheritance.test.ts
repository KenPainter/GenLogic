/**
 * Group 1: YAML Validation Tests - Column Inheritance Edge Cases
 *
 * GENLOGIC TESTING: Verify complex column inheritance scenarios
 * Tests mixed inheritance patterns, overrides, and edge cases
 */

import { SchemaValidator } from '../../src/validation';
import { validSchemas } from '../fixtures/valid-schemas';

describe('Group 1.5: Column Inheritance Edge Cases', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  describe('Mixed inheritance patterns', () => {
    test('should handle null inheritance (same name)', () => {
      const schema = {
        columns: {
          id: 'serial primary key',
          name: 'varchar(50)'
        },
        tables: {
          users: {
            columns: {
              id: null,     // Inherits 'id' column definition
              name: null    // Inherits 'name' column definition
            }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });

    test('should handle string inheritance (named reference)', () => {
      const schema = {
        columns: {
          id: { type: 'serial primary key' },
          name: { type: 'varchar(50)' }
        },
        tables: {
          users: {
            columns: {
              user_id: 'id',      // Inherits 'id' as 'user_id'
              username: 'name'    // Inherits 'name' as 'username'
            }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });

    test('should handle $ref inheritance with overrides', () => {
      const schema = {
        columns: {
          id: 'integer',
          name: 'varchar(50)'
        },
        tables: {
          users: {
            columns: {
              user_id: {
                $ref: 'id',
                type: 'serial primary key'   // Override type to add sequence and primary key
              },
              username: {
                $ref: 'name',
                type: 'varchar(50) unique'   // Override type to add unique constraint
              }
            }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      if (!result.isValid) {
        console.error('Validation errors:', result.errors);
      }
      expect(result.isValid).toBe(true);
    });

    test('should handle all inheritance types in one schema', () => {
      const result = validator.validateSyntax(validSchemas.complexSchema);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Override validation', () => {
    test('should allow type overrides in $ref inheritance', () => {
      const schema = {
        columns: {
          amount: { type: 'numeric(10,2)' }
        },
        tables: {
          transactions: {
            columns: {
              large_amount: {
                $ref: 'amount',
                type: 'numeric(15,4)'  // Override with larger size and decimal
              }
            }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });

    test('should allow constraint additions in $ref inheritance', () => {
      const schema = {
        columns: {
          email: 'varchar(255)'
        },
        tables: {
          users: {
            columns: {
              primary_email: {
                $ref: 'email',
                type: 'varchar(255) unique not null'  // Override type to add constraints
              }
            }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });

    test('should allow automation additions in inheritance', () => {
      const schema = {
        columns: {
          balance: { type: 'numeric(15,2)' }
        },
        tables: {
          accounts: {
            columns: {
              current_balance: {
                $ref: 'balance',
                automation: {
                  type: 'SUM',
                  table: 'transactions',
                  foreign_key: 'account_fk',
                  column: 'amount'
                }
              }
            }
          },
          transactions: {
            foreign_keys: {
              account_fk: { table: 'accounts' }
            },
            columns: {
              amount: 'balance'
            }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Cascading inheritance', () => {
    test('should handle inheritance chains', () => {
      const schema = {
        columns: {
          base_id: { type: 'integer' },
          enhanced_id: { $ref: 'base_id', type: 'serial' },
          primary_id: { $ref: 'enhanced_id', type: 'serial primary key' }
        },
        tables: {
          users: {
            columns: {
              user_id: 'primary_id'  // Inherits all enhancements
            }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });

    test('should handle complex inheritance with multiple levels', () => {
      const schema = {
        columns: {
          // Base types
          id: 'integer',
          name: 'varchar(50)',
          amount: 'numeric(10,2)',

          // Enhanced types (no $ref in global columns - just define new types)
          primary_id: 'serial primary key',
          unique_name: 'varchar(50) unique',
          currency_amount: 'numeric(15,4)'
        },
        tables: {
          accounts: {
            columns: {
              account_id: 'primary_id',
              account_name: 'unique_name',
              balance: {
                $ref: 'currency_amount',
                automation: {
                  type: 'SUM',
                  table: 'transactions',
                  foreign_key: 'account_fk',
                  column: 'amount'
                }
              }
            }
          },
          transactions: {
            foreign_keys: {
              account_fk: { table: 'accounts' }
            },
            columns: {
              transaction_id: 'primary_id',
              amount: 'currency_amount'
            }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Edge cases and error conditions', () => {
    test('should reject null inheritance with missing column', () => {
      const schema = {
        columns: {
          id: { type: 'integer' }
        },
        tables: {
          users: {
            columns: {
              missing_column: null  // No reusable column named 'missing_column'
            }
          }
        }
      };
      const result = validator.validate(schema);
      expect(result.isValid).toBe(false);
    });

    test('should reject string inheritance with missing column', () => {
      const schema = {
        columns: {
          id: { type: 'integer' }
        },
        tables: {
          users: {
            columns: {
              user_id: 'missing_column'  // No reusable column named 'missing_column'
            }
          }
        }
      };
      const result = validator.validate(schema);
      expect(result.isValid).toBe(false);
    });

    test('should reject $ref inheritance with missing column', () => {
      const schema = {
        columns: {
          id: { type: 'integer' }
        },
        tables: {
          users: {
            columns: {
              user_id: {
                $ref: 'missing_column',  // No reusable column named 'missing_column'
                type: 'integer primary key'
              }
            }
          }
        }
      };
      const result = validator.validate(schema);
      expect(result.isValid).toBe(false);
    });

    test('should handle empty inheritance gracefully', () => {
      const schema = {
        columns: {
          id: { type: 'integer' }
        },
        tables: {
          users: {
            columns: {
              direct_column: 'varchar(50)',  // Direct definition
              inherited_column: 'id'  // Inherited definition
            }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Type validation with inheritance', () => {
    test('should validate inherited types follow size rules', () => {
      const schema = {
        columns: {
          base_varchar: { type: 'varchar(50)' },
          base_text: { type: 'text' }
        },
        tables: {
          content: {
            columns: {
              title: 'base_varchar',     // varchar with size - valid
              description: 'base_text'   // text without size - valid
            }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });

    test('should maintain type constraints through inheritance', () => {
      const schema = {
        columns: {
          precise_numeric: { type: 'numeric(10,2)' },
          simple_integer: { type: 'integer' }
        },
        tables: {
          financial: {
            columns: {
              amount: 'precise_numeric',      // Maintains size and decimal
              count: 'simple_integer'         // Maintains integer constraints
            }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });
  });
});