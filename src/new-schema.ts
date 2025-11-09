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
import { parse, astVisitor } from 'pgsql-ast-parser';

export class NewSchema {
  public constants: Record<string, any> = {};
  public reusableColumns: Record<string, any> = {};

  // Imported from ./new-schema-subtypes.ts
  public tables: Record<string, TableDef> = {};

  // Imported from ./new-schema-subtypes.ts
  public errors: SchemaError[] = [];

  // FK edges for cycle detection (childTable, parentTable)
  public fkEdges: Array<[string, string]> = [];

  // Automation edges for cross-table dependencies (parentTable, childTable)
  public automationEdges: Array<[string, string]> = [];

  // Cross-table column dependencies: "table X depends on tableY.columnName"
  public crossTableColumnDeps: Array<{
    dependentTable: string;
    dependentColumn: string;
    referencedTable: string;
    referencedColumn: string;
  }> = [];

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
        // Handle shortcut syntax: "columnName:" with no value
        // YAML parses this as null, we interpret it as "use reusable column with same name"
        if (colDef == null) {
          if (colName in this.reusableColumns) {
            // Create { base: columnName } so downstream code spreads the reusable column
            const normalizedCol = { base: colName };
            this.processColumn(tableName, colName, normalizedCol);
          } else {
            this.errors.push({
              location: `${tableName}.${colName}`,
              message: `Column has no definition and no matching reusable column found`
            });
          }
          continue;
        }

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
    // Parse SQL definition string
    this.parseSQLDefinition(resolvedCol, location);

    // Step 4: Parse automation or formula (both is an error)
    if (resolvedCol.automation && resolvedCol.formula) {
      this.errors.push({
        location,
        message: 'Column cannot have both automation and formula'
      });
      return;
    }

    if (resolvedCol.formula) {
      // Parse formula to extract column dependencies
      const deps = this.parseSQLExpression(resolvedCol.formula, location);
      if (deps) {
        // Store column references for later validation
        if (!this.tables[tableName].columnRefs) {
          this.tables[tableName].columnRefs = [];
        }
        for (const depCol of deps) {
          this.tables[tableName].columnRefs.push({
            sourceColumn: colName,
            referencedColumn: depCol
          });
        }

        // Add edges for topological sort of formula columns
        if (!this.tables[tableName].columnEdges) {
          this.tables[tableName].columnEdges = [];
        }
        for (const depCol of deps) {
          this.tables[tableName].columnEdges.push([colName, depCol]);
        }
      }
    }

    if (resolvedCol.automation) {
      // Parse automation to extract cross-table dependencies
      this.parseAutomation(tableName, colName, resolvedCol, location);
    }

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

  /**
   * Parse SQL definition string and populate column type information
   * Examples: "varchar(100)", "numeric(10,2)", "serial primary key", "integer not null default 0"
   */
  private parseSQLDefinition(col: any, location: string): void {
    let sql = col.definition.trim().replace(/\s+/g, ' ');

    // Handle multi-word types
    if (sql.match(/^double\s+precision/i)) {
      sql = sql.replace(/^double\s+precision/i, 'double_precision');
    }
    if (sql.match(/^character\s+varying/i)) {
      sql = sql.replace(/^character\s+varying/i, 'varchar');
    }

    // Parse SERIAL types (shorthand for integer with sequence)
    const serialMatch = sql.match(/^(big|small)?serial/i);
    if (serialMatch) {
      col.sequence = true;
      if (serialMatch[0].toLowerCase() === 'bigserial') {
        col.type = 'bigint';
      } else if (serialMatch[0].toLowerCase() === 'smallserial') {
        col.type = 'smallint';
      } else {
        col.type = 'integer';
      }
      sql = sql.replace(/^(big|small)?serial/i, '').trim();
    } else {
      // Extract base type and size/precision
      const typeMatch = sql.match(/^(\w+)(?:\((\d+)(?:,\s*(\d+))?\))?/i);
      if (!typeMatch) {
        this.errors.push({
          location,
          message: `Invalid SQL definition: ${col.definition}`
        });
        return;
      }

      col.type = typeMatch[1].toLowerCase();

      if (typeMatch[2]) {
        col.size = parseInt(typeMatch[2], 10);
      }

      if (typeMatch[3]) {
        col.decimal = parseInt(typeMatch[3], 10);
      }

      sql = sql.replace(/^(\w+)(?:\((\d+)(?:,\s*(\d+))?\))?/i, '').trim();
    }

    // Parse modifiers (order-independent)
    if (sql.match(/\bprimary\s+key\b/i)) {
      col.primary_key = true;
      sql = sql.replace(/\bprimary\s+key\b/i, '').trim();
    }

    if (sql.match(/\bunique\b/i)) {
      col.unique = true;
      sql = sql.replace(/\bunique\b/i, '').trim();
    }

    if (sql.match(/\bnot\s+null\b/i)) {
      col.not_null = true;
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

      col.default = defaultValue;
      sql = sql.replace(/\bdefault\s+.+$/i, '').trim();
    }

    // Check for any remaining unrecognized modifiers
    if (sql.length > 0) {
      this.errors.push({
        location,
        message: `Unrecognized SQL modifiers: "${sql}" in definition: ${col.definition}`
      });
    }
  }

  /**
   * Parse SQL expression and extract column dependencies
   * Uses pgsql-ast-parser to validate syntax and extract column references
   * Returns null on error (error already added to errors array)
   */
  private parseSQLExpression(expr: string, location: string): string[] | null {
    try {
      // Wrap in SELECT to parse expression fragment
      const sql = `SELECT ${expr}`;
      const ast = parse(sql);

      const columns = new Set<string>();

      // Walk AST to find column references
      const visitor = astVisitor(() => ({
        ref: (ref) => {
          if (ref.name) {
            columns.add(ref.name);
          }
        }
      }));

      visitor.statement(ast[0]);

      // Filter out '*' which is added by the SELECT wrapper trick
      const columnList = Array.from(columns).filter(c => c !== '*');
      return columnList;
    } catch (error) {
      this.errors.push({
        location,
        message: `Invalid SQL expression: ${error instanceof Error ? error.message : String(error)}`
      });
      return null;
    }
  }

  /**
   * Parse automation string and extract cross-table dependencies
   * Formats:
   *   - SUM/COUNT/MAX/MIN/LAST_VALUE table.column [WHERE ...]
   *   - SUM/COUNT/MAX/MIN(fk_column) table.column [WHERE ...]
   *   - SYNC table.column
   *   - SNAPSHOT table.column
   */
  private parseAutomation(tableName: string, colName: string, col: any, location: string): void {
    const automation = col.automation.trim();

    // Match: OPERATION[(FK_COLUMN)] TABLE.COLUMN [WHERE ...]
    const match = automation.match(/^(SUM|COUNT|MAX|MIN|LAST_VALUE|SYNC|SNAPSHOT)(?:\(([a-z_][a-z0-9_]*)\))?\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)(?:\s+WHERE\s+(.+))?$/i);

    if (!match) {
      this.errors.push({
        location,
        message: `Invalid automation syntax: ${automation}`
      });
      return;
    }

    const operation = match[1].toUpperCase();
    const fkColumn = match[2];  // Optional FK column for multi-FK scenarios
    const sourceTable = match[3];
    const sourceColumn = match[4];
    const whereClause = match[5];

    // Validate source table exists
    if (!(sourceTable in this.tables)) {
      this.errors.push({
        location,
        message: `Automation references non-existent table: ${sourceTable}`
      });
      return;
    }

    // Store automation info on column for later processing
    col.automationType = operation;
    col.automationSourceTable = sourceTable;
    col.automationSourceColumn = sourceColumn;
    if (fkColumn) {
      col.automationFKColumn = fkColumn;
    }

    // Determine parent/child relationship based on operation type
    // SUM/COUNT/MAX/MIN/LAST_VALUE: Parent (tableName) aggregates FROM child (sourceTable)
    // SYNC/SNAPSHOT: Child (tableName) syncs FROM parent (sourceTable)
    let parentTable: string;
    let childTable: string;

    if (operation === 'SYNC' || operation === 'SNAPSHOT') {
      parentTable = sourceTable;
      childTable = tableName;
    } else {
      // Aggregation operations
      parentTable = tableName;
      childTable = sourceTable;
    }

    // Add automation edge (with deduplication)
    const edgeExists = this.automationEdges.some(([parent, child]) =>
      parent === parentTable && child === childTable
    );
    if (!edgeExists) {
      this.automationEdges.push([parentTable, childTable]);
    }

    // Store the automation's source column dependency
    this.crossTableColumnDeps.push({
      dependentTable: tableName,
      dependentColumn: colName,
      referencedTable: sourceTable,
      referencedColumn: sourceColumn
    });

    // Parse WHERE clause if present to extract column dependencies
    if (whereClause) {
      const whereDeps = this.parseSQLWhereClause(whereClause, `${location}.WHERE`);
      if (whereDeps) {
        // Add WHERE clause column dependencies
        for (const depCol of whereDeps) {
          this.crossTableColumnDeps.push({
            dependentTable: tableName,
            dependentColumn: colName,
            referencedTable: sourceTable,
            referencedColumn: depCol
          });
        }
      }
    }
  }

  /**
   * Parse WHERE clause and extract column dependencies
   * Uses pgsql-ast-parser with SELECT * FROM dummy WHERE trick
   */
  private parseSQLWhereClause(whereClause: string, location: string): string[] | null {
    try {
      // Wrap in SELECT to parse WHERE clause fragment
      const sql = `SELECT * FROM dummy WHERE ${whereClause}`;
      const ast = parse(sql);

      const columns = new Set<string>();

      const visitor = astVisitor(() => ({
        ref: (ref) => {
          if (ref.name) {
            columns.add(ref.name);
          }
        }
      }));

      visitor.statement(ast[0]);

      // Filter out 'dummy' (fake table) and '*' (from SELECT)
      const columnList = Array.from(columns).filter(c => c !== 'dummy' && c !== '*');
      return columnList;
    } catch (error) {
      this.errors.push({
        location,
        message: `Invalid WHERE clause: ${error instanceof Error ? error.message : String(error)}`
      });
      return null;
    }
  }
}
