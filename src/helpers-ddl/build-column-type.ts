import type { ColumnDef } from '../new-schema-subtypes.js';

/**
 * Format a default value for SQL DDL
 * Adds quotes around string literals based on the column's SQL type
 */
export function formatDefaultValue(col: ColumnDef): string {
  if (col.defaultValue === undefined) {
    return '';
  }

  const value = col.defaultValue;

  // SQL keywords/functions that should never be quoted
  const sqlKeywords = [
    'CURRENT_TIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIME',
    'NOW()', 'LOCALTIME', 'LOCALTIMESTAMP',
    'NULL', 'TRUE', 'FALSE'
  ];

  // Check if value is a SQL keyword/function (case-insensitive)
  const upperValue = value.toUpperCase();
  if (sqlKeywords.some(keyword => upperValue === keyword || upperValue.startsWith(keyword))) {
    return value;
  }

  // Types that require quoted string literals
  const stringTypes = [
    'character varying', 'varchar',
    'character', 'char',
    'text',
    'date',
    'timestamp', 'timestamp without time zone', 'timestamp with time zone',
    'timestamptz',
    'time', 'time without time zone', 'time with time zone', 'timetz',
    'interval',
    'uuid',
    'json', 'jsonb',
    'xml'
  ];

  // Check if this column type needs quotes
  if (stringTypes.includes(col.type)) {
    return `'${value}'`;
  }

  // All other types (numeric, boolean, etc.) don't need quotes
  return value;
}

/**
 * Normalize PostgreSQL type aliases to their canonical names
 * This ensures that int, int4, and integer are all treated as equivalent
 */
function normalizePostgresType(typeName: string): string {
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
    'decimal': 'numeric'
  };

  return typeMap[typeName.toLowerCase()] || typeName;
}

/**
 * Build the type portion of a column definition (type + size/precision)
 * Used by both CREATE TABLE and ALTER COLUMN TYPE statements
 *
 * Handles:
 * - Character types: varchar(100), character varying(255)
 * - Numeric types with precision: numeric(10,2), decimal(5,2)
 * - Integer types: Does NOT add precision/scale (PostgreSQL doesn't support it)
 * - Serial types: Returns 'serial' without modifiers
 *
 * @param col - Column definition with type and size information
 * @returns Type string suitable for SQL DDL (e.g., "character varying(100)", "numeric(10,2)", "integer")
 */
export function buildColumnTypeString(col: ColumnDef): string {
  // Normalize type aliases to canonical names for consistent comparison
  const normalizedType = col.serial ? 'serial' : normalizePostgresType(col.type);

  // Use 'serial' for serial columns, otherwise use the normalized type
  let typeStr = normalizedType;

  // Add size/precision (but NOT for serial - serial doesn't have size notation)
  if (!col.serial) {
    // For character types
    if (col.character_maximum_length !== undefined) {
      typeStr += `(${col.character_maximum_length})`;
    }
    // For numeric/decimal types that support precision/scale
    // NOTE: PostgreSQL integer types (smallint, integer, bigint, int, int2, int4, int8)
    // do NOT support precision/scale syntax
    else if (col.numeric_precision !== undefined) {
      const typesWithPrecision = ['numeric', 'decimal', 'real', 'double precision'];
      // Use normalized type for the check (decimal normalizes to numeric)
      if (typesWithPrecision.includes(normalizedType)) {
        if (col.numeric_scale !== undefined) {
          typeStr += `(${col.numeric_precision},${col.numeric_scale})`;
        } else {
          typeStr += `(${col.numeric_precision})`;
        }
      }
    }
  }

  return typeStr;
}
