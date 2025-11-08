import { readFileSync } from 'fs';
import { parseDocument } from 'yaml';

/**
 * Simple YAML Parsing
 *
 * Parse YAML file and return the content as a plain JavaScript object.
 * No line tracking, no position mapping - just parse and return.
 *
 * Any YAML parse errors will throw naturally.
 */

/**
 * Load and parse YAML schema
 * Returns plain parsed content with no metadata
 */
export function loadYamlSchema(schemaPath: string): any {
  const yamlContent = readFileSync(schemaPath, 'utf-8');
  const doc = parseDocument(yamlContent);

  // Check for YAML parse errors
  if (doc.errors && doc.errors.length > 0) {
    throw doc.errors[0];
  }

  // Get the parsed schema
  const parsed = doc.toJSON();

  // Ensure we have a valid schema structure
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Schema must be a YAML object');
  }

  return parsed;
}
