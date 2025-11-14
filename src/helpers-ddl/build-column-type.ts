import type { ColumnDef } from '../new-schema-subtypes.js';

/**
 * Format a default value for SQL DDL
 * Returns the value exactly as the user entered it
 */
export function formatDefaultValue(col: ColumnDef): string {
  if (col.defaultValue === undefined) {
    return '';
  }

  // Return the default value exactly as entered by the user
  return col.defaultValue;
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
  // For serial columns, determine the correct serial type based on underlying type
  let normalizedType: string;
  if (col.serial) {
    const baseType = normalizePostgresType(col.type);
    if (baseType === 'bigint') {
      normalizedType = 'bigserial';
    } else if (baseType === 'smallint') {
      normalizedType = 'smallserial';
    } else {
      normalizedType = 'serial';  // integer -> serial
    }
  } else {
    normalizedType = normalizePostgresType(col.type);
  }

  // Use the normalized type
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
