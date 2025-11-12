/**
 * Unified Column Definition Parser
 *
 * Parses column definition strings with clear validation phases:
 * 1. Extract and validate type sources (FK, reusable, explicit)
 * 2. Resolve single type source
 * 3. Extract and validate modifiers
 *
 * Errors are pushed to newSchema.errors array.
 * Returns ParsedDefinition on success, null on error.
 */

import type { NewSchema } from '../new-schema.js';

export interface ParsedDefinition {
  // Type source (exactly one will be set)
  typeSource: 'fk' | 'reusable' | 'explicit';

  // Type information
  fkParentTable?: string;          // If FK, the parent table name
  reusableName?: string;           // If reusable, the name
  explicitType?: string;           // If explicit, the SQL type

  // Modifiers (extracted from definition string)
  notNull?: boolean;
  isUnique?: boolean;
  isPrimaryKey?: boolean;
  defaultValue?: string;

  // FK-specific modifiers
  deleteAction?: string;           // cascade, restrict, set null, etc.
  autoCreateParent?: boolean;

  // Original definition for reference
  originalDefinition: string;
}

/**
 * Parse a column definition string using unified parsing logic
 * Pushes errors to newSchema.errors if parsing fails
 * Returns ParsedDefinition on success, null on error
 */
export function parseDefinition(
  newSchema: NewSchema,
  location: string,
  definition: string,
  reusableColumns: Set<string>
): ParsedDefinition | null {

  const original = definition;
  let remaining = definition.trim();

  // ============================================================
  // PHASE 1: Extract and validate type sources
  // ============================================================

  // Extract all FK() patterns
  const fkPattern = /FK\([^)]*\)/g;
  const fkMatches: RegExpMatchArray[] = [];
  let match;
  while ((match = fkPattern.exec(remaining)) !== null) {
    fkMatches.push(match);
  }

  if (fkMatches.length > 1) {
    newSchema.errors.push({
      location,
      message: 'Multiple FK definitions found - only one FK() allowed per column'
    });
    return null;
  }

  // Extract FK parent table if present
  let fkParentTable: string | undefined;
  if (fkMatches.length === 1) {
    const fkMatch = fkMatches[0];
    const fkText = fkMatch[0]; // e.g., "FK(customers)"

    // Extract parent table name: remove "FK(" prefix and ")" suffix
    fkParentTable = fkText.substring(3, fkText.length - 1).trim();

    // Validate parent table exists
    if (!(fkParentTable in newSchema.tables)) {
      newSchema.errors.push({
        location,
        message: `FK references non-existent table: ${fkParentTable}`
      });
      return null;
    }

    // Remove FK(...) from remaining string
    remaining = remaining.replace(fkText, '').trim();
  }

  // Extract reusable column matches
  // Find all tokens that match reusable column names
  const tokens = remaining.split(/\s+/);
  const reusableMatches = tokens.filter(token => reusableColumns.has(token));

  if (reusableMatches.length > 1) {
    newSchema.errors.push({
      location,
      message: `Multiple reusable column references found: ${reusableMatches.join(', ')}`
    });
    return null;
  }

  let reusableName: string | undefined;
  if (reusableMatches.length === 1) {
    reusableName = reusableMatches[0];
    // Remove reusable name from remaining string
    remaining = remaining.replace(reusableName, '').trim();
  }

  // Validate: FK + reusable is invalid
  const typeSourceCount = (fkParentTable ? 1 : 0) + (reusableName ? 1 : 0);
  if (typeSourceCount > 1) {
    newSchema.errors.push({
      location,
      message: 'Cannot combine FK with reusable column reference'
    });
    return null;
  }

  // ============================================================
  // PHASE 2: Extract all modifiers
  // ============================================================
  // Extract explicit tokens with well-defined patterns
  // After this, whatever remains will be the explicit type (if no FK/reusable)

  let notNull = false;
  let isUnique = false;
  let defaultValue: string | undefined;
  let deleteAction: string | undefined;
  let autoCreateParent = false;

  // Extract "not null"
  if (/\bnot\s+null\b/i.test(remaining)) {
    notNull = true;
    remaining = remaining.replace(/\bnot\s+null\b/gi, '').trim();
  }

  // Extract "unique"
  if (/\bunique\b/i.test(remaining)) {
    isUnique = true;
    remaining = remaining.replace(/\bunique\b/gi, '').trim();
  }

  // Extract "primary key" - this will be validated as error for FK
  const hasPrimaryKey = /\bprimary\s+key\b/i.test(remaining);
  if (hasPrimaryKey) {
    remaining = remaining.replace(/\bprimary\s+key\b/gi, '').trim();
  }

  // Extract "delete <action>" (FK-specific)
  const deleteMatch = remaining.match(/\bdelete\s+(cascade|restrict|set\s+null|set\s+default|no\s+action)\b/i);
  if (deleteMatch) {
    deleteAction = deleteMatch[1].toLowerCase().replace(/\s+/g, ' ');
    remaining = remaining.replace(/\bdelete\s+(cascade|restrict|set\s+null|set\s+default|no\s+action)\b/gi, '').trim();
  }

  // Extract "default <value>"
  const defaultMatch = remaining.match(/\bdefault\s+(.+?)(?=\s+\w+\s+|$)/i);
  if (defaultMatch) {
    defaultValue = defaultMatch[1].trim();
    remaining = remaining.replace(/\bdefault\s+.+?(?=\s+\w+\s+|$)/gi, '').trim();
  }

  // Extract "auto create parent" (FK-specific)
  if (/\bauto\s+create\s+parent\b/i.test(remaining)) {
    autoCreateParent = true;
    remaining = remaining.replace(/\bauto\s+create\s+parent\b/gi, '').trim();
  }

  // ============================================================
  // PHASE 3: Type validation
  // ============================================================
  // After extracting FK, reusable, and all modifiers, whatever remains is the explicit type

  let explicitType: string | undefined;

  // If we have FK or reusable, remaining should be empty (no explicit type allowed)
  if (typeSourceCount > 0) {
    if (remaining !== '') {
      newSchema.errors.push({
        location,
        message: `Cannot specify explicit type when using ${fkParentTable ? 'FK' : 'reusable column'}: "${remaining}"`
      });
      return null;
    }
  } else {
    // No FK or reusable - remaining must be the explicit type
    if (remaining === '') {
      newSchema.errors.push({
        location,
        message: 'No type specified - column must have FK(), reusable reference, or SQL type'
      });
      return null;
    }
    explicitType = remaining.trim();
    remaining = ''; // Consumed
  }

  // Determine type source
  let typeSource: 'fk' | 'reusable' | 'explicit';
  if (fkParentTable) {
    typeSource = 'fk';
  } else if (reusableName) {
    typeSource = 'reusable';
  } else {
    typeSource = 'explicit';
  }

  // ============================================================
  // PHASE 4: Validate modifier combinations
  // ============================================================

  // FK cannot have primary key
  if (typeSource === 'fk' && hasPrimaryKey) {
    newSchema.errors.push({
      location,
      message: 'FK columns cannot be primary keys - FK references a primary key, it is not one itself'
    });
    return null;
  }

  // FK-specific modifiers only valid on FK
  if (typeSource !== 'fk') {
    if (deleteAction) {
      newSchema.errors.push({
        location,
        message: 'DELETE action is only valid on FK columns'
      });
      return null;
    }
    if (autoCreateParent) {
      newSchema.errors.push({
        location,
        message: 'AUTO CREATE PARENT is only valid on FK columns'
      });
      return null;
    }
  }

  // ============================================================
  // Return parsed definition
  // ============================================================

  const parsed: ParsedDefinition = {
    typeSource,
    originalDefinition: original
  };

  // Set type source specifics
  if (fkParentTable) {
    parsed.fkParentTable = fkParentTable;
  }
  if (reusableName) {
    parsed.reusableName = reusableName;
  }
  if (explicitType) {
    parsed.explicitType = explicitType;
  }

  // Set modifiers (only if present)
  if (notNull) {
    parsed.notNull = notNull;
  }
  if (isUnique) {
    parsed.isUnique = isUnique;
  }
  if (hasPrimaryKey) {
    parsed.isPrimaryKey = hasPrimaryKey;
  }
  if (defaultValue) {
    parsed.defaultValue = defaultValue;
  }
  if (deleteAction) {
    parsed.deleteAction = deleteAction;
  }
  if (autoCreateParent) {
    parsed.autoCreateParent = autoCreateParent;
  }

  return parsed;
}
