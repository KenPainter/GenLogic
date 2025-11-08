/**
 * Schema Population Layer - Two-Pass Processing
 *
 * This module implements the two-pass schema processing pipeline described in
 * docs/processing-pipeline.md
 *
 * PASS 1: Per-Column Processing (Layer-by-Layer)
 * - For each table in dependency order:
 *   1. Replace ${CONSTANT} in all expressions
 *   2. Extract and store primary key in special key
 *   3. Resolve column definitions ($ref or infer from parent PK)
 *   4. Parse column definitions (extract NOT NULL, DEFAULT, validate type)
 *   5. Parse formulas using SQL parser → extract dependencies → store edges
 *   6. Parse automations using SQL parser → extract dependencies → store edges
 *   7. Validate seed-rows, unique constraints, indexes
 *   8. Parse and validate CHECK constraints
 *   9. Generate deterministic constraint/index names
 *   10. Extract sequence information
 *
 * PASS 2: Global Validation and Cycle Detection
 * - Call topologicalSortByLayers() with unified edge list (formulas + automations)
 * - Returns: { layers: Map<number, string[]>, cycles: string[][] }
 * - ERROR if any cycles found
 * - Assign column computation layers
 *
 * Output: PopulatedSchema (.populated.json)
 */

import { parse, astVisitor } from 'pgsql-ast-parser';
import type {
  ExtractedSchema,
  ColumnDef,
  TableDef,
  ForeignKeyDef,
  ConstantDef
} from './schema-extractor.js';
import { topologicalSortByLayers } from './topological-sort.js';
import { writeSchemaDebugFile } from './file-writer.js';

// ============================================================================
// TypeScript Interfaces for Populated Schema
// ============================================================================

export interface ParsedColumnDefinition {
  baseType: string;          // e.g., "integer", "varchar", "numeric"
  typeModifiers?: string;    // e.g., "(30)", "(12,2)"
  notNull: boolean;          // Extracted from "NOT NULL" keyword
  defaultValue?: string;     // Extracted from "DEFAULT x" keyword
  fullDefinition: string;    // Reconstructed: baseType + modifiers + NOT NULL + DEFAULT
}

export interface FormulaInfo {
  expression: string;
  dependencies: string[];    // Column names this formula depends on (same table)
}

export interface AutomationInfo {
  type: 'SYNC' | 'SUM' | 'COUNT' | 'MIN' | 'MAX';
  targetTable: string;       // Table being aggregated from or synced to
  targetColumn: string;      // Column being aggregated or synced
  fkColumn?: string;         // Optional FK qualifier for multiple FKs to same table
  whereClause?: string;      // Optional WHERE filter
  whereColumns?: string[];   // Columns referenced in WHERE clause
}

export interface PopulatedColumnDef {
  name: string;
  parsedDefinition: ParsedColumnDefinition;
  _yamlLine: number | null;

  // Computed column info
  formula?: FormulaInfo;
  automation?: AutomationInfo;

  // Metadata (preserved from ExtractedSchema)
  comment?: string;
  label?: string;
  format?: string;

  // Special markers
  _isPrimaryKey?: boolean;
}

export interface ConstraintDef {
  name: string;              // Generated name: chk_tablename_1, chk_tablename_2, etc.
  expression: string;        // SQL expression
  referencedColumns: string[]; // Columns referenced in expression
  _yamlLine: number | null;
}

export interface UniqueConstraintDef {
  name: string;              // Generated name: uq_tablename_col1_col2
  columns: string[];         // Column names in the constraint
  _yamlLine: number | null;
}

export interface IndexDef {
  name: string;              // Generated name: idx_tablename_col1_col2
  columns: string[];         // Column names in the index
  _yamlLine: number | null;
}

export interface SequenceInfo {
  name: string;              // tablename_columnname_seq
  startValue?: number;       // From seed-rows, if specified
}

export interface PopulatedTableDef {
  name: string;
  _yamlLine: number | null;
  _primaryKey?: string;      // Name of PK column for easy lookup
  columns: Map<string, PopulatedColumnDef>;
  columnLayers?: Map<number, string[]>;  // Column computation order
  constraints: ConstraintDef[];
  uniqueConstraints: UniqueConstraintDef[];
  indexes: IndexDef[];
  sequences: SequenceInfo[];
  seedRows?: any[];
  singleton?: boolean;
  comment?: string;
}

export interface PopulatedForeignKeyDef {
  fkName?: string;
  generatedName: string;     // fk_childtable_parenttable_column
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;      // ALWAYS POPULATED after processing
  parentPKDefinition: string; // ALWAYS POPULATED after processing
  _yamlLine: number | null;
  deleteAction?: string;     // Optional to match ForeignKeyDef
  notNull?: boolean;
  autoCreateParent?: boolean;
}

export interface PopulatedSchema {
  schemaPath: string;
  constants: Map<string, ConstantDef>;
  tables: Map<string, PopulatedTableDef>;
  foreignKeys: PopulatedForeignKeyDef[];
  tableLayers: Map<number, string[]>;

  // NEW: Unified dependency edges for all columns across all tables
  // Format: [from_col, to_col] where from depends on to
  // Both are fully qualified: "table_name.column_name"
  columnEdges: Array<[string, string]>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Substitute ${CONSTANT} placeholders in a string
 */
function substituteConstants(
  str: string | undefined,
  constants: Map<string, ConstantDef>,
  context: string
): string {
  if (!str || typeof str !== 'string') {
    return str || '';
  }
  return str.replace(/\$\{(\w+)\}/g, (match, constantName) => {
    const constant = constants.get(constantName);
    if (!constant) {
      throw new Error(`${context}: Undefined constant ${constantName}`);
    }
    return String(constant.value);
  });
}

/**
 * Parse column definition string to extract keywords and validate type
 *
 * Pattern:
 * 1. Extract "NOT NULL" keyword
 * 2. Extract "DEFAULT value" keyword (value can be complex, like INTERVAL '1 day')
 * 3. Extract "UNIQUE" keyword
 * 4. Extract "PRIMARY KEY" keyword
 * 5. What remains should be a valid Postgres type (with optional modifiers)
 *
 * Examples:
 * - "integer" → { baseType: "integer", notNull: false }
 * - "varchar(30) not null" → { baseType: "varchar", typeModifiers: "(30)", notNull: true }
 * - "numeric(12,2) default 0" → { baseType: "numeric", typeModifiers: "(12,2)", defaultValue: "0" }
 * - "varchar(30) unique" → { baseType: "varchar", typeModifiers: "(30)" }
 * - "serial primary key" → { baseType: "serial primary key" }
 */
function parseColumnDefinition(definition: string): ParsedColumnDefinition {
  let remaining = definition.trim();
  let notNull = false;
  let defaultValue: string | undefined;

  // Extract NOT NULL (case-insensitive)
  const notNullMatch = remaining.match(/\bNOT\s+NULL\b/i);
  if (notNullMatch) {
    notNull = true;
    remaining = remaining.replace(notNullMatch[0], '').trim();
  }

  // Extract UNIQUE (case-insensitive) - just remove it, we handle this separately
  remaining = remaining.replace(/\bUNIQUE\b/i, '').trim();

  // Extract PRIMARY KEY (case-insensitive) - just remove it, we handle this separately
  remaining = remaining.replace(/\bPRIMARY\s+KEY\b/i, '').trim();

  // Extract DEFAULT value (can be complex like INTERVAL '1 day')
  // Match DEFAULT followed by everything until end or NOT NULL
  const defaultMatch = remaining.match(/\bDEFAULT\s+(.+?)(?:\s+NOT\s+NULL)?$/i);
  if (defaultMatch) {
    defaultValue = defaultMatch[1].trim();
    remaining = remaining.replace(/\bDEFAULT\s+.+$/i, '').trim();
  }

  // Clean up multiple spaces
  remaining = remaining.replace(/\s+/g, ' ').trim();

  // What remains should be the Postgres type (possibly with modifiers)
  // Examples: integer, varchar(30), numeric(12,2), timestamp with time zone, serial primary key
  const typeMatch = remaining.match(/^([\w\s]+?)\s*(\([^)]+\))?$/);
  if (!typeMatch) {
    throw new Error(`Invalid Postgres type: "${remaining}" (after extracting keywords from "${definition}")`);
  }

  const baseType = typeMatch[1].trim();
  const typeModifiers = typeMatch[2];

  // Reconstruct full definition
  let fullDefinition = baseType;
  if (typeModifiers) {
    fullDefinition += typeModifiers;
  }
  if (notNull) {
    fullDefinition += ' NOT NULL';
  }
  if (defaultValue) {
    fullDefinition += ` DEFAULT ${defaultValue}`;
  }

  return {
    baseType,
    typeModifiers,
    notNull,
    defaultValue,
    fullDefinition
  };
}

/**
 * Generate deterministic FK constraint name
 * Format: fk_childtable_parenttable_column
 */
function generateFKName(childTable: string, parentTable: string, childColumn: string): string {
  return `fk_${childTable}_${parentTable}_${childColumn}`;
}

/**
 * Generate deterministic unique constraint name
 * Format: uq_tablename_col1_col2_col3
 */
function generateUniqueName(tableName: string, columns: string[]): string {
  return `uq_${tableName}_${columns.join('_')}`;
}

/**
 * Generate deterministic index name
 * Format: idx_tablename_col1_col2_col3
 */
function generateIndexName(tableName: string, columns: string[]): string {
  return `idx_${tableName}_${columns.join('_')}`;
}

/**
 * Generate deterministic CHECK constraint name
 * Format: chk_tablename_N (numbered sequentially)
 */
function generateCheckName(tableName: string, index: number): string {
  return `chk_${tableName}_${index + 1}`;
}

// ============================================================================
// SQL Expression Parsing (using pgsql-ast-parser)
// ============================================================================

/**
 * Parse a SQL formula expression and extract column dependencies
 * Wraps expression in "SELECT" to make it parseable
 */
function parseFormulaExpression(expression: string, tableName: string, columnName: string): string[] {
  try {
    const sql = `SELECT ${expression}`;
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

    return Array.from(columns).sort();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid formula expression in ${tableName}.${columnName}: ${errorMsg}\nExpression: ${expression}`
    );
  }
}

/**
 * Parse a WHERE clause and extract column references
 */
function parseWhereClause(
  whereClause: string,
  targetTable: string,
  context: string
): string[] {
  try {
    const sql = `SELECT * FROM ${targetTable} WHERE ${whereClause}`;
    const ast = parse(sql);

    const columns = new Set<string>();

    const visitor = astVisitor(() => ({
      ref: (ref) => {
        if (ref.name && ref.name !== targetTable) {
          columns.add(ref.name);
        }
      }
    }));

    visitor.statement(ast[0]);

    // Filter out '*' from SELECT clause
    return Array.from(columns).filter(col => col !== '*').sort();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid WHERE clause in ${context}: ${errorMsg}\nWHERE: ${whereClause}`
    );
  }
}

/**
 * Parse automation expression
 *
 * Formats:
 * - SYNC targetTable.column
 * - SUM targetTable.column
 * - SUM(fkColumn) targetTable.column
 * - COUNT targetTable.column
 * - MIN/MAX targetTable.column
 * - ... WHERE condition
 *
 * Returns AutomationInfo with type, target, and dependencies
 */
function parseAutomationExpression(
  expression: string,
  tableName: string,
  columnName: string
): AutomationInfo {
  // Match: TYPE [(fkColumn)] targetTable.targetColumn [WHERE clause]
  const pattern = /^(SYNC|SUM|COUNT|MIN|MAX)(?:\((\w+)\))?\s+(\w+)\.(\w+)(?:\s+WHERE\s+(.+))?$/i;
  const match = expression.match(pattern);

  if (!match) {
    throw new Error(
      `Invalid automation expression in ${tableName}.${columnName}: ${expression}\n` +
      `Expected format: TYPE[(fkColumn)] targetTable.targetColumn [WHERE condition]`
    );
  }

  const [, type, fkColumn, targetTable, targetColumn, whereClause] = match;

  const info: AutomationInfo = {
    type: type.toUpperCase() as AutomationInfo['type'],
    targetTable,
    targetColumn,
    fkColumn,
    whereClause
  };

  // Parse WHERE clause if present
  if (whereClause) {
    info.whereColumns = parseWhereClause(whereClause, targetTable, `${tableName}.${columnName} automation`);
  }

  return info;
}

// ============================================================================
// Column Processing Functions
// ============================================================================

/**
 * Find and extract primary key from table's columns
 * Returns the column name if found, or undefined if no PK
 * Throws error if multiple columns have "primary key"
 */
function extractPrimaryKey(columns: Map<string, ColumnDef>, tableName?: string): string | undefined {
  const columnEntries = Array.from(columns.entries());
  const pkColumns: string[] = [];

  for (const [colName, colDef] of columnEntries) {
    // Handle both raw strings and YAML-wrapped objects
    let def: string;
    if (typeof colDef.definition === 'string') {
      def = colDef.definition.toLowerCase();
    } else if (colDef.definition && typeof colDef.definition === 'object' && '_value' in colDef.definition) {
      def = String(colDef.definition._value).toLowerCase();
    } else {
      def = '';
    }

    if (def.includes('primary key')) {
      pkColumns.push(colName);
    }
  }

  if (pkColumns.length > 1) {
    throw new Error(
      `Table ${tableName || 'unknown'} has multiple primary key columns: ${pkColumns.join(', ')}\n` +
      `Only one column can be designated as primary key`
    );
  }

  return pkColumns.length === 1 ? pkColumns[0] : undefined;
}

/**
 * Convert serial types to their underlying types for FK columns
 * serial → integer
 * bigserial → bigint
 * smallserial → smallint
 */
function convertSerialToBaseType(definition: string): string {
  const lower = definition.toLowerCase().trim();

  // Remove "primary key" if present (FK columns can't have it)
  let cleaned = lower.replace(/\bprimary\s+key\b/i, '').trim();

  // Convert serial types
  if (cleaned.startsWith('serial')) {
    cleaned = cleaned.replace(/^serial\b/, 'integer');
  } else if (cleaned.startsWith('bigserial')) {
    cleaned = cleaned.replace(/^bigserial\b/, 'bigint');
  } else if (cleaned.startsWith('smallserial')) {
    cleaned = cleaned.replace(/^smallserial\b/, 'smallint');
  }

  return cleaned;
}

/**
 * Resolve reusable column reference ($ref)
 * Copies all properties from the reusable column
 */
function resolveReusableColumn(
  columnDef: any,  // Use 'any' because ColumnDef doesn't have $ref in type definition
  reusableColumns: Map<string, ColumnDef>
): ColumnDef {
  let refName = columnDef.$ref;
  if (!refName) {
    return columnDef;
  }

  // Handle case where $ref might be an object with _value
  if (typeof refName === 'object' && refName._value) {
    refName = refName._value;
  }

  const reusable = reusableColumns.get(refName);
  if (!reusable) {
    throw new Error(`Reusable column not found: ${refName}`);
  }

  // Merge: reusable properties as base, column properties override (but only non-empty values)
  const resolved: any = { ...reusable };

  // Override with columnDef properties, but skip empty strings and $ref
  for (const [key, value] of Object.entries(columnDef)) {
    if (key !== '$ref' && value !== '' && value !== null && value !== undefined) {
      resolved[key] = value;
    }
  }

  // Always override name and _yamlLine from the column definition
  resolved.name = columnDef.name;
  resolved._yamlLine = columnDef._yamlLine;

  return resolved as ColumnDef;
}

// ============================================================================
// Main Population Function
// ============================================================================

/**
 * Populate the extracted schema with full processing
 *
 * This is the main entry point that orchestrates the two-pass processing.
 */
export function populateSchema(
  extracted: ExtractedSchema,
  reusableColumnsFromYaml?: Map<string, ColumnDef>
): PopulatedSchema {
  const populated: PopulatedSchema = {
    schemaPath: extracted.schemaPath,
    constants: extracted.constants,
    tables: new Map(),
    foreignKeys: [],
    tableLayers: extracted.tableLayers || new Map(),
    columnEdges: []
  };

  // Use reusable columns passed in, or create empty map
  const reusableColumns = reusableColumnsFromYaml || new Map<string, ColumnDef>();

  // PASS 1: Per-Column Processing (Layer-by-Layer)
  console.log('PASS 1: Processing columns layer-by-layer...');

  // Convert tableLayers to array for processing
  const layerArray: string[][] = [];
  const layerEntries = Array.from(populated.tableLayers.entries());
  for (const [layerNum, tables] of layerEntries) {
    layerArray[layerNum] = tables;
  }

  for (let layerNum = 0; layerNum < layerArray.length; layerNum++) {
    const tablesInLayer = layerArray[layerNum] || [];

    for (const tableName of tablesInLayer) {
      const extractedTable = extracted.tables.get(tableName);
      if (!extractedTable) {
        console.warn(`Warning: Table ${tableName} in layer ${layerNum} not found in extracted schema`);
        continue;
      }

      console.log(`  Processing table: ${tableName} (layer ${layerNum})`);

      // Initialize populated table
      const populatedTable: PopulatedTableDef = {
        name: tableName,
        _yamlLine: extractedTable._yamlLine,
        columns: new Map(),
        constraints: [],
        uniqueConstraints: [],
        indexes: [],
        sequences: [],
        singleton: extractedTable.singleton,
        comment: extractedTable.comment
      };

      // Step 1: Extract and store primary key
      const pkColumn = extractPrimaryKey(extractedTable.columns, tableName);
      if (pkColumn) {
        populatedTable._primaryKey = pkColumn;
      }

      // Step 2: Process each column
      const columnEntries = Array.from(extractedTable.columns.entries());
      for (const [columnName, extractedColumn] of columnEntries) {
        let columnDef: any = extractedColumn;

        // Unwrap _value wrappers from YAML tracking
        if (columnDef.definition && typeof columnDef.definition === 'object' && columnDef.definition._value) {
          columnDef.definition = columnDef.definition._value;
        }
        if (columnDef.formula && typeof columnDef.formula === 'object' && columnDef.formula._value) {
          columnDef.formula = columnDef.formula._value;
        }
        if (columnDef.automation && typeof columnDef.automation === 'object' && columnDef.automation._value) {
          columnDef.automation = columnDef.automation._value;
        }

        // Step 2a: Resolve $ref if present
        if (columnDef.$ref) {
          columnDef = resolveReusableColumn(columnDef, reusableColumns);
        }

        // Step 2b: Infer definition from parent PK if needed
        if (columnDef._inferDefinitionFrom) {
          const parentTableName = columnDef._inferDefinitionFrom;
          const parentTable = populated.tables.get(parentTableName);

          if (!parentTable) {
            throw new Error(
              `Cannot infer definition for ${tableName}.${columnName}: ` +
              `parent table ${parentTableName} not yet processed (layer ordering issue)`
            );
          }

          if (!parentTable._primaryKey) {
            throw new Error(
              `Cannot infer definition for ${tableName}.${columnName}: ` +
              `parent table ${parentTableName} has no primary key`
            );
          }

          const parentPKColumn = parentTable.columns.get(parentTable._primaryKey);
          if (!parentPKColumn) {
            throw new Error(
              `Cannot infer definition for ${tableName}.${columnName}: ` +
              `parent table ${parentTableName} PK column not found`
            );
          }

          // Copy and convert serial types
          columnDef.definition = convertSerialToBaseType(parentPKColumn.parsedDefinition.fullDefinition);
        }

        // Step 2c: Substitute constants in definition
        if (columnDef.definition) {
          columnDef.definition = substituteConstants(
            columnDef.definition,
            populated.constants,
            `${tableName}.${columnName} definition`
          );
        }

        // Step 2d: Parse column definition
        if (!columnDef.definition || typeof columnDef.definition !== 'string') {
          throw new Error(
            `Column ${tableName}.${columnName} has no definition after resolution\n` +
            `Column data: ${JSON.stringify(columnDef, null, 2)}`
          );
        }

        const parsedDef = parseColumnDefinition(columnDef.definition);

        // Initialize populated column
        const populatedColumn: PopulatedColumnDef = {
          name: columnName,
          parsedDefinition: parsedDef,
          _yamlLine: columnDef._yamlLine,
          comment: columnDef.comment,
          label: columnDef.label,
          format: columnDef.format
        };

        // Step 2e: Parse formula if present
        if (columnDef.formula) {
          const formulaExpr = substituteConstants(
            columnDef.formula,
            populated.constants,
            `${tableName}.${columnName} formula`
          );

          const dependencies = parseFormulaExpression(formulaExpr, tableName, columnName);

          // Validate that all referenced columns exist in the same table
          for (const dep of dependencies) {
            if (!populatedTable.columns.has(dep)) {
              throw new Error(
                `Formula in ${tableName}.${columnName} references non-existent column: ${dep}\n` +
                `Available columns: ${Array.from(populatedTable.columns.keys()).join(', ')}`
              );
            }
          }

          populatedColumn.formula = {
            expression: formulaExpr,
            dependencies
          };

          // Store edges for cycle detection
          for (const dep of dependencies) {
            populated.columnEdges.push([`${tableName}.${columnName}`, `${tableName}.${dep}`]);
          }
        }

        // Step 2f: Parse automation if present
        if (columnDef.automation) {
          // Validate that column doesn't have both formula and automation
          if (columnDef.formula) {
            throw new Error(
              `Column ${tableName}.${columnName} cannot have both formula and automation\n` +
              `Formula: ${columnDef.formula}\n` +
              `Automation: ${columnDef.automation}`
            );
          }

          const autoExpr = substituteConstants(
            columnDef.automation,
            populated.constants,
            `${tableName}.${columnName} automation`
          );

          const autoInfo = parseAutomationExpression(autoExpr, tableName, columnName);
          populatedColumn.automation = autoInfo;

          // Validate SYNC/SNAPSHOT (parent-to-child) during PASS 1
          // Parent tables are always processed before children due to FK ordering
          if (autoInfo.type === 'SYNC' || autoInfo.type === 'SNAPSHOT') {
            const parentTable = populated.tables.get(autoInfo.targetTable);
            if (!parentTable) {
              throw new Error(
                `${autoInfo.type} automation in ${tableName}.${columnName} references non-existent table: ${autoInfo.targetTable}\n` +
                `Available tables: ${Array.from(populated.tables.keys()).join(', ')}`
              );
            }

            if (!parentTable.columns.has(autoInfo.targetColumn)) {
              throw new Error(
                `${autoInfo.type} automation in ${tableName}.${columnName} references non-existent column: ${autoInfo.targetTable}.${autoInfo.targetColumn}\n` +
                `Available columns in ${autoInfo.targetTable}: ${Array.from(parentTable.columns.keys()).join(', ')}`
              );
            }
          }
          // Note: SUM/COUNT/MIN/MAX validation deferred to PASS 2
          // (child tables may not be processed yet in layer-by-layer PASS 1)

          // Store edges for cycle detection
          if (autoInfo.type === 'SYNC' || autoInfo.type === 'SNAPSHOT') {
            // SYNC/SNAPSHOT: child depends on parent
            populated.columnEdges.push([
              `${tableName}.${columnName}`,
              `${autoInfo.targetTable}.${autoInfo.targetColumn}`
            ]);
          } else {
            // SUM/COUNT/MIN/MAX: parent depends on child
            populated.columnEdges.push([
              `${tableName}.${columnName}`,
              `${autoInfo.targetTable}.${autoInfo.targetColumn}`
            ]);
          }
        }

        // Mark if this is the PK
        if (columnName === pkColumn) {
          populatedColumn._isPrimaryKey = true;
        }

        populatedTable.columns.set(columnName, populatedColumn);
      }

      // Step 3: Extract sequence information for serial columns
      const sequenceEntries = Array.from(populatedTable.columns.entries());
      for (const [columnName, column] of sequenceEntries) {
        const baseType = column.parsedDefinition.baseType.toLowerCase();
        if (baseType === 'serial' || baseType === 'bigserial' || baseType === 'smallserial') {
          const sequence: SequenceInfo = {
            name: `${tableName}_${columnName}_seq`
          };
          // TODO: Extract starting value from seed-rows if present
          populatedTable.sequences.push(sequence);
        }
      }

      // Step 4: Process seed-rows
      if (extractedTable['seed-rows'] && Array.isArray(extractedTable['seed-rows'])) {
        const seedRows = extractedTable['seed-rows'];
        populatedTable.seedRows = [];

        for (const row of seedRows) {
          // Substitute constants in seed row values
          const processedRow: any = {};
          for (const [colName, value] of Object.entries(row)) {
            if (typeof value === 'string') {
              processedRow[colName] = substituteConstants(value, populated.constants, `${tableName} seed-row`);
            } else {
              processedRow[colName] = value;
            }

            // Validate column exists
            if (!populatedTable.columns.has(colName)) {
              throw new Error(
                `Seed-row in table ${tableName} references non-existent column: ${colName}\n` +
                `Available columns: ${Array.from(populatedTable.columns.keys()).join(', ')}`
              );
            }
          }
          populatedTable.seedRows.push(processedRow);
        }
      }

      // Step 5: Process unique-constraints
      if (extractedTable['unique-constraints'] && Array.isArray(extractedTable['unique-constraints'])) {
        const uniqueConstraints = extractedTable['unique-constraints'];

        for (const constraint of uniqueConstraints) {
          if (!Array.isArray(constraint)) {
            throw new Error(`Unique constraint in table ${tableName} must be an array of column names`);
          }

          // Validate all columns exist
          for (const colName of constraint) {
            if (!populatedTable.columns.has(colName)) {
              throw new Error(
                `Unique constraint in table ${tableName} references non-existent column: ${colName}\n` +
                `Available columns: ${Array.from(populatedTable.columns.keys()).join(', ')}`
              );
            }
          }

          const uniqueConstraintDef: UniqueConstraintDef = {
            name: generateUniqueName(tableName, constraint),
            columns: constraint,
            _yamlLine: extractedTable._yamlLine
          };

          populatedTable.uniqueConstraints.push(uniqueConstraintDef);
        }
      }

      // Step 6: Process indexes
      if (extractedTable.indexes && Array.isArray(extractedTable.indexes)) {
        const indexes = extractedTable.indexes;

        for (const index of indexes) {
          if (!Array.isArray(index)) {
            throw new Error(`Index in table ${tableName} must be an array of column names`);
          }

          // Validate all columns exist
          for (const colName of index) {
            if (!populatedTable.columns.has(colName)) {
              throw new Error(
                `Index in table ${tableName} references non-existent column: ${colName}\n` +
                `Available columns: ${Array.from(populatedTable.columns.keys()).join(', ')}`
              );
            }
          }

          const indexDef: IndexDef = {
            name: generateIndexName(tableName, index),
            columns: index,
            _yamlLine: extractedTable._yamlLine
          };

          populatedTable.indexes.push(indexDef);
        }
      }

      // Step 7: Process CHECK constraints
      if (extractedTable.constraints && Array.isArray(extractedTable.constraints)) {
        const constraints = extractedTable.constraints;

        for (let i = 0; i < constraints.length; i++) {
          const constraintExpr = constraints[i];

          if (typeof constraintExpr !== 'string') {
            throw new Error(`CHECK constraint in table ${tableName} must be a string expression`);
          }

          // Substitute constants
          const processedExpr = substituteConstants(
            constraintExpr,
            populated.constants,
            `${tableName} CHECK constraint #${i + 1}`
          );

          // Parse and validate using SQL parser
          const referencedColumns = parseWhereClause(
            processedExpr,
            tableName,
            `${tableName} CHECK constraint #${i + 1}`
          );

          // Validate all referenced columns exist
          for (const colName of referencedColumns) {
            if (!populatedTable.columns.has(colName)) {
              throw new Error(
                `CHECK constraint in table ${tableName} references non-existent column: ${colName}\n` +
                `Expression: ${processedExpr}\n` +
                `Available columns: ${Array.from(populatedTable.columns.keys()).join(', ')}`
              );
            }
          }

          const constraintDef: ConstraintDef = {
            name: generateCheckName(tableName, i),
            expression: processedExpr,
            referencedColumns,
            _yamlLine: extractedTable._yamlLine
          };

          populatedTable.constraints.push(constraintDef);
        }
      }

      populated.tables.set(tableName, populatedTable);
    }
  }

  // PASS 2: Global Validation and Cycle Detection
  console.log('PASS 2: Validating child-to-parent automations and detecting cycles...');

  // Validate SUM/COUNT/MIN/MAX automations (child-to-parent, deferred from PASS 1)
  const pass2TableEntries = Array.from(populated.tables.entries());
  for (const [tableName, table] of pass2TableEntries) {
    const columnEntries = Array.from(table.columns.entries());
    for (const [columnName, column] of columnEntries) {
      if (column.automation) {
        const autoInfo = column.automation;

        // Skip SYNC/SNAPSHOT - already validated in PASS 1
        if (autoInfo.type === 'SYNC' || autoInfo.type === 'SNAPSHOT') {
          continue;
        }

        // Validate SUM/COUNT/MIN/MAX automations (child-to-parent)
        const childTable = populated.tables.get(autoInfo.targetTable);
        if (!childTable) {
          throw new Error(
            `${autoInfo.type} automation in ${tableName}.${columnName} references non-existent child table: ${autoInfo.targetTable}\n` +
            `Available tables: ${Array.from(populated.tables.keys()).join(', ')}`
          );
        }

        if (!childTable.columns.has(autoInfo.targetColumn)) {
          throw new Error(
            `${autoInfo.type} automation in ${tableName}.${columnName} references non-existent column in child table ${autoInfo.targetTable}: ${autoInfo.targetColumn}\n` +
            `Available columns in ${autoInfo.targetTable}: ${Array.from(childTable.columns.keys()).join(', ')}`
          );
        }

        // Validate WHERE clause column references if present
        if (autoInfo.whereColumns && autoInfo.whereColumns.length > 0) {
          for (const whereCol of autoInfo.whereColumns) {
            if (!childTable.columns.has(whereCol)) {
              throw new Error(
                `WHERE clause in ${tableName}.${columnName} references non-existent column in ${autoInfo.targetTable}: ${whereCol}\n` +
                `Available columns in ${autoInfo.targetTable}: ${Array.from(childTable.columns.keys()).join(', ')}`
              );
            }
          }
        }
      }
    }
  }

  // Collect all column names for topological sort
  const allColumns = new Set<string>();
  const tableEntries = Array.from(populated.tables.entries());
  for (const [tableName, table] of tableEntries) {
    const columnNames = Array.from(table.columns.keys());
    for (const columnName of columnNames) {
      allColumns.add(`${tableName}.${columnName}`);
    }
  }

  // Run topological sort on unified edge list
  const sortResult = topologicalSortByLayers(
    allColumns,
    populated.columnEdges,
    true  // Skip self-loops
  );

  if (sortResult.cycles.length > 0) {
    // Format cycle error message
    const cycleDescriptions = sortResult.cycles.map(cycle => {
      return '  ' + cycle.join(' → ');
    }).join('\n');

    throw new Error(
      `Column dependency cycles detected:\n${cycleDescriptions}\n\n` +
      `Cycles can occur in:\n` +
      `- Formula expressions (column A depends on B, B depends on A)\n` +
      `- Automation expressions (aggregates that create circular dependencies)\n` +
      `- Mixed formula/automation cycles`
    );
  }

  // Assign column layers to each table
  const populatedTableEntries = Array.from(populated.tables.entries());
  for (const [tableName, table] of populatedTableEntries) {
    const columnLayers = new Map<number, string[]>();

    // For each layer in the global sort result
    const layerResultEntries = Array.from(sortResult.layers.entries());
    for (const [layerNum, columns] of layerResultEntries) {
      const columnsInThisTable = columns
        .filter(fqName => fqName.startsWith(`${tableName}.`))
        .map(fqName => fqName.substring(tableName.length + 1));

      if (columnsInThisTable.length > 0) {
        columnLayers.set(layerNum, columnsInThisTable);
      }
    }

    table.columnLayers = columnLayers;
  }

  // Process foreign keys
  for (const fk of extracted.foreignKeys) {
    const parentTable = populated.tables.get(fk.parentTable);
    if (!parentTable) {
      throw new Error(`Foreign key references non-existent parent table: ${fk.parentTable}`);
    }

    if (!parentTable._primaryKey) {
      throw new Error(`Parent table ${fk.parentTable} has no primary key for FK ${fk.childTable}.${fk.childColumn}`);
    }

    const parentPKColumn = parentTable.columns.get(parentTable._primaryKey);
    if (!parentPKColumn) {
      throw new Error(`Parent table ${fk.parentTable} PK column not found`);
    }

    const populatedFK: PopulatedForeignKeyDef = {
      ...fk,
      generatedName: generateFKName(fk.childTable, fk.parentTable, fk.childColumn),
      parentColumn: parentTable._primaryKey,
      parentPKDefinition: parentPKColumn.parsedDefinition.fullDefinition
    };

    populated.foreignKeys.push(populatedFK);
  }

  console.log('Schema population complete!');

  return populated;
}

/**
 * Write populated schema to .populated.json file
 */
export function writePopulatedSchema(
  populated: PopulatedSchema,
  dumpDir?: string
): void {
  writeSchemaDebugFile(
    { schemaPath: populated.schemaPath, dumpDir },
    '.populated.json',
    populated,
    'Populated schema'
  );
}
