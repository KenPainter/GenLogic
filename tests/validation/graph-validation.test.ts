/**
 * Group 1: YAML Validation Tests - Data Flow Graph Validation
 *
 * GENLOGIC TESTING: Verify data flow graph construction and cycle detection
 * Tests foreign key cycles and automation dependency cycles
 */

import { SchemaValidator } from '../../src/validation';
import { invalidSchemas } from '../fixtures/invalid-schemas';

describe('Group 1.4: Data Flow Graph Validation', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  describe('Foreign key cycle detection', () => {
    test('should reject simple foreign key cycle', () => {
      const result = validator.validateSyntax(invalidSchemas.foreignKeyCycle.schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Cycle detected'))).toBe(true);
    });

    test('should reject self-referencing foreign key', () => {
      const schema = {
        tables: {
          categories: {
            foreign_keys: {
              parent_fk: { table: 'categories' }  // Self-reference creates cycle
            },
            columns: {
              id: { type: 'integer', primary_key: true },
              name: { type: 'varchar', size: 100 }
            }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Cycle detected'))).toBe(true);
    });

    test('should accept acyclic foreign key relationships', () => {
      const schema = {
        tables: {
          users: {
            columns: {
              user_id: { type: 'integer', primary_key: true }
            }
          },
          accounts: {
            foreign_keys: {
              user_fk: { table: 'users' }
            },
            columns: {
              account_id: { type: 'integer', primary_key: true }
            }
          },
          transactions: {
            foreign_keys: {
              account_fk: { table: 'accounts' },
              user_fk: { table: 'users' }
            },
            columns: {
              transaction_id: { type: 'integer', primary_key: true }
            }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Complex cycle scenarios', () => {
    test('should detect indirect cycles through multiple tables', () => {
      const schema = {
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
              d_fk: { table: 'table_d' }
            },
            columns: { id: { type: 'integer', primary_key: true } }
          },
          table_d: {
            foreign_keys: {
              a_fk: { table: 'table_a' }  // Creates A→B→C→D→A cycle
            },
            columns: { id: { type: 'integer', primary_key: true } }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Cycle detected'))).toBe(true);
    });

    test('should accept diamond dependency patterns (no cycle)', () => {
      const schema = {
        tables: {
          root: {
            columns: { id: { type: 'integer', primary_key: true } }
          },
          branch_a: {
            foreign_keys: { root_fk: { table: 'root' } },
            columns: { id: { type: 'integer', primary_key: true } }
          },
          branch_b: {
            foreign_keys: { root_fk: { table: 'root' } },
            columns: { id: { type: 'integer', primary_key: true } }
          },
          merge: {
            foreign_keys: {
              a_fk: { table: 'branch_a' },
              b_fk: { table: 'branch_b' }
            },
            columns: { id: { type: 'integer', primary_key: true } }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Automation dependency validation', () => {
    test('should validate automation dependency chains', () => {
      const schema = {
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
              level1_fk: { table: 'level1' }
            },
            columns: {
              id: { type: 'integer', primary_key: true },
              subtotal: {
                automation: {
                  type: 'SUM',
                  table: 'level3',
                  foreign_key: 'level2_fk',
                  column: 'amount'
                }
              }
            }
          },
          level3: {
            foreign_keys: {
              level2_fk: { table: 'level2' }
            },
            columns: {
              id: { type: 'integer', primary_key: true },
              amount: null
            }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });

    test('should handle complex automation patterns', () => {
      const schema = {
        columns: {
          amount: { type: 'numeric', size: 10, decimal: 2 },
          count: { type: 'integer' },
          date: { type: 'date' }
        },
        tables: {
          summary: {
            columns: {
              id: { type: 'integer', primary_key: true },
              total_amount: {
                automation: {
                  type: 'SUM',
                  table: 'details',
                  foreign_key: 'summary_fk',
                  column: 'amount'
                }
              },
              detail_count: {
                automation: {
                  type: 'COUNT',
                  table: 'details',
                  foreign_key: 'summary_fk',
                  column: 'amount'
                }
              },
              latest_date: {
                automation: {
                  type: 'LATEST',
                  table: 'details',
                  foreign_key: 'summary_fk',
                  column: 'created_date'
                }
              }
            }
          },
          details: {
            foreign_keys: {
              summary_fk: { table: 'summary' }
            },
            columns: {
              id: { type: 'integer', primary_key: true },
              amount: null,
              created_date: 'date'
            }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Mixed dependency validation', () => {
    test('should validate schemas with both FK and automation dependencies', () => {
      const schema = {
        columns: {
          amount: { type: 'numeric', size: 10, decimal: 2 }
        },
        tables: {
          accounts: {
            columns: {
              id: { type: 'integer', primary_key: true },
              balance: {
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
              account_fk: { table: 'accounts' },
              category_fk: { table: 'categories' }
            },
            columns: {
              id: { type: 'integer', primary_key: true },
              amount: null
            }
          },
          categories: {
            columns: {
              id: { type: 'integer', primary_key: true },
              total_spent: {
                automation: {
                  type: 'SUM',
                  table: 'transactions',
                  foreign_key: 'category_fk',
                  column: 'amount'
                }
              }
            }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });
  });
});