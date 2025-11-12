/**
 * Constant Resolution and Cycle Detection
 *
 * Validates that constants don't have circular references using
 * the same topological sort infrastructure used for FK and formula cycles.
 */

import type { NewSchema } from '../new-schema.js';
import { topologicalSortByLayers } from './topological-sort.js';

/**
 * Extract constant names referenced in a value string
 * Finds all ${CONSTANT_NAME} patterns
 *
 * @param value - The value to scan for constant references
 * @returns Array of constant names referenced
 */
function extractConstantReferences(value: string | number | boolean): string[] {
  // Only strings can contain ${} references
  if (typeof value !== 'string') {
    return [];
  }

  const references: string[] = [];
  const regex = /\$\{([A-Z_][A-Z0-9_]*)\}/g;
  let match;

  while ((match = regex.exec(value)) !== null) {
    references.push(match[1]);
  }

  return references;
}

/**
 * Validate constants for circular references
 * Uses topological sort to detect cycles in constant dependencies
 * Pushes errors to newSchema.errors if cycles are found
 *
 * @param newSchema - The schema being built (errors will be added to newSchema.errors)
 */
export function validateConstantCycles(newSchema: NewSchema): void {
  const constants = newSchema.constants;
  const edges: Array<[string, string]> = [];

  // Build dependency edges: if CONST_A references ${CONST_B}, add edge [CONST_A, CONST_B]
  for (const [constName, constValue] of Object.entries(constants)) {
    const references = extractConstantReferences(constValue);
    for (const referencedConst of references) {
      // Add edge: constName depends on referencedConst
      edges.push([constName, referencedConst]);
    }
  }

  // No edges means no dependencies, nothing to validate
  if (edges.length === 0) {
    return;
  }

  // Use topological sort to detect cycles
  // skipSelfLoops: false - self-referential constants are cycles
  const result = topologicalSortByLayers(edges, false);

  // Report any cycles found
  if (result.cycles.length > 0) {
    for (const cycle of result.cycles) {
      newSchema.errors.push({
        location: 'Constants',
        message: `Cycle detected: ${cycle.join(' -> ')}`
      });
    }
  }
}
