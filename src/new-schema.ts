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
 * ⚠️ CRITICAL: THE STRUCTURE OF THIS CLASS MUST NOT CHANGE! ⚠️
 *
 * This class is used for BOTH the desired schema (built from YAML) AND the live schema
 * (populated from database introspection). The diff engine depends on both schemas having
 * identical structure for apples-to-apples comparison.
 *
 * If you discover limitations or missing fields:
 * 1. Document the limitation in docs/architecture/newschema-limitations.md
 * 2. Find a workaround that doesn't change the structure
 * 3. Only add new optional fields if absolutely necessary
 * 4. NEVER remove or rename existing fields
 * 5. NEVER change the type of existing fields (e.g., array to Record)
 *
 */

// Imported from ./new-schema-subtypes.ts
import type {
  SchemaError,
  TableDef,
  ForeignKeyDef,
  ConstraintDef,
  UniqueConstraintDef,
  IndexDef
} from './new-schema-subtypes.js';
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

  // Table layers for FK dependencies (JSON-dumpable)
  public tableLayers: Record<number, string[]> = {};

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
   * Special case: if string matches a reusable column name, convert to { base: string }
   */
  private normalizeColumnDef(colDef: any): any {
    if (typeof colDef === 'string') {
      // Check if this string matches a reusable column name (old-fashioned syntax)
      // Examples: "amount: amount", "date: date"
      if (colDef in this.reusableColumns) {
        return { base: colDef };
      }
      // Regular SQL definition string
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
        // Edge goes FROM dependency TO formula column (dependency must be calculated first)
        if (!this.tables[tableName].columnEdges) {
          this.tables[tableName].columnEdges = [];
        }
        for (const depCol of deps) {
          this.tables[tableName].columnEdges.push([depCol, colName]);
        }
      }

      // FORMULA COLUMN VALIDATION:
      // Formula columns calculate their value from other columns - they should never have defaults.
      // A default on a calculated column is nonsensical (what would it mean?).
      if (resolvedCol.defaultValue !== undefined) {
        this.errors.push({
          location,
          message: `Formula columns cannot have defaults - the value is calculated from other columns. ` +
                   `Remove the 'default' specification.`
        });
      }
    }

    if (resolvedCol.automation) {
      // Parse automation to extract cross-table dependencies
      this.parseAutomation(tableName, colName, resolvedCol, location);

      // AUTOMATION DEFAULT HANDLING:
      // Aggregate columns need sensible defaults for initial state before any data exists.
      // We auto-apply defaults here (schema-level) rather than in DDL generation (dumb layer).

      // Validation: User should NOT specify defaults on automations
      if (resolvedCol.defaultValue !== undefined) {
        this.errors.push({
          location,
          message: `Automation columns cannot have user-specified defaults. ` +
                   `Remove 'default' - the system will set appropriate defaults based on automation type.`
        });
      }

      // Validation: SUM/COUNT must be on numeric types
      if (resolvedCol.automationType === 'SUM' || resolvedCol.automationType === 'COUNT') {
        const numericTypes = ['integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real', 'double precision'];
        if (!numericTypes.includes(resolvedCol.type)) {
          this.errors.push({
            location,
            message: `${resolvedCol.automationType} automation requires a numeric type, got: ${resolvedCol.type}`
          });
        }

        // Auto-apply: SUM/COUNT get default 0 (prevents NULL on empty aggregations)
        resolvedCol.defaultValue = '0';

        // Rebuild normalizedDef to include the default we just added
        resolvedCol.normalizedDef = this.rebuildDefinitionString(resolvedCol);
      }

      // MIN/MAX/LAST_VALUE: No default (NULL until first value exists)
      // This is the natural/correct behavior, so we don't set anything
    }

    // Step 5: Store in this.tables[tableName].columns
    if (!this.tables[tableName].columns) {
      this.tables[tableName].columns = {};
    }
    this.tables[tableName].columns[colName] = resolvedCol;

    // Step 6: Add NaN/Infinity protection constraint for floating-point numeric types
    // INTEGRITY: NaN and Infinity are NEVER valid in business applications
    if (this.isFloatingPointNumeric(resolvedCol.type)) {
      this.addNaNProtectionConstraint(tableName, colName);
    }

    // Step 7: Add UNIQUE constraint if column has unique modifier
    if (resolvedCol.isUnique) {
      this.addUniqueConstraintForColumn(tableName, colName);
    }

    // Check for unknown column keys
    const knownColumnKeys = [
      // User-provided
      'definition', 'base', 'label', 'comment', 'format', 'formula', 'automation',
      // PostgreSQL-aligned properties
      'type', 'character_maximum_length', 'numeric_precision', 'numeric_scale',
      'nullable', 'isPrimaryKey', 'isUnique', 'defaultValue', 'serial',
      // GenLogic automation properties
      'automationType', 'automationSourceTable', 'automationSourceColumn', 'automationFKColumn',
      // GenLogic FK properties (for FK columns)
      'fkParentTable', 'fkParentColumn', 'fkDeleteAction', 'fkAutoCreateParent',
      // Normalized comparison string
      'normalizedDef'
    ];
    for (const key of Object.keys(resolvedCol)) {
      if (!knownColumnKeys.includes(key)) {
        this.errors.push({
          location,
          message: `Unknown column property: ${key}`
        });
      }
    }
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

    // Extract "default <value>" modifier
    let defaultValue: string | undefined;
    const defaultMatch = remaining.match(/\bdefault\s+(.+?)(?=\s+\w+\s+|$)/i);
    if (defaultMatch) {
      defaultValue = defaultMatch[1].trim();
      // Replace constants in default value
      defaultValue = this.replaceConstants(defaultValue, location);
      remaining = remaining.replace(/\bdefault\s+.+?(?=\s+\w+\s+|$)/gi, '').trim();
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
    // Replace constants in parent PK definition before using it
    let newDefinition = this.replaceConstants(parentPKDef, location);
    newDefinition = newDefinition.replace(/\bprimary\s+key\b/gi, '').trim();

    // CRITICAL: Replace 'serial' with 'integer' - FK columns don't auto-increment
    // Parent PK may be "serial" but child FK is just a regular integer reference
    newDefinition = newDefinition.replace(/\bserial\b/gi, 'integer');

    // Add FK constraint keywords if specified
    if (notNull) {
      newDefinition += ' not null';
    }
    // Only add default if it's not already in the parent definition
    if (defaultValue && !/\bdefault\b/i.test(newDefinition)) {
      newDefinition += ` default ${defaultValue}`;
    }

    // Replace FK definition with parent PK definition
    col.definition = newDefinition;

    // Generate FK constraint name: fk_tablename_columnname
    const fkName = `fk_${tableName}_${colName}`;

    // Store FK at table level (keyed by FK name)
    if (!this.tables[tableName].foreignKeys) {
      this.tables[tableName].foreignKeys = {};
    }

    const fkDef: ForeignKeyDef = {
      name: fkName,
      childColumn: colName,
      parentTable: parentTable,
      parentColumn: parentPK,
      deleteAction: deleteAction || 'restrict',  // Default to 'restrict' (PostgreSQL's implicit default)
      autoCreateParent: autoCreateParent
    };

    this.tables[tableName].foreignKeys![fkName] = fkDef;

    // Add index for FK column (PostgreSQL doesn't auto-index FK columns)
    this.addIndexForColumn(tableName, colName, 'fk');

    // Add edge for cycle detection (topologicalSortByLayers deduplicates for us)
    this.fkEdges.push([tableName, parentTable]);
  }

  /**
   * Parse SQL definition string and populate column type information
   * Examples: "varchar(100)", "numeric(10,2)", "serial primary key", "integer not null default 0"
   */
  private parseSQLDefinition(col: any, location: string): void {
    let sql = col.definition.trim().replace(/\s+/g, ' ');

    // Handle multi-word types - normalize to what PostgreSQL uses
    if (sql.match(/^double\s+precision/i)) {
      sql = sql.replace(/^double\s+precision/i, 'double_precision');
    }
    // Normalize varchar to character varying to match PostgreSQL's information_schema
    if (sql.match(/^varchar/i)) {
      sql = sql.replace(/^varchar/i, 'character varying');
    } else if (sql.match(/^character\s+varying/i)) {
      // Already in PostgreSQL format, just collapse whitespace
      sql = sql.replace(/^character\s+varying/i, 'character varying');
    }

    // Parse SERIAL types (shorthand for integer with auto-increment)
    const serialMatch = sql.match(/^(big|small)?serial/i);
    if (serialMatch) {
      col.serial = true;
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
      // Handle multi-word types first (character varying, double precision)
      let typeMatch;
      if (sql.match(/^character varying/i)) {
        typeMatch = sql.match(/^(character varying)(?:\((\d+)(?:,\s*(\d+))?\))?/i);
      } else if (sql.match(/^double_precision/i)) {
        typeMatch = sql.match(/^(double_precision)(?:\((\d+)(?:,\s*(\d+))?\))?/i);
      } else {
        typeMatch = sql.match(/^(\w+)(?:\((\d+)(?:,\s*(\d+))?\))?/i);
      }

      if (!typeMatch) {
        this.errors.push({
          location,
          message: `Invalid SQL definition: ${col.definition}`
        });
        return;
      }

      col.type = typeMatch[1].toLowerCase();

      // Map size/precision to PostgreSQL-aligned property names
      if (typeMatch[2]) {
        // For character types, use character_maximum_length
        if (col.type.includes('char') || col.type === 'text') {
          col.character_maximum_length = parseInt(typeMatch[2], 10);
        } else {
          // For numeric types, use numeric_precision
          col.numeric_precision = parseInt(typeMatch[2], 10);
        }
      }

      if (typeMatch[3]) {
        col.numeric_scale = parseInt(typeMatch[3], 10);
      }

      // Remove the matched type (including size/precision) from sql
      sql = sql.substring(typeMatch[0].length).trim();
    }

    // Normalize integer types: add precision if not specified
    if (['integer', 'int', 'int4'].includes(col.type) && !col.numeric_precision) {
      col.numeric_precision = 32;
      col.numeric_scale = 0;
    }

    // Parse modifiers (order-independent)
    if (sql.match(/\bprimary\s+key\b/i)) {
      col.isPrimaryKey = true;
      // PRIMARY KEY columns are unconditionally NOT NULL
      col.nullable = false;
      sql = sql.replace(/\bprimary\s+key\b/i, '').trim();
    }

    if (sql.match(/\bunique\b/i)) {
      col.isUnique = true;
      sql = sql.replace(/\bunique\b/i, '').trim();
    }

    if (sql.match(/\bnot\s+null\b/i)) {
      col.nullable = false;
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

      col.defaultValue = defaultValue;
      sql = sql.replace(/\bdefault\s+.+$/i, '').trim();
    }

    // Check for any remaining unrecognized modifiers
    if (sql.length > 0) {
      this.errors.push({
        location,
        message: `Unrecognized SQL modifiers: "${sql}" in definition: ${col.definition}`
      });
    }

    // Normalize: PK columns are always NOT NULL
    if (col.isPrimaryKey) {
      col.nullable = false;
    }

    // Build normalized comparison string in PostgreSQL's canonical order
    // This is SEPARATE from the user's original definition string
    col.normalizedDef = this.rebuildDefinitionString(col);
  }

  /**
   * Rebuild definition string from parsed properties in PostgreSQL's canonical order
   * Format: type(size,decimal) [not null] [default value] [primary key]
   * PUBLIC so database.ts can use the same logic for live schema normalization
   */
  public rebuildDefinitionString(col: any): string {
    // Use 'serial' for serial columns, otherwise use the base type
    let def = col.serial ? 'serial' : col.type;

    // Add size/precision (but NOT for serial - serial doesn't have size notation)
    if (!col.serial) {
      // For character types
      if (col.character_maximum_length !== undefined) {
        def += `(${col.character_maximum_length})`;
      }
      // For numeric types
      else if (col.numeric_precision !== undefined) {
        if (col.numeric_scale !== undefined) {
          def += `(${col.numeric_precision},${col.numeric_scale})`;
        } else {
          def += `(${col.numeric_precision})`;
        }
      }
    }

    // Add NOT NULL (nullable: false means NOT NULL)
    if (col.nullable === false) {
      def += ' not null';
    }

    // Add DEFAULT (but NOT for serial - the nextval is implicit)
    if (!col.serial && col.defaultValue !== undefined) {
      def += ` default ${col.defaultValue}`;
    }

    // Add PRIMARY KEY
    if (col.isPrimaryKey) {
      def += ' primary key';
    }

    return def;
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
    if (whereClause) {
      col.automationWhereClause = whereClause;
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

    // Add automation edge (topologicalSortByLayers deduplicates for us)
    this.automationEdges.push([parentTable, childTable]);

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

  /**
   * Process table-level properties: comment, seed-rows, constraints, unique-constraints, indexes
   * Now that columns are processed, we can validate column references
   */
  processTableProperties(parsedYaml: any): void {
    for (const [tableName, yamlTable] of Object.entries(parsedYaml.tables ?? {})) {
      const table = yamlTable as any;
      const tableColumns = this.tables[tableName].columns || {};

      // Check for unknown table keys
      const knownTableKeys = ['columns', 'comment', 'seed-rows', 'constraints', 'unique-constraints', 'indexes', 'singleton'];
      for (const key of Object.keys(table)) {
        if (!knownTableKeys.includes(key)) {
          this.errors.push({
            location: tableName,
            message: `Unknown table property: ${key}`
          });
        }
      }

      // Copy comment
      if (table.comment) {
        this.tables[tableName].comment = table.comment;
      }

      // Process seed-rows
      if (table['seed-rows'] && Array.isArray(table['seed-rows'])) {
        this.tables[tableName].seedRows = table['seed-rows'];

        // Validate: all column names in seed rows exist
        for (let i = 0; i < table['seed-rows'].length; i++) {
          const row = table['seed-rows'][i];
          for (const colName of Object.keys(row)) {
            if (!(colName in tableColumns)) {
              this.errors.push({
                location: `${tableName}.seed-rows[${i}]`,
                message: `Seed row references non-existent column: ${colName}`
              });
            }
          }
        }
      }

      // Process constraints (CHECK constraints)
      if (table.constraints && Array.isArray(table.constraints)) {
        this.tables[tableName].constraints = {};

        // Generate names and validate
        for (let i = 0; i < table.constraints.length; i++) {
          const location = `${tableName}.constraints[${i}]`;
          const expression = this.replaceConstants(table.constraints[i], location);

          // Generate constraint name: check_tablename_1, check_tablename_2, etc.
          const constraintName = `check_${tableName}_${i + 1}`;
          const constraintDef: ConstraintDef = {
            name: constraintName,
            expression: expression,
            constraint_definition: `CHECK ((${expression}))`  // PostgreSQL canonical format (always double parens)
          };

          this.tables[tableName].constraints![constraintName] = constraintDef;

          // Parse as WHERE clause to extract column references
          const deps = this.parseSQLWhereClause(expression, location);
          if (deps) {
            for (const colName of deps) {
              if (!(colName in tableColumns)) {
                this.errors.push({
                  location,
                  message: `Constraint references non-existent column: ${colName}`
                });
              }
            }
          }
        }
      }

      // Process unique-constraints
      if (table['unique-constraints'] && Array.isArray(table['unique-constraints'])) {
        this.tables[tableName].uniqueConstraints = {};

        // Generate names and validate
        for (let i = 0; i < table['unique-constraints'].length; i++) {
          const uniqueCols:any = table['unique-constraints'][i];
          const location = `${tableName}.unique-constraints[${i}]`;

          if (!Array.isArray(uniqueCols)) {
            this.errors.push({
              location,
              message: `Unique constraint must be an array of column names`
            });
            continue;
          }

          // Generate unique constraint name: unique_tablename_col1_col2
          const uniqueName = `unique_${tableName}_${uniqueCols.join('_')}`;
          const uniqueDef: UniqueConstraintDef = {
            name: uniqueName,
            columns: uniqueCols
          };

          this.tables[tableName].uniqueConstraints![uniqueName] = uniqueDef;

          // Validate column names exist
          for (const colName of uniqueCols) {
            if (!(colName in tableColumns)) {
              this.errors.push({
                location,
                message: `Unique constraint references non-existent column: ${colName}`
              });
            }
          }
        }
      }

      // Process indexes
      if (table.indexes && Array.isArray(table.indexes)) {
        // Initialize indexes Record if needed (preserve any FK indexes already added)
        if (!this.tables[tableName].indexes) {
          this.tables[tableName].indexes = {};
        }

        // Generate names and validate
        for (let i = 0; i < table.indexes.length; i++) {
          const indexCols = table.indexes[i];
          const location = `${tableName}.indexes[${i}]`;

          if (!Array.isArray(indexCols)) {
            this.errors.push({
              location,
              message: `Index must be an array of column names`
            });
            continue;
          }

          // Generate index name: idx_tablename_col1_col2
          const indexName = `idx_${tableName}_${indexCols.join('_')}`;
          const indexDef: IndexDef = {
            name: indexName,
            columns: indexCols
          };

          this.tables[tableName].indexes![indexName] = indexDef;

          // Validate column names exist
          for (const colName of indexCols) {
            if (!(colName in tableColumns)) {
              this.errors.push({
                location,
                message: `Index references non-existent column: ${colName}`
              });
            }
          }
        }
      }
    }
  }

  /**
   * Apply table layers from topological sort result
   * Fills in any missing tables into layer 0
   * Returns JSON-dumpable Record instead of Map
   */
  applyTableLayers(layers: Map<number, string[]>): Record<number, string[]> {
    const result: Record<number, string[]> = {};
    const handledTables = new Set<string>();

    // Copy layers from Map to Record and track which tables we've seen
    for (const [layerNum, tableNames] of layers) {
      result[layerNum] = tableNames;
      for (const tableName of tableNames) {
        handledTables.add(tableName);
        // Store layer number on table for inspection
        if (this.tables[tableName]) {
          this.tables[tableName].layer = layerNum;
        }
      }
    }

    // Find unhandled tables and add them to layer 0
    const unhandledTables: string[] = [];
    for (const tableName of Object.keys(this.tables)) {
      if (!handledTables.has(tableName)) {
        unhandledTables.push(tableName);
        this.tables[tableName].layer = 0;
      }
    }

    // Add unhandled tables to layer 0
    if (unhandledTables.length > 0) {
      if (result[0]) {
        result[0] = [...result[0], ...unhandledTables].sort();
      } else {
        result[0] = unhandledTables.sort();
      }
    }

    return result;
  }

  /**
   * Apply column layers from topological sort result to a specific table
   * Note: Only formula columns will appear in the edges/layers
   * Non-formula columns don't need layers (no calculation order needed)
   * Stores result in table.columnLayers as JSON-dumpable Record
   */
  applyColumnLayers(tableName: string, layers: Map<number, string[]>): void {
    const tableDef = this.tables[tableName];
    if (!tableDef) return;

    const result: Record<number, string[]> = {};

    // Copy layers from Map to Record, filtering to only formula columns
    for (const [layerNum, columnNames] of layers) {
      const formulaColumns = columnNames.filter(colName => {
        const col = tableDef.columns?.[colName];
        return col && col.formula;
      });

      if (formulaColumns.length > 0) {
        result[layerNum] = formulaColumns;
      }
    }

    // Store in table (only if there are layers)
    if (Object.keys(result).length > 0) {
      tableDef.columnLayers = result;
    }
  }

  /**
   * Check if a type is a floating-point numeric type that can have NaN/Infinity
   * Integer types (integer, bigint, smallint) cannot have NaN/Infinity
   */
  private isFloatingPointNumeric(type: string): boolean {
    const baseType = type.toLowerCase().split('(')[0];
    const floatingPointTypes = ['numeric', 'decimal', 'real', 'double precision', 'double_precision', 'float'];
    return floatingPointTypes.includes(baseType);
  }

  /**
   * Add NaN/Infinity protection constraint for a numeric column
   * Uses PostgreSQL's exact format to match what pg_get_constraintdef() returns
   */
  private addNaNProtectionConstraint(tableName: string, colName: string): void {
    // Initialize constraints Record if needed
    if (!this.tables[tableName].constraints) {
      this.tables[tableName].constraints = {};
    }

    // Generate constraint name matching PostgreSQL's auto-generated pattern
    const constraintName = `${tableName}_${colName}_check`;

    // Use PostgreSQL's exact format: <> ALL (ARRAY[...])
    // This matches what pg_get_constraintdef() returns, avoiding spurious diffs
    const expression = `((${colName} IS NULL) OR ((${colName})::text <> ALL (ARRAY['NaN'::text, 'Infinity'::text, '-Infinity'::text])))`;

    this.tables[tableName].constraints[constraintName] = {
      name: constraintName,
      expression: expression,
      constraint_definition: `CHECK (${expression})`
    };
  }

  /**
   * Add UNIQUE constraint for a column marked with unique modifier
   * Uses PostgreSQL's naming pattern: {tablename}_{columnname}_key
   */
  private addUniqueConstraintForColumn(tableName: string, colName: string): void {
    // Initialize uniqueConstraints Record if needed
    if (!this.tables[tableName].uniqueConstraints) {
      this.tables[tableName].uniqueConstraints = {};
    }

    // Generate constraint name matching PostgreSQL's auto-generated pattern
    const constraintName = `${tableName}_${colName}_key`;

    this.tables[tableName].uniqueConstraints[constraintName] = {
      name: constraintName,
      columns: [colName]
    };
  }

  /**
   * Add index for a FK column
   * PostgreSQL doesn't auto-index FK columns, so we create them explicitly
   * Uses naming pattern: idx_{tablename}_{columnname}
   */
  private addIndexForColumn(tableName: string, colName: string, type: 'fk'): void {
    // Initialize indexes Record if needed
    if (!this.tables[tableName].indexes) {
      this.tables[tableName].indexes = {};
    }

    // Generate index name for FK
    const indexName = `idx_${tableName}_${colName}`;

    this.tables[tableName].indexes[indexName] = {
      name: indexName,
      columns: [colName]
    };
  }
}
