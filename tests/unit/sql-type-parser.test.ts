/**
 * SQL Type Parser Tests
 *
 * Tests parsing of SQL type strings into GenLogic column definitions
 */

import { parseSQLType, formatSQLType } from '../../src/sql-type-parser';

describe('SQL Type Parser', () => {
  describe('Basic type parsing', () => {
    test('should parse simple types without size', () => {
      expect(parseSQLType('integer')).toEqual({ type: 'integer' });
      expect(parseSQLType('date')).toEqual({ type: 'date' });
      expect(parseSQLType('timestamp')).toEqual({ type: 'timestamp' });
      expect(parseSQLType('text')).toEqual({ type: 'text' });
      expect(parseSQLType('boolean')).toEqual({ type: 'boolean' });
    });

    test('should parse types with size', () => {
      expect(parseSQLType('varchar(100)')).toEqual({
        type: 'varchar',
        size: 100
      });
      expect(parseSQLType('char(10)')).toEqual({
        type: 'char',
        size: 10
      });
    });

    test('should parse types with precision and scale', () => {
      expect(parseSQLType('numeric(10,2)')).toEqual({
        type: 'numeric',
        size: 10,
        decimal: 2
      });
      expect(parseSQLType('numeric(15, 4)')).toEqual({
        type: 'numeric',
        size: 15,
        decimal: 4
      });
    });

    test('should be case-insensitive', () => {
      expect(parseSQLType('VARCHAR(100)')).toEqual({
        type: 'varchar',
        size: 100
      });
      expect(parseSQLType('INTEGER')).toEqual({ type: 'integer' });
    });
  });

  describe('SERIAL type parsing', () => {
    test('should parse serial as integer with sequence', () => {
      expect(parseSQLType('serial')).toEqual({
        type: 'integer',
        sequence: true
      });
    });

    test('should parse bigserial as bigint with sequence', () => {
      expect(parseSQLType('bigserial')).toEqual({
        type: 'bigint',
        sequence: true
      });
    });

    test('should parse smallserial as smallint with sequence', () => {
      expect(parseSQLType('smallserial')).toEqual({
        type: 'smallint',
        sequence: true
      });
    });

    test('should parse serial with modifiers', () => {
      expect(parseSQLType('serial primary key')).toEqual({
        type: 'integer',
        sequence: true,
        primary_key: true
      });
    });
  });

  describe('Modifier parsing', () => {
    test('should parse primary key modifier', () => {
      expect(parseSQLType('integer primary key')).toEqual({
        type: 'integer',
        primary_key: true
      });
    });

    test('should parse unique modifier', () => {
      expect(parseSQLType('varchar(100) unique')).toEqual({
        type: 'varchar',
        size: 100,
        unique: true
      });
    });

    test('should parse not null modifier', () => {
      expect(parseSQLType('varchar(100) not null')).toEqual({
        type: 'varchar',
        size: 100,
        not_null: true
      });
    });

    test('should parse multiple modifiers', () => {
      expect(parseSQLType('varchar(100) unique not null')).toEqual({
        type: 'varchar',
        size: 100,
        unique: true,
        not_null: true
      });

      expect(parseSQLType('varchar(100) not null unique')).toEqual({
        type: 'varchar',
        size: 100,
        unique: true,
        not_null: true
      });
    });

    test('should parse all modifiers together', () => {
      expect(parseSQLType('integer primary key not null unique')).toEqual({
        type: 'integer',
        primary_key: true,
        unique: true,
        not_null: true
      });
    });
  });

  describe('DEFAULT clause parsing', () => {
    test('should parse string defaults with single quotes', () => {
      expect(parseSQLType("varchar(20) default 'pending'")).toEqual({
        type: 'varchar',
        size: 20,
        default: 'pending'
      });
    });

    test('should parse numeric defaults', () => {
      expect(parseSQLType('integer default 0')).toEqual({
        type: 'integer',
        default: '0'
      });

      expect(parseSQLType('numeric(10,2) default 99.99')).toEqual({
        type: 'numeric',
        size: 10,
        decimal: 2,
        default: '99.99'
      });
    });

    test('should parse boolean defaults', () => {
      expect(parseSQLType('boolean default true')).toEqual({
        type: 'boolean',
        default: 'true'
      });

      expect(parseSQLType('boolean default false')).toEqual({
        type: 'boolean',
        default: 'false'
      });
    });

    test('should parse NULL default', () => {
      expect(parseSQLType('varchar(100) default NULL')).toEqual({
        type: 'varchar',
        size: 100,
        default: 'NULL'
      });
    });

    test('should parse function defaults', () => {
      expect(parseSQLType('timestamp default NOW()')).toEqual({
        type: 'timestamp',
        default: 'NOW()'
      });

      expect(parseSQLType('timestamptz default CURRENT_TIMESTAMP')).toEqual({
        type: 'timestamptz',
        default: 'CURRENT_TIMESTAMP'
      });
    });

    test('should parse default with other modifiers', () => {
      expect(parseSQLType("varchar(20) not null default 'active'")).toEqual({
        type: 'varchar',
        size: 20,
        not_null: true,
        default: 'active'
      });
    });
  });

  describe('Complex combinations', () => {
    test('should parse complete column definitions', () => {
      expect(parseSQLType('varchar(255) unique not null')).toEqual({
        type: 'varchar',
        size: 255,
        unique: true,
        not_null: true
      });

      expect(parseSQLType("varchar(20) not null default 'pending'")).toEqual({
        type: 'varchar',
        size: 20,
        not_null: true,
        default: 'pending'
      });

      expect(parseSQLType('serial primary key')).toEqual({
        type: 'integer',
        sequence: true,
        primary_key: true
      });
    });
  });

  describe('Error handling', () => {
    test('should throw on invalid type string', () => {
      expect(() => parseSQLType('(100)')).toThrow('Invalid SQL type string');
    });

    test('should throw on unrecognized modifiers', () => {
      expect(() => parseSQLType('integer invalid_modifier')).toThrow('Unrecognized SQL modifiers');
    });
  });

  describe('Format SQL type', () => {
    test('should format basic types', () => {
      expect(formatSQLType({ type: 'integer' })).toBe('INTEGER');
      expect(formatSQLType({ type: 'varchar', size: 100 })).toBe('VARCHAR(100)');
      expect(formatSQLType({ type: 'numeric', size: 10, decimal: 2 })).toBe('NUMERIC(10,2)');
    });

    test('should format serial types', () => {
      expect(formatSQLType({ type: 'integer', sequence: true })).toBe('SERIAL');
      expect(formatSQLType({ type: 'bigint', sequence: true })).toBe('BIGSERIAL');
      expect(formatSQLType({ type: 'smallint', sequence: true })).toBe('SMALLSERIAL');
    });

    test('should format with modifiers', () => {
      expect(formatSQLType({ type: 'integer', primary_key: true })).toBe('INTEGER PRIMARY KEY');
      expect(formatSQLType({ type: 'varchar', size: 100, unique: true, not_null: true }))
        .toBe('VARCHAR(100) UNIQUE NOT NULL');
    });

    test('should format with default values', () => {
      expect(formatSQLType({ type: 'varchar', size: 20, default: 'pending' }))
        .toBe("VARCHAR(20) DEFAULT 'pending'");
      expect(formatSQLType({ type: 'integer', default: '0' }))
        .toBe('INTEGER DEFAULT 0');
      expect(formatSQLType({ type: 'timestamp', default: 'NOW()' }))
        .toBe('TIMESTAMP DEFAULT NOW()');
    });
  });
});
