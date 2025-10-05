/**
 * SQL Type Parser
 *
 * Parses SQL type strings into GenLogic column definitions
 * Examples: "varchar(100)", "numeric(10,2)", "serial primary key", "varchar(100) not null unique default 'pending'"
 */

export interface ParsedSQLType {
  type: string;
  size?: number;
  decimal?: number;
  primary_key?: boolean;
  unique?: boolean;
  not_null?: boolean;
  sequence?: boolean;
  default?: string;
}

/**
 * Parse a SQL type string into component parts
 */
export function parseSQLType(sqlTypeString: string): ParsedSQLType {
  const result: ParsedSQLType = {
    type: ''
  };

  // Normalize whitespace
  let sql = sqlTypeString.trim().replace(/\s+/g, ' ');

  // Handle SERIAL types (shorthand for integer with sequence)
  const serialMatch = sql.match(/^(big|small)?serial/i);
  if (serialMatch) {
    result.sequence = true;
    if (serialMatch[0].toLowerCase() === 'bigserial') {
      result.type = 'bigint';
    } else if (serialMatch[0].toLowerCase() === 'smallserial') {
      result.type = 'smallint';
    } else {
      result.type = 'integer';
    }
    // Remove serial keyword from sql string
    sql = sql.replace(/^(big|small)?serial/i, '').trim();
  } else {
    // Extract base type and size/precision
    const typeMatch = sql.match(/^(\w+)(?:\((\d+)(?:,\s*(\d+))?\))?/i);
    if (!typeMatch) {
      throw new Error(`Invalid SQL type string: ${sqlTypeString}`);
    }

    result.type = typeMatch[1].toLowerCase();

    if (typeMatch[2]) {
      result.size = parseInt(typeMatch[2], 10);
    }

    if (typeMatch[3]) {
      result.decimal = parseInt(typeMatch[3], 10);
    }

    // Remove type from sql string
    sql = sql.replace(/^(\w+)(?:\((\d+)(?:,\s*(\d+))?\))?/i, '').trim();
  }

  // Parse modifiers (order-independent)
  if (sql.match(/\bprimary\s+key\b/i)) {
    result.primary_key = true;
    sql = sql.replace(/\bprimary\s+key\b/i, '').trim();
  }

  if (sql.match(/\bunique\b/i)) {
    result.unique = true;
    sql = sql.replace(/\bunique\b/i, '').trim();
  }

  if (sql.match(/\bnot\s+null\b/i)) {
    result.not_null = true;
    sql = sql.replace(/\bnot\s+null\b/i, '').trim();
  }

  // Parse DEFAULT clause (must be last modifier)
  const defaultMatch = sql.match(/\bdefault\s+(.+)$/i);
  if (defaultMatch) {
    let defaultValue = defaultMatch[1].trim();

    // Remove quotes from string literals for storage
    if ((defaultValue.startsWith("'") && defaultValue.endsWith("'")) ||
        (defaultValue.startsWith('"') && defaultValue.endsWith('"'))) {
      defaultValue = defaultValue.slice(1, -1);
    }

    result.default = defaultValue;
    sql = sql.replace(/\bdefault\s+.+$/i, '').trim();
  }

  // Check for any remaining unrecognized modifiers
  if (sql.length > 0) {
    throw new Error(`Unrecognized SQL modifiers: ${sql} in type string: ${sqlTypeString}`);
  }

  return result;
}

/**
 * Convert parsed SQL type back to SQL DDL string (for verification/testing)
 */
export function formatSQLType(parsed: ParsedSQLType): string {
  let sql = '';

  // Handle SERIAL types
  if (parsed.sequence && (parsed.type === 'integer' || parsed.type === 'bigint' || parsed.type === 'smallint')) {
    if (parsed.type === 'bigint') {
      sql = 'BIGSERIAL';
    } else if (parsed.type === 'smallint') {
      sql = 'SMALLSERIAL';
    } else {
      sql = 'SERIAL';
    }
  } else {
    // Regular type
    sql = parsed.type.toUpperCase();

    if (parsed.size !== undefined) {
      if (parsed.decimal !== undefined) {
        sql += `(${parsed.size},${parsed.decimal})`;
      } else {
        sql += `(${parsed.size})`;
      }
    }
  }

  // Add modifiers
  if (parsed.primary_key) sql += ' PRIMARY KEY';
  if (parsed.unique) sql += ' UNIQUE';
  if (parsed.not_null) sql += ' NOT NULL';

  // Add DEFAULT clause
  if (parsed.default !== undefined) {
    // Add quotes back for string literals (simple heuristic: if it's not a number/boolean/function)
    const defaultValue = parsed.default;
    if (defaultValue.match(/^-?\d+(\.\d+)?$/) || // number
        defaultValue.toLowerCase() === 'true' ||
        defaultValue.toLowerCase() === 'false' ||
        defaultValue.toLowerCase() === 'null' ||
        defaultValue.match(/\w+\(.*\)$/)) { // function call
      sql += ` DEFAULT ${defaultValue}`;
    } else {
      sql += ` DEFAULT '${defaultValue}'`;
    }
  }

  return sql;
}
