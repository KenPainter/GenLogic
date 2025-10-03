/**
 * Group 1: YAML Validation Tests - Schema Syntax
 *
 * GENLOGIC TESTING: Verify that invalid YAML schemas are properly rejected
 * Tests JSON Schema validation and basic syntax rules
 */

import { SchemaValidator } from '../../src/validation';
import { invalidSchemas } from '../fixtures/invalid-schemas';
import { validSchemas } from '../fixtures/valid-schemas';

describe('Group 1.1: Schema Syntax Validation', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  describe('Top-level key validation', () => {
    test('should reject invalid top-level keys', () => {
      const result = validator.validateSyntax(invalidSchemas.invalidTopLevelKey.schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('additional properties'))).toBe(true);
    });

    test('should accept valid top-level keys (columns, tables)', () => {
      const result = validator.validateSyntax(validSchemas.simpleAccountLedger);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should accept empty schema', () => {
      const result = validator.validateSyntax({});
      expect(result.isValid).toBe(true);
    });
  });

  describe('Column name validation', () => {
    test('should reject column names starting with numbers', () => {
      const result = validator.validateSyntax(invalidSchemas.invalidColumnName.schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('additional properties'))).toBe(true);
    });

    test('should reject column names with spaces', () => {
      const schema = {
        columns: {
          'invalid name': { type: 'varchar', size: 50 }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(false);
    });

    test('should reject column names with hyphens', () => {
      const schema = {
        columns: {
          'invalid-name': { type: 'varchar', size: 50 }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(false);
    });

    test('should accept valid column names', () => {
      const schema = {
        columns: {
          'valid_name': { type: 'varchar', size: 50 },
          'ValidName': { type: 'integer' },
          '_private': { type: 'text' },
          'name123': { type: 'varchar', size: 100 }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Table name validation', () => {
    test('should reject table names with hyphens', () => {
      const result = validator.validateSyntax(invalidSchemas.invalidTableName.schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('additional properties'))).toBe(true);
    });

    test('should reject table names with spaces', () => {
      const schema = {
        tables: {
          'invalid table': {
            columns: { id: { type: 'integer' } }
          }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(false);
    });

    test('should accept valid table names', () => {
      const schema = {
        tables: {
          'users': { columns: { id: { type: 'integer' } } },
          'UserProfiles': { columns: { id: { type: 'integer' } } },
          '_temp_table': { columns: { id: { type: 'integer' } } },
          'table123': { columns: { id: { type: 'integer' } } }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });
  });

  describe('YAML structure validation', () => {
    test('should reject non-object schemas', () => {
      const result = validator.validateSyntax('invalid string schema');
      expect(result.isValid).toBe(false);
    });

    test('should reject null schemas', () => {
      const result = validator.validateSyntax(null);
      expect(result.isValid).toBe(false);
    });

    test('should reject array schemas', () => {
      const result = validator.validateSyntax(['invalid', 'array']);
      expect(result.isValid).toBe(false);
    });
  });
});