/**
 * Group 1: YAML Validation Tests - Type System
 *
 * GENLOGIC TESTING: Verify PostgreSQL type validation rules
 * Tests the three-tier type validation system (require/allow/prohibit size)
 */

import { SchemaValidator } from '../../src/validation';
import { invalidSchemas } from '../fixtures/invalid-schemas';

describe('Group 1.2: Type System Validation', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  describe('Required type field', () => {
    test('should reject column definitions without type', () => {
      const result = validator.validateSyntax(invalidSchemas.missingTypeField.schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('type'))).toBe(true);
    });

    test('should accept column definitions with valid types', () => {
      const schema = {
        columns: {
          id: { type: 'integer' },
          name: { type: 'varchar', size: 50 },
          amount: { type: 'numeric', size: 10, decimal: 2 },
          created: { type: 'timestamp' }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Types that REQUIRE size', () => {
    test('should reject varchar without size', () => {
      const result = validator.validateSyntax(invalidSchemas.varcharWithoutSize.schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('required'))).toBe(true);
    });

    test('should reject char without size', () => {
      const schema = {
        columns: {
          code: { type: 'char' }  // char requires size
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(false);
    });

    test('should reject bit without size', () => {
      const schema = {
        columns: {
          flags: { type: 'bit' }  // bit requires size
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(false);
    });

    test('should accept varchar with size', () => {
      const schema = {
        columns: {
          name: { type: 'varchar', size: 255 },
          code: { type: 'char', size: 3 },
          flags: { type: 'bit', size: 8 }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Types that ALLOW size (optional)', () => {
    test('should accept numeric without size', () => {
      const schema = {
        columns: {
          amount: { type: 'numeric' }  // numeric allows unlimited precision
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });

    test('should accept numeric with size only', () => {
      const schema = {
        columns: {
          amount: { type: 'numeric', size: 10 }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });

    test('should accept numeric with size and decimal', () => {
      const schema = {
        columns: {
          amount: { type: 'numeric', size: 10, decimal: 2 }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });

    test('should accept decimal types', () => {
      const schema = {
        columns: {
          price: { type: 'decimal', size: 8, decimal: 2 }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Types that PROHIBIT size', () => {
    test('should reject date with size', () => {
      const result = validator.validateSyntax(invalidSchemas.dateWithSize.schema);
      expect(result.isValid).toBe(false);
    });

    test('should reject timestamp with size', () => {
      const schema = {
        columns: {
          created: { type: 'timestamp', size: 10 }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(false);
    });

    test('should reject boolean with size', () => {
      const schema = {
        columns: {
          active: { type: 'boolean', size: 1 }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(false);
    });

    test('should reject integer types with size', () => {
      const schema = {
        columns: {
          count: { type: 'integer', size: 4 }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(false);
    });

    test('should reject text with size', () => {
      const schema = {
        columns: {
          description: { type: 'text', size: 1000 }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(false);
    });

    test('should accept prohibited types without size', () => {
      const schema = {
        columns: {
          created: { type: 'date' },
          updated: { type: 'timestamp' },
          active: { type: 'boolean' },
          count: { type: 'integer' },
          notes: { type: 'text' },
          metadata: { type: 'json' }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Decimal dependency validation', () => {
    test('should reject decimal without size', () => {
      const result = validator.validateSyntax(invalidSchemas.decimalWithoutSize.schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('decimal'))).toBe(true);
    });

    test('should accept decimal with size', () => {
      const schema = {
        columns: {
          amount: { type: 'numeric', size: 10, decimal: 2 }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Size and decimal constraints', () => {
    test('should reject negative size', () => {
      const schema = {
        columns: {
          name: { type: 'varchar', size: -1 }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(false);
    });

    test('should reject zero size', () => {
      const schema = {
        columns: {
          name: { type: 'varchar', size: 0 }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(false);
    });

    test('should reject negative decimal', () => {
      const schema = {
        columns: {
          amount: { type: 'numeric', size: 10, decimal: -1 }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(false);
    });

    test('should accept valid size and decimal values', () => {
      const schema = {
        columns: {
          amount: { type: 'numeric', size: 10, decimal: 0 },
          price: { type: 'numeric', size: 8, decimal: 2 }
        }
      };
      const result = validator.validateSyntax(schema);
      expect(result.isValid).toBe(true);
    });
  });
});