/**
 * General-purpose file writing utility
 *
 * Handles JSON serialization and file output with appropriate logging.
 * Used for all debug/inspection output files (.parsed.json, .extracted.json, etc.)
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { basename, extname, join } from 'path';

export interface FileWriterConfig {
  /** Directory where schema file is located */
  schemaPath: string;
  /** Optional override directory for output files */
  dumpDir?: string;
}

export interface FileWriterResult {
  outputPath: string;
}

/**
 * Write data to a JSON file next to the schema
 *
 * @param config Configuration with schema path and optional dump directory
 * @param suffix File suffix (e.g., '.parsed.json', '.extracted.json')
 * @param data Data to serialize to JSON
 * @param description Human-readable description for console output
 * @returns Result with output path
 */
export function writeSchemaDebugFile(
  config: FileWriterConfig,
  suffix: string,
  data: any,
  description: string
): FileWriterResult {
  const outputPath = getOutputPath(config.schemaPath, suffix, config.dumpDir);

  // Ensure directory exists
  const dir = outputPath.substring(0, outputPath.lastIndexOf('/'));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Serialize and write (with custom replacer to handle Maps)
  const json = JSON.stringify(data, mapReplacer, 2);
  writeFileSync(outputPath, json, 'utf-8');

  console.log(`   ${description} written to: ${outputPath}`);

  return { outputPath };
}

/**
 * JSON.stringify replacer that converts Maps to objects/arrays
 */
function mapReplacer(key: string, value: any): any {
  if (value instanceof Map) {
    // Check if this looks like a simple key-value map
    const firstEntry = value.entries().next().value;
    if (firstEntry && typeof firstEntry[1] === 'object' && firstEntry[1] !== null) {
      // Complex values - convert to array of objects
      return Array.from(value.entries()).map(([k, v]) => ({ [key === 'tableLayers' ? 'layer' : 'name']: k, ...(typeof v === 'object' ? v : { value: v }) }));
    } else {
      // Simple values - convert to object
      return Object.fromEntries(value);
    }
  }
  return value;
}

/**
 * Get output path for a debug file
 *
 * If dumpDir is specified, uses that directory.
 * Otherwise, uses the schema file's directory.
 *
 * @param schemaPath Path to the schema file
 * @param suffix File suffix (e.g., '.parsed.json')
 * @param dumpDir Optional override directory
 * @returns Full path to output file
 */
export function getOutputPath(
  schemaPath: string,
  suffix: string,
  dumpDir?: string
): string {
  const baseFileName = basename(schemaPath, extname(schemaPath));

  if (dumpDir) {
    // Use specified dump directory
    return join(dumpDir, `${baseFileName}${suffix}`);
  } else {
    // Use schema file's directory (default behavior)
    return schemaPath.replace(/\.(yaml|yml)$/i, suffix);
  }
}
