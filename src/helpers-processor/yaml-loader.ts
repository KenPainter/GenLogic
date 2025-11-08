import { readFileSync } from 'fs';
import { parseDocument, LineCounter } from 'yaml';
import type { GenLogicSchema } from '../types.js';

/**
 * YAML Parsing with Line Tracking
 *
 * We use the 'yaml' library's LineCounter to track source locations:
 * - LineCounter is passed to parseDocument() as an option
 * - Each YAML node has a 'range' property with byte offsets
 * - lineCounter.linePos(offset) converts offsets to { line, col }
 *
 * The extracted structure has location info INLINE with data (like Babel AST):
 *   { "formula": { _keyLoc: {...}, _valueLoc: {...}, _value: "..." } }
 *
 * See: https://eemeli.org/yaml/#linecounter
 */

export interface ExpandedYaml {
  schemaPath: string;
  content: any;  // Parsed YAML with inline _yamlLine properties
}

/**
 * Load and parse YAML with line tracking - single pass
 * Returns the expanded YAML with inline _yamlLine metadata
 *
 * Each key in the YAML gets a _yamlLine property with its starting line number.
 * You can extract the clean schema by calling extractCleanSchema() on the content.
 */
export function loadYamlSchemaWithTracking(schemaPath: string): ExpandedYaml {
  const yamlContent = readFileSync(schemaPath, 'utf-8');

  // Create a LineCounter to track line positions
  const lineCounter = new LineCounter();
  const doc = parseDocument(yamlContent, { lineCounter });

  // Check for YAML parse errors
  if (doc.errors && doc.errors.length > 0) {
    throw doc.errors[0]; // Throw the first error
  }

  // Get the parsed schema
  const parsed = doc.toJSON();

  // Ensure we have a valid schema structure
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Schema must be a YAML object');
  }

  // Extract the parsed content with line numbers
  const contentWithLines = extractYamlNodeWithLines(doc.contents, lineCounter);

  return {
    schemaPath,
    content: contentWithLines
  };
}

/**
 * Extract clean schema without location metadata
 * Strips _yamlLine and unwraps _value properties
 */
export function extractCleanSchema(content: any): GenLogicSchema {
  if (content === null || content === undefined) {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(item => extractCleanSchema(item)) as any;
  }

  if (typeof content === 'object') {
    // If this is a wrapped scalar: { _yamlLine: 5, _value: "foo" }
    if ('_value' in content && '_yamlLine' in content && Object.keys(content).length === 2) {
      return content._value;
    }

    const result: any = {};
    for (const [key, value] of Object.entries(content)) {
      // Skip _yamlLine metadata
      if (key === '_yamlLine') {
        continue;
      }
      result[key] = extractCleanSchema(value);
    }
    return result;
  }

  return content;
}

/**
 * Recursively extract YAML nodes with inline _yamlLine
 * Just adds the starting line number for each key
 */
function extractYamlNodeWithLines(node: any, lineCounter: LineCounter): any {
  if (!node) return null;

  // Check if this is a YAMLSeq (array)
  if (Array.isArray(node.items) && node.items.length > 0 && !node.items[0].key) {
    // YAMLSeq - array of items
    const result: any[] = [];
    for (const item of node.items) {
      const itemRange = item.range;
      const yamlLine = itemRange ? lineCounter.linePos(itemRange[0]).line : null;

      const extracted = extractYamlNodeWithLines(item, lineCounter);

      // For array items, we need to wrap them with line info
      if (typeof extracted === 'object' && extracted !== null && !Array.isArray(extracted)) {
        result.push({
          _yamlLine: yamlLine,
          ...extracted
        });
      } else {
        result.push({
          _yamlLine: yamlLine,
          _value: extracted
        });
      }
    }
    return result;
  }

  if (node.items) {
    // YAMLMap - has key-value pairs
    const result: any = {};
    for (const pair of node.items) {
      const key = pair.key?.value;
      const keyRange = pair.key?.range;

      // Get the line number for this key
      const yamlLine = keyRange ? lineCounter.linePos(keyRange[0]).line : null;

      const extracted = extractYamlNodeWithLines(pair.value, lineCounter);

      // Always add line number
      if (Array.isArray(extracted)) {
        // Array: keep as-is, don't wrap (array items already have _yamlLine)
        result[key] = {
          _yamlLine: yamlLine,
          _value: extracted
        };
      } else if (typeof extracted === 'object' && extracted !== null) {
        // Object: inline the line number
        result[key] = {
          _yamlLine: yamlLine,
          ...extracted
        };
      } else {
        // Scalar: wrap it
        result[key] = {
          _yamlLine: yamlLine,
          _value: extracted
        };
      }
    }
    return result;
  } else if (node.value !== undefined) {
    // Scalar - return just the value
    return node.value;
  } else if (typeof node === 'object' && node.toJSON) {
    // Has toJSON but not items
    return node.toJSON();
  } else {
    return node;
  }
}
