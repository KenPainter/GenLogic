/**
 * NewSchema - The Master Schema Class
 *
 * Represents the complete schema that GenLogic will apply to the database.
 * This is the "new" or "desired" state, compared against CurrentSchema (the live database).
 *
 * Validation must occur after it is built, due to heavy need
 * for cross-referencing that can only happen after it is built.
 *
 * Design principles:
 * - built incrementally
 * - use class code for simple and clean operations
 *   that require knowledge of class members
 * - allow full public access, sometimes it makes more
 *   sense to put long orchestrations in their own file
 * - DUMP-able Javascript, no maps.
 *
 */

// Imported from ./new-schema-subtypes.ts
import type { SchemaError } from './new-schema-subtypes.js';

export class NewSchema {
  public constants: Record<string, any> = {};
  public reusableColumns: Record<string, any> = {};
  public tables: Record<string, any> = {};

  // Imported from ./new-schema-subtypes.ts
  public errors: SchemaError[] = [];

  constructor() {
    // Empty - NewSchema is built incrementally by processor
  }

  /**
   * Replace ${CONSTANT_NAME} placeholders in a string
   * Supports recursive constants (constants that reference other constants)
   * Accumulates errors instead of throwing
   */
  replaceConstants(str: string, location: string): string {
    // Safety: prevent infinite loops
    let iterations = 0;
    const maxIterations = 10;

    let result = str;
    while (result.includes('${') && iterations < maxIterations) {
      const before = result;
      result = result.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (match, name) => {
        if (!(name in this.constants)) {
          this.errors.push({
            location,
            message: `Undefined constant: ${name}`
          });
          return match; // Leave unreplaced
        }
        return String(this.constants[name]);
      });

      if (result === before) break; // No more replacements
      iterations++;
    }

    if (iterations >= maxIterations) {
      this.errors.push({
        location,
        message: 'Circular constant reference detected'
      });
    }

    return result;
  }
}
