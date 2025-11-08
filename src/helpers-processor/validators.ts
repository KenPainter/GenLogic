/**
 * Validation Utilities
 *
 * Common validation functions used across the processor pipeline.
 */

/**
 * Valid SQL identifier rules:
 * - Must start with a letter (a-z, A-Z) or underscore (_)
 * - Can contain letters, digits (0-9), underscores, and dollar signs ($)
 * - Maximum length is 63 characters (PostgreSQL limit)
 * - Case-insensitive in PostgreSQL (unless quoted, which we don't support)
 *
 * We use a stricter subset:
 * - Only lowercase letters, digits, and underscores
 * - Must start with a letter or underscore
 * - No dollar signs (reserved for system use)
 * - Length 1-63 characters
 */
const TABLE_NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * Validate a table name according to GenLogic naming rules
 *
 * @param tableName - The table name to validate
 * @returns true if valid, false otherwise
 */
export function isValidTableName(tableName: string): boolean {
  if (!tableName || typeof tableName !== 'string') {
    return false;
  }
  return TABLE_NAME_PATTERN.test(tableName);
}

/**
 * Validate a table name and return an error message if invalid
 *
 * @param tableName - The table name to validate
 * @returns null if valid, error message string if invalid
 */
export function validateTableName(tableName: string): string | null {
  if (!tableName || typeof tableName !== 'string') {
    return 'Table name must be a non-empty string';
  }

  if (tableName.length > 63) {
    return `Table name too long (${tableName.length} chars, max 63): "${tableName}"`;
  }

  if (!TABLE_NAME_PATTERN.test(tableName)) {
    if (!/^[a-z_]/.test(tableName)) {
      return `Table name must start with lowercase letter or underscore: "${tableName}"`;
    }
    if (/[A-Z]/.test(tableName)) {
      return `Table name must be lowercase: "${tableName}"`;
    }
    if (/[^a-z0-9_]/.test(tableName)) {
      return `Table name contains invalid characters (only lowercase, digits, underscore allowed): "${tableName}"`;
    }
  }

  return null;
}
