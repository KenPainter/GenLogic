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
import type { SchemaError, TableDef, ForeignKeyDef } from './new-schema-subtypes.js';

export class NewSchema {
  public constants: Record<string, any> = {};
  public reusableColumns: Record<string, any> = {};

  // Imported from ./new-schema-subtypes.ts
  public tables: Record<string, TableDef> = {};

  // Imported from ./new-schema-subtypes.ts
  public errors: SchemaError[] = [];

  // FK edges for cycle detection (childTable, parentTable)
  public fkEdges: Array<[string, string]> = [];

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

  /**
   * Normalize a column definition to object form
   * Converts string definitions to { definition: string }
   */
  private normalizeColumnDef(colDef: any): any {
    if (typeof colDef === 'string') {
      return { definition: colDef };
    }
    return colDef;
  }

  /**
   * Add a reusable column (normalizing it in the process)
   */
  addReusableColumn(name: string, colDef: any): void {
    this.reusableColumns[name] = this.normalizeColumnDef(colDef);
  }

  /**
   * Process all columns in all tables
   * Normalizes column definitions and processes each column
   */
  processColumns(parsedYaml: any): void {
    for (const [tableName, yamlTable] of Object.entries(parsedYaml.tables ?? {})) {
      for (const [colName, colDef] of Object.entries((yamlTable as any).columns ?? {})) {
        // Skip null/undefined column definitions
        if (colDef == null) continue;

        // Normalize and process this column
        const normalizedCol = this.normalizeColumnDef(colDef);
        this.processColumn(tableName, colName, normalizedCol);
      }
    }
  }

  /**
   * Process a single column
   * At this point, column is already normalized to object form
   */
  private processColumn(tableName: string, colName: string, col: any): void {
    const location = `${tableName}.${colName}`;

    // Step 1: Resolve base if present
    let resolvedCol = col;
    if (col.base) {
      const baseName = col.base;
      if (!(baseName in this.reusableColumns)) {
        this.errors.push({
          location,
          message: `Unknown reusable column: ${baseName}`
        });
        return;
      }

      // Spread: base properties first, then local overrides
      const baseCol = this.reusableColumns[baseName];
      const { base, ...localProps } = col;  // Remove 'base' key from spread
      resolvedCol = { ...baseCol, ...localProps };
    }

    // Step 2: Apply constant substitution to all string fields
    const stringFields = ['definition', 'formula', 'automation', 'label', 'comment', 'format'];
    for (const field of stringFields) {
      if (typeof resolvedCol[field] === 'string') {
        resolvedCol[field] = this.replaceConstants(resolvedCol[field], `${location}.${field}`);
      }
    }

    // Step 3: Parse definition string
    if (!resolvedCol.definition) {
      this.errors.push({
        location,
        message: 'Column has no definition'
      });
      return;
    }

    // If this is a foreign key, parse it and replace with parent PK definition
    if (resolvedCol.definition.startsWith('FK ')) {
      this.parseFKDefinition(tableName, colName, resolvedCol, location);
      // parseFKDefinition replaces resolvedCol.definition with parent PK definition
    }

    // Now all columns have regular SQL definitions (either original or from parent PK)
    // TODO: Parse SQL definition string
    // TODO: Step 4: Parse automation or formula (both is an error)
    //    - add local columns from formula to table's list
    //      of internal references (with source, like col1 refs col2),
    //      to validate later that col2 exists
    //    - add edges to this[thistable].columnEdges for formulas
    //       later we'll do a topo sort to caclulate formulas in correct sequence
    //    - add automation dependent columns to this.automationEdges

    // Step 5: Store in this.tables[tableName].columns
    if (!this.tables[tableName].columns) {
      this.tables[tableName].columns = {};
    }
    this.tables[tableName].columns[colName] = resolvedCol;
  }

  /**
   * Parse FK definition: "FK parent_table [not null] [delete <action>] [auto create parent]"
   * Extract modifiers by removing them from the string
   * After removal, what's left should be the parent table name
   *
   * Supported delete actions: cascade, restrict, set null, set default, no action
   */
  private parseFKDefinition(tableName: string, colName: string, col: any, location: string): void {
    let remaining = col.definition.substring(3).trim(); // Remove "FK "

    // Parse modifiers by removing them from the string
    let notNull = false;
    let deleteAction: string | undefined;
    let autoCreateParent = false;

    // Remove "not null" (case insensitive)
    if (/\bnot\s+null\b/i.test(remaining)) {
      notNull = true;
      remaining = remaining.replace(/\bnot\s+null\b/gi, '').trim();
    }

    // Remove "delete <action>" where action can be: cascade, restrict, set null, set default, no action
    const deleteMatch = remaining.match(/\bdelete\s+(cascade|restrict|set\s+null|set\s+default|no\s+action)\b/i);
    if (deleteMatch) {
      deleteAction = deleteMatch[1].toLowerCase().replace(/\s+/g, ' '); // normalize whitespace
      remaining = remaining.replace(/\bdelete\s+(cascade|restrict|set\s+null|set\s+default|no\s+action)\b/gi, '').trim();
    }

    // Remove "auto create parent"
    if (/\bauto\s+create\s+parent\b/i.test(remaining)) {
      autoCreateParent = true;
      remaining = remaining.replace(/\bauto\s+create\s+parent\b/gi, '').trim();
    }

    // After removing all modifiers, what's left should be:
    // A) Single word → parent table name
    // B) Multiple words → ERROR
    // C) Empty → ERROR (must specify parent table)

    if (remaining === '') {
      this.errors.push({
        location,
        message: 'FK definition missing parent table name'
      });
      return;
    }

    if (/\s/.test(remaining)) {
      this.errors.push({
        location,
        message: `Invalid FK definition. After removing modifiers, unrecognized content remains: "${remaining}"`
      });
      return;
    }

    const parentTable = remaining;

    // Validate parent table exists
    if (!(parentTable in this.tables)) {
      this.errors.push({
        location,
        message: `FK references non-existent table: ${parentTable}`
      });
      return;
    }

    // Get parent PK
    const parentPK = this.tables[parentTable].pkColumn;
    const parentPKDef = this.tables[parentTable].pkDefinition;

    if (!parentPK || !parentPKDef) {
      this.errors.push({
        location,
        message: `FK references table ${parentTable} which has no primary key`
      });
      return;
    }

    // Start with parent PK definition (without "primary key")
    let newDefinition = parentPKDef.replace(/\bprimary\s+key\b/gi, '').trim();

    // Add FK constraint keywords if specified
    if (notNull) {
      newDefinition += ' not null';
    }

    // Replace FK definition with parent PK definition
    col.definition = newDefinition;

    // Generate FK constraint name: fk_tablename_columnname
    const fkName = `fk_${tableName}_${colName}`;

    // Store FK at table level
    if (!this.tables[tableName].foreignKeys) {
      this.tables[tableName].foreignKeys = [];
    }

    const fkDef: ForeignKeyDef = {
      name: fkName,
      childColumn: colName,
      parentTable: parentTable,
      parentColumn: parentPK,
      deleteAction: deleteAction,
      autoCreateParent: autoCreateParent
    };

    this.tables[tableName].foreignKeys!.push(fkDef);

    // Add edge for cycle detection (with deduplication)
    const edgeExists = this.fkEdges.some(([child, parent]) =>
      child === tableName && parent === parentTable
    );
    if (!edgeExists) {
      this.fkEdges.push([tableName, parentTable]);
    }
  }
}
