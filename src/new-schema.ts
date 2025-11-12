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
import { parseDefinition } from './helpers-processor/definition-parser.js';
import { parseSQLType } from './helpers-processor/sql-type-parser.js';

/**
 * Valid PostgreSQL base types
 * Reference: https://www.postgresql.org/docs/current/datatype.html
 */
const VALID_POSTGRES_TYPES = new Set([
  // Numeric types
  'smallint', 'integer', 'bigint', 'int', 'int2', 'int4', 'int8',
  'decimal', 'numeric', 'real', 'double precision', 'double_precision',
  'smallserial', 'serial', 'bigserial',
  'money',

  // Character types
  'character varying', 'varchar', 'character', 'char', 'text',

  // Binary types
  'bytea',

  // Date/time types
  'timestamp', 'timestamp without time zone', 'timestamp with time zone',
  'timestamptz', 'date', 'time', 'time without time zone',
  'time with time zone', 'timetz', 'interval',

  // Boolean
  'boolean', 'bool',

  // Geometric types
  'point', 'line', 'lseg', 'box', 'path', 'polygon', 'circle',

  // Network types
  'cidr', 'inet', 'macaddr', 'macaddr8',

  // Bit string types
  'bit', 'bit varying', 'varbit',

  // Text search types
  'tsvector', 'tsquery',

  // UUID
  'uuid',

  // XML
  'xml',

  // JSON
  'json', 'jsonb',

  // Arrays (base type, array notation handled separately)
  'array',

  // Range types
  'int4range', 'int8range', 'numrange', 'tsrange', 'tstzrange', 'daterange',

  // Domain types and other
  'oid', 'regproc', 'regprocedure', 'regoper', 'regoperator',
  'regclass', 'regtype', 'regrole', 'regnamespace', 'regconfig', 'regdictionary'
]);

export class NewSchema {
  public constants: Record<string, any> = {};
  public reusableColumns: Record<string, any> = {};

  // Imported from ./new-schema-subtypes.ts
  public tables: Record<string, TableDef> = {};

  // Imported from ./new-schema-subtypes.ts
  public errors: SchemaError[] = [];

  // FK edges for cycle detection (childTable, parentTable)
  public fkEdges: Array<[string, string]> = [];

  // Unified column dependency edges for cycle detection and layer assignment
  // Includes both automation and formula dependencies (table.column -> table.column)
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
   * Returns null if errors were encountered (after logging them)
   */
  replaceConstants(str: string, location: string): string | null {
    // Safety: prevent infinite loops
    let iterations = 0;
    const maxIterations = 10;
    let hasError = false;

    let result = str;
    while (result.includes('${') && iterations < maxIterations) {
      const before = result;
      result = result.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (match, name) => {
        if (!(name in this.constants)) {
          this.errors.push({
            location,
            message: `Undefined constant: ${name}`
          });
          hasError = true;
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
      hasError = true;
    }

    if (hasError) {
      return null;
    }

    return result;
  }

  /**
   * Normalize a column definition to object form
   * Converts string definitions to { definition: string }
   * The definition parser will handle FK(), reusable references, and SQL types
   */
  private normalizeColumnDef(colDef: any): any {
    if (typeof colDef === 'string') {
      // String can be: reusable column name, FK reference, or SQL type
      // All are stored in definition property and parsed by definition-parser
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
            // Create { definition: columnName } so parser expands the reusable column
            const normalizedCol = { definition: colName };
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

    // Step 1: Validate column has definition
    if (!col.definition) {
      this.errors.push({
        location,
        message: 'Column has no definition'
      });
      return;
    }

    // Step 2: Apply constant substitution to definition string BEFORE parsing
    const replacedDefinition = this.replaceConstants(col.definition, location);
    if (!replacedDefinition) {
      return; // Error already logged (undefined constant or circular reference)
    }
    col.definition = replacedDefinition;

    // Step 3: Parse definition string with unified parser
    const parsed = parseDefinition(this, location, col.definition, this.reusableColumns);
    if (!parsed) {
      return; // Errors already logged
    }

    // Step 4: Resolve type based on type source
    let finalTypeString: string;

    if (parsed.typeSource === 'fk') {
      // Get parent table PK definition
      const parentTable = this.tables[parsed.fkParentTable!];
      const parentPKDef = parentTable.pkDefinition;

      // Validate parent has PK
      if (!parentPKDef || !parentTable.pkColumn) {
        this.errors.push({
          location,
          message: `FK references table ${parsed.fkParentTable} which has no primary key`
        });
        return;
      }

      // Replace serial with integer (FK columns don't auto-increment)
      // Remove primary key modifier
      finalTypeString = parentPKDef
        .replace(/\bserial\b/gi, 'integer')
        .replace(/\bprimary\s+key\b/gi, '')
        .trim();

      // Store FK metadata
      const fkName = `fk_${tableName}_${colName}`;
      if (!this.tables[tableName].foreignKeys) {
        this.tables[tableName].foreignKeys = {};
      }
      this.tables[tableName].foreignKeys[fkName] = {
        name: fkName,
        childColumn: colName,
        parentTable: parsed.fkParentTable!,
        parentColumn: parentTable.pkColumn,
        deleteAction: parsed.deleteAction || 'restrict',
        autoCreateParent: parsed.autoCreateParent || false
      };

      // Add FK index (PostgreSQL doesn't auto-index FK columns)
      this.addIndexForColumn(tableName, colName, 'fk');

      // Add FK edge for cycle detection
      this.fkEdges.push([parsed.fkParentTable!, tableName]);

    } else {
      // Use explicit type (which may have been expanded from reusable in parser)
      finalTypeString = parsed.explicitType!;
    }

    // Step 5: Parse SQL type to extract PostgreSQL metadata
    const typeInfo = parseSQLType(this, location, finalTypeString);
    if (!typeInfo) {
      return; // Errors already logged
    }

    // Step 6: Apply type info and modifiers to column object
    col.type = typeInfo.type;
    col.serial = typeInfo.serial;
    col.character_maximum_length = typeInfo.character_maximum_length;
    col.numeric_precision = typeInfo.numeric_precision;
    col.numeric_scale = typeInfo.numeric_scale;

    // Apply modifiers from parsed definition
    col.nullable = !parsed.notNull;
    col.isUnique = parsed.isUnique || false;
    col.isPrimaryKey = parsed.isPrimaryKey || false;

    // Apply default value (with constant substitution)
    if (parsed.defaultValue) {
      col.defaultValue = this.replaceConstants(parsed.defaultValue, location);
    }

    // Normalize: PK columns are always NOT NULL
    if (col.isPrimaryKey) {
      col.nullable = false;
    }

    // Build normalized comparison string
    col.normalizedDef = this.rebuildDefinitionString(col);

    // Step 7: Apply constant substitution to formula/automation/comment
    const otherStringFields = ['formula', 'automation', 'comment'];
    for (const field of otherStringFields) {
      if (typeof col[field] === 'string') {
        col[field] = this.replaceConstants(col[field], `${location}.${field}`);
      }
    }

    // Step 8: Parse automation or formula (both is an error)
    if (col.automation && col.formula) {
      this.errors.push({
        location,
        message: 'Column cannot have both automation and formula'
      });
      return;
    }

    if (col.formula) {
      // Parse formula to extract column dependencies
      const deps = this.parseSQLExpression(col.formula, location);
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

        // Add edges for unified cycle detection and layer assignment
        // Edge goes FROM dependency TO formula column (dependency must be calculated first)
        for (const depCol of deps) {
          this.automationEdges.push([`${tableName}.${depCol}`, `${tableName}.${colName}`]);
        }
      }

      // FORMULA COLUMN VALIDATION:
      // Formula columns calculate their value from other columns - they should never have defaults.
      // A default on a calculated column is nonsensical (what would it mean?).
      if (col.defaultValue !== undefined) {
        this.errors.push({
          location,
          message: `Formula columns cannot have defaults - the value is calculated from other columns. ` +
                   `Remove the 'default' specification.`
        });
      }
    }

    if (col.automation) {
      // Parse automation to extract cross-table dependencies
      this.parseAutomation(tableName, colName, col, location);

      // AUTOMATION DEFAULT HANDLING:
      // Aggregate columns need sensible defaults for initial state before any data exists.
      // We auto-apply defaults here (schema-level) rather than in DDL generation (dumb layer).

      // Validation: User should NOT specify defaults on automations
      if (col.defaultValue !== undefined) {
        this.errors.push({
          location,
          message: `Automation columns cannot have user-specified defaults. ` +
                   `Remove 'default' - the system will set appropriate defaults based on automation type.`
        });
      }

      // Validation: SUM/COUNT must be on numeric types
      if (col.automationType === 'SUM' || col.automationType === 'COUNT') {
        const numericTypes = ['integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real', 'double precision'];
        if (!numericTypes.includes(col.type)) {
          this.errors.push({
            location,
            message: `${col.automationType} automation requires a numeric type, got: ${col.type}`
          });
        }

        // Auto-apply: SUM/COUNT get default 0 (prevents NULL on empty aggregations)
        col.defaultValue = '0';

        // Rebuild normalizedDef to include the default we just added
        col.normalizedDef = this.rebuildDefinitionString(col);
      }

      // MIN/MAX/LAST_VALUE: No default (NULL until first value exists)
      // This is the natural/correct behavior, so we don't set anything
    }

    // Step 9: Store in this.tables[tableName].columns
    if (!this.tables[tableName].columns) {
      this.tables[tableName].columns = {};
    }
    this.tables[tableName].columns[colName] = col;

    // Step 10: Add NaN/Infinity protection constraint for floating-point numeric types
    // INTEGRITY: NaN and Infinity are NEVER valid in business applications
    if (this.isFloatingPointNumeric(col.type)) {
      this.addNaNProtectionConstraint(tableName, colName);
    }

    // Step 11: Add UNIQUE constraint if column has unique modifier
    if (col.isUnique) {
      this.addUniqueConstraintForColumn(tableName, colName);
    }

    // Check for unknown column keys
    const knownColumnKeys = [
      // User-provided
      'definition', 'formula', 'automation',
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
    const userColumnKeys = ['definition', 'formula', 'automation'];
    for (const key of Object.keys(col)) {
      if (!knownColumnKeys.includes(key)) {
        this.errors.push({
          location,
          message: `Unknown column property: ${key}, valid keys: ${userColumnKeys.join(', ')}`
        });
      }
    }
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
      } else if (sql.match(/^double\s+precision/i)) {
        typeMatch = sql.match(/^(double\s+precision)(?:\((\d+)(?:,\s*(\d+))?\))?/i);
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

      // Normalize type aliases to canonical names for storage
      // This ensures decimal and numeric are treated identically
      col.type = this.normalizePostgresType(col.type);

      // Validate that the type is a known PostgreSQL type
      if (!VALID_POSTGRES_TYPES.has(col.type)) {
        this.errors.push({
          location,
          message: `Invalid SQL definition: ${col.definition}`
        });
        return;
      }

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

    // Default nullable to true if not explicitly set
    // This ensures consistency with live schema from PostgreSQL which always has explicit nullable
    if (col.nullable === undefined) {
      col.nullable = true;
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
  /**
   * Normalize PostgreSQL type aliases to their canonical names
   * This ensures that int, int4, and integer are all treated as equivalent
   */
  private normalizePostgresType(typeName: string): string {
    const typeMap: Record<string, string> = {
      'int': 'integer',
      'int4': 'integer',
      'int2': 'smallint',
      'int8': 'bigint',
      'float8': 'double precision',
      'float4': 'real',
      'bool': 'boolean',
      'varchar': 'character varying',
      'char': 'character',
      'decimal': 'numeric',
      'double_precision': 'double precision'
    };

    return typeMap[typeName.toLowerCase()] || typeName;
  }

  public rebuildDefinitionString(col: any): string {
    // Normalize type aliases to canonical names for consistent comparison
    const normalizedType = col.serial ? 'serial' : this.normalizePostgresType(col.type);

    // Build the type string (type + size/precision) using normalized type
    let def = normalizedType;

    // Add size/precision (but NOT for serial - serial doesn't have size notation)
    if (!col.serial) {
      // For character types
      if (col.character_maximum_length !== undefined) {
        def += `(${col.character_maximum_length})`;
      }
      // For numeric/decimal types that support precision/scale
      // NOTE: PostgreSQL integer types (smallint, integer, bigint, int, int2, int4, int8)
      // do NOT support precision/scale syntax
      else if (col.numeric_precision !== undefined) {
        const typesWithPrecision = ['numeric', 'decimal', 'real', 'double precision'];
        // Use normalized type for the check
        if (typesWithPrecision.includes(normalizedType)) {
          if (col.numeric_scale !== undefined) {
            def += `(${col.numeric_precision},${col.numeric_scale})`;
          } else {
            def += `(${col.numeric_precision})`;
          }
        }
      }
    }

    // Add NOT NULL (nullable: false means NOT NULL)
    if (col.nullable === false) {
      def += ' not null';
    }

    // Add DEFAULT (but NOT for serial - the nextval is implicit)
    if (!col.serial && col.defaultValue !== undefined) {
      // Format default value - add quotes for string types
      const stringTypes = [
        'character varying', 'varchar', 'character', 'char', 'text',
        'date', 'timestamp', 'timestamp without time zone', 'timestamp with time zone',
        'timestamptz', 'time', 'time without time zone', 'time with time zone', 'timetz',
        'interval', 'uuid', 'json', 'jsonb', 'xml'
      ];
      const formattedDefault = stringTypes.includes(normalizedType)
        ? `'${col.defaultValue}'`
        : col.defaultValue;
      def += ` default ${formattedDefault}`;
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
    // Check for subqueries - look for SELECT statement pattern
    // This matches SELECT...FROM pattern which indicates a subquery
    // We need to be careful not to match EXTRACT(field FROM column) which is valid
    const hasSelectFrom = /\bSELECT\b.*\bFROM\b/is.test(expr);

    if (hasSelectFrom) {
      this.errors.push({
        location,
        message: `Formula columns cannot contain subqueries. Use SYNC automation to pull values from parent tables`
      });
      return null;
    }

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
        message: `Invalid SQL expression`
      });
      return null;
    }
  }

  /**
   * Parse automation string and extract cross-table dependencies
   * Formats:
   *   - SUM/COUNT/MAX/MIN/LAST_VALUE table.column
   *   - SUM/COUNT/MAX/MIN(fk_column) table.column
   *   - SYNC table.column
   *   - SNAPSHOT table.column
   */
  private parseAutomation(tableName: string, colName: string, col: any, location: string): void {
    const automation = col.automation.trim();

    // Match: OPERATION[(FK_COLUMN)] TABLE.COLUMN
    const match = automation.match(/^(SUM|COUNT|MAX|MIN|LAST_VALUE|SYNC|SNAPSHOT)(?:\(([a-z_][a-z0-9_]*)\))?\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)$/i);

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

    // Add automation edge: referenced column (layer N) -> dependent column (layer N+1)
    this.automationEdges.push([`${sourceTable}.${sourceColumn}`, `${tableName}.${colName}`]);

    // For SYNC/SNAPSHOT: Add dependency on FK column so it's calculated before the pull
    if (operation === 'SYNC' || operation === 'SNAPSHOT') {
      let fkColumnName: string | undefined;

      // Use explicit FK column if specified
      if (fkColumn) {
        fkColumnName = fkColumn;
      } else {
        // Search for FK that references sourceTable
        const table = this.tables[tableName];
        if (table?.foreignKeys) {
          for (const fk of Object.values(table.foreignKeys)) {
            if (fk.parentTable === sourceTable) {
              fkColumnName = fk.childColumn;
              break;
            }
          }
        }
      }

      // Add edge: FK column -> SYNC column (FK must be calculated before SYNC can use it)
      if (fkColumnName) {
        this.automationEdges.push([`${tableName}.${fkColumnName}`, `${tableName}.${colName}`]);
      }
    }

    // Store the automation's source column dependency
    this.crossTableColumnDeps.push({
      dependentTable: tableName,
      dependentColumn: colName,
      referencedTable: sourceTable,
      referencedColumn: sourceColumn
    });
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
      const knownTableKeys = ['columns', 'seed-rows', 'constraints', 'unique-constraints', 'indexes'];
      for (const key of Object.keys(table)) {
        if (!knownTableKeys.includes(key)) {
          this.errors.push({
            location: tableName,
            message: `Unknown table property: ${key}, valid keys: ${knownTableKeys.join(', ')}`
          });
        }
      }

      // Copy comment
      if (table.comment) {
        this.tables[tableName].comment = table.comment;
      }

      // Process each table property type
      this.processSeedRows(tableName, table, tableColumns);
      this.processCheckConstraints(tableName, table, tableColumns);
      this.processUniqueConstraints(tableName, table, tableColumns);
      this.processIndexes(tableName, table, tableColumns);
    }
  }

  /**
   * Process seed-rows for a table
   */
  private processSeedRows(tableName: string, table: any, tableColumns: Record<string, any>): void {
    if (!table['seed-rows']) {
      return;
    }

    if (!Array.isArray(table['seed-rows'])) {
      this.errors.push({
        location: tableName,
        message: `seed-rows must be an array`
      });
      return;
    }

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

    // Validate: serial PK columns in seed rows must have values <= 99
    const pkColumn = this.tables[tableName].pkColumn;
    if (pkColumn && pkColumn in tableColumns) {
      const colDef = tableColumns[pkColumn];
      if (colDef.serial && colDef.isPrimaryKey) {
        for (let i = 0; i < table['seed-rows'].length; i++) {
          const row = table['seed-rows'][i];
          if (pkColumn in row) {
            const pkValue = row[pkColumn];
            if (typeof pkValue === 'number' && pkValue > 99) {
              this.errors.push({
                location: `${tableName}.seed-rows[${i}].${pkColumn}`,
                message: `Seed row primary key value must be <= 99 for serial columns (got ${pkValue}). Serial sequences start at 100.`
              });
            }
          }
        }
      }
    }
  }

  /**
   * Process CHECK constraints for a table
   */
  private processCheckConstraints(tableName: string, table: any, tableColumns: Record<string, any>): void {
    if (!table.constraints) {
      return;
    }

    if (!Array.isArray(table.constraints)) {
      this.errors.push({
        location: tableName,
        message: `constraints must be an array`
      });
      return;
    }

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

  /**
   * Process unique-constraints for a table
   */
  private processUniqueConstraints(tableName: string, table: any, tableColumns: Record<string, any>): void {
    if (!table['unique-constraints']) {
      return;
    }

    if (!Array.isArray(table['unique-constraints'])) {
      this.errors.push({
        location: tableName,
        message: `unique-constraints must be an array`
      });
      return;
    }

    this.tables[tableName].uniqueConstraints = {};

    // Generate names and validate
    for (let i = 0; i < table['unique-constraints'].length; i++) {
      const uniqueCols: any = table['unique-constraints'][i];
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

  /**
   * Process indexes for a table
   */
  private processIndexes(tableName: string, table: any, tableColumns: Record<string, any>): void {
    if (!table.indexes) {
      return;
    }

    if (!Array.isArray(table.indexes)) {
      this.errors.push({
        location: tableName,
        message: `indexes must be an array`
      });
      return;
    }

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
   * Extracts columns for this table from the unified automation+formula layer map
   * Column identifiers in layers are in the format "table.column"
   * Stores result in table.columnLayers as JSON-dumpable Record
   */
  applyColumnLayers(tableName: string, layers: Map<number, string[]>): void {
    const tableDef = this.tables[tableName];
    if (!tableDef) return;

    const result: Record<number, string[]> = {};

    // Extract columns for this table from unified layers, filtering to formula and automation columns
    for (const [layerNum, qualifiedColumnNames] of layers) {
      const automatedColumns: string[] = [];

      for (const qualifiedName of qualifiedColumnNames) {
        // Parse table.column format
        const dotIndex = qualifiedName.indexOf('.');
        const table = qualifiedName.substring(0, dotIndex);
        const colName = qualifiedName.substring(dotIndex + 1);

        // Include columns for this table that have formulas or automations (SYNC/SNAPSHOT)
        if (table === tableName) {
          const col = tableDef.columns?.[colName];
          if (col && (col.formula || col.automation)) {
            automatedColumns.push(colName);
          }
        }
      }

      if (automatedColumns.length > 0) {
        result[layerNum] = automatedColumns;
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
