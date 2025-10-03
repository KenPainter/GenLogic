/**
 * Group 1: YAML Validation Tests - Cross-Reference Validation
 *
 * GENLOGIC TESTING: Verify that references between schema sections are valid
 * Tests column inheritance, automation references, and foreign key references
 */

import { SchemaValidator } from '../../src/validation';
import { invalidSchemas } from '../fixtures/invalid-schemas';
import { validSchemas } from '../fixtures/valid-schemas';

describe('Group 1.3: Cross-Reference Validation', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  describe('Column inheritance validation', () => {
    test('should reject $ref to nonexistent column', () => {
      const result = validator.validate(invalidSchemas.invalidRefColumn.schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('does not exist in reusable columns'))).toBe(true);
    });

    test('should reject string reference to nonexistent column', () => {
      const result = validator.validate(invalidSchemas.invalidStringReference.schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('does not exist in reusable columns'))).toBe(true);
    });

    test('should reject null reference to nonexistent column', () => {
      const result = validator.validate(invalidSchemas.emptyReferenceToMissing.schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('references missing reusable column'))).toBe(true);
    });

    test('should accept valid column references', () => {
      const result = validator.validate(validSchemas.complexSchema);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Automation reference validation', () => {
    test('should reject automation referencing nonexistent table', () => {
      const result = validator.validate(invalidSchemas.invalidAutomationTable.schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('does not exist'))).toBe(true);
    });

    test('should reject automation referencing nonexistent foreign key', () => {
      const result = validator.validate(invalidSchemas.invalidAutomationForeignKey.schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('does not exist in table'))).toBe(true);
    });

    test('should accept valid automation references', () => {
      const result = validator.validate(validSchemas.simpleAccountLedger);
      expect(result.isValid).toBe(true);
    });

    test('should accept multiple automation types', () => {
      const result = validator.validate(validSchemas.multipleAggregations);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Foreign key reference validation', () => {
    test('should reject foreign key referencing nonexistent table', () => {
      const result = validator.validate(invalidSchemas.invalidForeignKeyTable.schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('does not exist'))).toBe(true);
    });

    test('should accept valid foreign key references', () => {
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
          }
        }
      };
      const result = validator.validate(schema);
      expect(result.isValid).toBe(true);
    });

    test('should validate foreign key prefix/suffix options', () => {
      const schema = {
        tables: {
          users: {
            columns: {
              user_id: { type: 'integer', primary_key: true }
            }
          },
          accounts: {
            foreign_keys: {
              user_fk: {
                table: 'users',
                prefix: 'owner_',
                suffix: '_ref'
              }
            },
            columns: {
              account_id: { type: 'integer', primary_key: true }
            }
          }
        }
      };
      const result = validator.validate(schema);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Complex reference scenarios', () => {
    test('should validate multi-level references', () => {
      const schema = {
        columns: {
          base_id: { type: 'integer', primary_key: true },
          base_name: { type: 'varchar', size: 100 }
        },
        tables: {
          level1: {
            columns: {
              id: 'base_id',
              name: 'base_name',
              latest_level2_name: {
                automation: {
                  type: 'LATEST',
                  table: 'level2',
                  foreign_key: 'level1_fk',
                  column: 'name'
                }
              }
            }
          },
          level2: {
            foreign_keys: {
              level1_fk: { table: 'level1' }
            },
            columns: {
              id: 'base_id',
              name: 'base_name'
            }
          }
        }
      };
      const result = validator.validate(schema);
      expect(result.isValid).toBe(true);
    });

    test('should validate cascading inheritance patterns', () => {
      const schema = {
        columns: {
          id: { type: 'integer', sequence: true, primary_key: true },
          name: { type: 'varchar', size: 50 },
          enhanced_name: { $ref: 'name', unique: true }
        },
        tables: {
          base_table: {
            columns: {
              table_id: 'id',
              table_name: 'enhanced_name'
            }
          }
        }
      };
      const result = validator.validate(schema);
      expect(result.isValid).toBe(true);
    });
  });
});