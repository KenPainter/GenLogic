/**
 * SQL Type Parser
 *
 * Parses PostgreSQL type strings to extract type metadata.
 * Does NOT parse modifiers (not null, unique, default, etc.) - those are handled by definition-parser.
 *
 * Extracts:
 * - Base type (normalized to PostgreSQL canonical names)
 * - Size/precision/scale parameters
 * - Serial flag for auto-increment types
 */

import type { NewSchema } from '../new-schema.js';

// Valid PostgreSQL types (must match new-schema.ts VALID_POSTGRES_TYPES)
const VALID_POSTGRES_TYPES = new Set([
  // Numeric types
  'smallint', 'integer', 'bigint', 'int', 'int2', 'int4', 'int8',
  'decimal', 'numeric', 'real', 'double precision', 'double_precision',
  'smallserial', 'serial', 'bigserial',
  'money',

  // Character types
  'character varying', 'varchar', 'character', 'char', 'text',

  // Binary types
  'bytea',

  // Date/time types
  'timestamp', 'timestamp without time zone', 'timestamp with time zone',
  'timestamptz', 'date', 'time', 'time without time zone',
  'time with time zone', 'timetz', 'interval',

  // Boolean
  'boolean', 'bool',

  // Geometric types
  'point', 'line', 'lseg', 'box', 'path', 'polygon', 'circle',

  // Network types
  'cidr', 'inet', 'macaddr', 'macaddr8',

  // Bit string types
  'bit', 'bit varying', 'varbit',

  // Text search types
  'tsvector', 'tsquery',

  // UUID
  'uuid',

  // XML
  'xml',

  // JSON
  'json', 'jsonb',

  // Arrays
  'array',

  // Range types
  'int4range', 'int8range', 'numrange', 'tsrange', 'tstzrange', 'daterange',

  // Other
  'pg_lsn', 'txid_snapshot'
]);

export interface SQLTypeInfo {
  type: string;                        // Normalized PostgreSQL type name
  serial?: boolean;                    // True for serial/bigserial/smallserial
  character_maximum_length?: number;   // For char/varchar/text
  numeric_precision?: number;          // For numeric types
  numeric_scale?: number;              // For numeric types
}

/**
 * Helper: Check if there's unrecognized text remaining after parsing
 * Returns true if there's an error (and pushes to newSchema.errors)
 */
function checkUnrecognizedModifiers(
  newSchema: NewSchema,
  location: string,
  originalString: string,
  parsedString: string,
  remaining: string
): boolean {
  if (remaining.trim()) {
    newSchema.errors.push({
      location,
      message: `Unrecognized SQL modifiers: "${remaining.trim()}" in definition: ${originalString}`
    });
    return true;
  }
  return false;
}

/**
 * Parse a SQL type string to extract type metadata
 * Returns type info or null if invalid
 * Pushes errors to newSchema.errors
 */
export function parseSQLType(
  newSchema: NewSchema,
  location: string,
  typeString: string
): SQLTypeInfo | null {

  let sql = typeString.trim().replace(/\s+/g, ' ');
  const result: SQLTypeInfo = { type: '' };

  // Handle multi-word types - normalize to what PostgreSQL uses
  if (sql.match(/^double\s+precision/i)) {
    sql = sql.replace(/^double\s+precision/i, 'double_precision');
  }
  // Normalize varchar to character varying to match PostgreSQL's information_schema
  if (sql.match(/^varchar/i)) {
    sql = sql.replace(/^varchar/i, 'character varying');
  } else if (sql.match(/^character\s+varying/i)) {
    // Already in PostgreSQL format, just collapse whitespace
    sql = sql.replace(/^character\s+varying/i, 'character varying');
  }

  // Parse SERIAL types (shorthand for integer with auto-increment)
  const serialMatch = sql.match(/^(big|small)?serial/i);
  if (serialMatch) {
    const remaining = sql.substring(serialMatch[0].length);
    if (checkUnrecognizedModifiers(newSchema, location, typeString, serialMatch[0], remaining)) {
      return null;
    }

    result.serial = true;
    if (serialMatch[0].toLowerCase() === 'bigserial') {
      result.type = 'bigint';
    } else if (serialMatch[0].toLowerCase() === 'smallserial') {
      result.type = 'smallint';
    } else {
      result.type = 'integer';
    }
    // For serial types, we're done (no size/precision)
    return result;
  }

  // Extract base type and size/precision
  // Handle multi-word types first (character varying, double precision)
  let typeMatch;
  if (sql.match(/^character varying/i)) {
    typeMatch = sql.match(/^(character varying)(?:\((\d+)(?:,\s*(\d+))?\))?/i);
  } else if (sql.match(/^double\s+precision/i)) {
    typeMatch = sql.match(/^(double\s+precision)(?:\((\d+)(?:,\s*(\d+))?\))?/i);
  } else if (sql.match(/^double_precision/i)) {
    typeMatch = sql.match(/^(double_precision)(?:\((\d+)(?:,\s*(\d+))?\))?/i);
  } else {
    typeMatch = sql.match(/^(\w+)(?:\((\d+)(?:,\s*(\d+))?\))?/i);
  }

  if (!typeMatch) {
    newSchema.errors.push({
      location,
      message: `Invalid SQL type: ${typeString}`
    });
    return null;
  }

  // Check if there's unrecognized text after the type
  const remaining = sql.substring(typeMatch[0].length);
  if (checkUnrecognizedModifiers(newSchema, location, typeString, typeMatch[0], remaining)) {
    return null;
  }

  result.type = typeMatch[1].toLowerCase();

  // Normalize type aliases to canonical names
  result.type = normalizePostgresType(result.type);

  // Validate that the type is a known PostgreSQL type
  if (!VALID_POSTGRES_TYPES.has(result.type)) {
    newSchema.errors.push({
      location,
      message: `Unknown PostgreSQL type: ${result.type} - do you need to define a reusable column '${result.type}'?`
    });
    return null;
  }

  // Map size/precision to PostgreSQL-aligned property names
  if (typeMatch[2]) {
    // For character types, use character_maximum_length
    if (result.type.includes('char') || result.type === 'text') {
      result.character_maximum_length = parseInt(typeMatch[2], 10);
    } else {
      // For numeric types, use numeric_precision
      result.numeric_precision = parseInt(typeMatch[2], 10);
    }
  }

  if (typeMatch[3]) {
    result.numeric_scale = parseInt(typeMatch[3], 10);
  }

  // Normalize integer types: add precision if not specified
  if (['integer', 'int', 'int4'].includes(result.type) && !result.numeric_precision) {
    result.numeric_precision = 32;
    result.numeric_scale = 0;
  }

  return result;
}

/**
 * Normalize PostgreSQL type aliases to canonical names
 * This ensures decimal and numeric are treated identically
 * Must match new-schema.ts normalizePostgresType()
 */
function normalizePostgresType(type: string): string {
  const typeMap: Record<string, string> = {
    'int': 'integer',
    'int4': 'integer',
    'int2': 'smallint',
    'int8': 'bigint',
    'float8': 'double precision',
    'float4': 'real',
    'bool': 'boolean',
    'varchar': 'character varying',
    'char': 'character',
    'decimal': 'numeric',
    'double_precision': 'double precision'
  };

  return typeMap[type.toLowerCase()] || type;
}
