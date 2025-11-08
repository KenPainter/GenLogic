/**
 * Schema Extraction Layer
 *
 * Progressively builds a normalized intermediate representation from the expanded YAML.
 * Each extraction function walks the YAML tree once and extracts a specific aspect.
 *
 * This allows us to:
 * - Debug by dumping at each phase
 * - Reuse extracted data for topological sort, SQL generation, validation
 * - Keep _yamlLine on everything for error reporting
 * - Avoid flatten/unflatten round-trips
 */

import type { ExpandedYaml } from './yaml-loader.js';
import { validateTableName } from './validators.js';

export interface ConstantDef {
  name: string;
  value: string | number | boolean;
  _yamlLine: number | null;
}

export interface ColumnDef {
  name: string;
  definition: string;
  _yamlLine: number | null;
  _inferDefinitionFrom?: string;  // Set if definition will be inferred from parent table
  // Formula, automation, etc. will be added in later phases
  [key: string]: any;
}

export interface TableDef {
  name: string;
  _yamlLine: number | null;
  columns: Map<string, ColumnDef>;
  // Foreign keys, indexes, constraints, seed-rows added in later phases
  [key: string]: any;
}

export interface ForeignKeyDef {
  fkName?: string;
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;  // Will be filled in during validation (default: empty until resolved)
  parentPKDefinition: string;  // Will be filled in during validation (empty until resolved)
  _yamlLine: number | null;
  deleteAction?: string;  // ON DELETE action: RESTRICT (default), CASCADE, SET NULL, SET DEFAULT, NO ACTION
  notNull?: boolean;
  autoCreateParent?: boolean;
}

export interface ExtractedSchema {
  schemaPath: string;
  constants: Map<string, ConstantDef>;
  tables: Map<string, TableDef>;
  foreignKeys: ForeignKeyDef[];
  tableLayers?: Map<number, string[]>;  // Layer assignments from topological sort
  cycles?: string[][];  // Detected cycles in foreign key dependencies
}

/**
 * Parse a FK column definition
 * Format: FK [not null] [auto create parent] [delete <action>] parentTable
 *
 * Returns:
 * - parentTable: the table name (after removing all patterns)
 * - parentColumn: only if explicitly specified as "parentTable.columnName"
 * - _inferDefinitionFrom: set to parentTable if parentColumn not specified
 * - notNull: true if "not null" found
 * - autoCreateParent: true if "auto create parent" found
 * - deleteAction: CASCADE, SET NULL, SET DEFAULT, NO ACTION, or RESTRICT (default)
 * - error: if parsing fails
 */
interface ParsedFKDef {
  parentTable?: string;
  parentColumn?: string;
  _inferDefinitionFrom?: string;
  notNull: boolean;
  autoCreateParent: boolean;
  deleteAction: string;
  error?: string;
}

function parseFKDefinition(fkDef: string): ParsedFKDef {
  const result: ParsedFKDef = {
    notNull: false,
    autoCreateParent: false,
    deleteAction: 'RESTRICT'  // Default per Postgres behavior
  };

  let remaining = fkDef.trim();

  // Remove "FK" keyword
  if (remaining.startsWith('FK ')) {
    remaining = remaining.substring(3).trim();
  } else if (remaining === 'FK') {
    result.error = 'FK definition is empty (missing parent table)';
    return result;
  } else {
    // Doesn't start with FK, not a FK definition
    return result;
  }

  // Extract "not null"
  const notNullMatch = remaining.match(/\bnot\s+null\b/i);
  if (notNullMatch) {
    result.notNull = true;
    remaining = remaining.replace(notNullMatch[0], '').trim();
  }

  // Extract "auto create parent"
  const autoCreateMatch = remaining.match(/\bauto\s+create\s+parent\b/i);
  if (autoCreateMatch) {
    result.autoCreateParent = true;
    remaining = remaining.replace(autoCreateMatch[0], '').trim();
  }

  // Extract "delete <action>"
  const deleteMatch = remaining.match(/\bdelete\s+(cascade|set\s+null|set\s+default|no\s+action|restrict)\b/i);
  if (deleteMatch) {
    const action = deleteMatch[1].toUpperCase().replace(/\s+/g, ' ');
    result.deleteAction = action;
    remaining = remaining.replace(deleteMatch[0], '').trim();
  }

  // What remains should be a valid table name
  if (!remaining) {
    result.error = 'FK definition missing parent table after removing patterns';
    return result;
  }

  // Check for spaces - would indicate invalid syntax
  if (remaining.includes(' ')) {
    result.error = `FK definition has unexpected text after patterns: "${remaining}"`;
    return result;
  }

  // Validate the table name
  const tableNameError = validateTableName(remaining);
  if (tableNameError) {
    result.error = `FK definition has invalid table name: ${tableNameError}`;
    return result;
  }

  // Valid table name - mark for inference of column definition
  result.parentTable = remaining;
  result._inferDefinitionFrom = remaining;

  return result;
}

/**
 * Extract constants from expanded YAML
 */
export function extractConstants(expandedYaml: ExpandedYaml): Map<string, ConstantDef> {
  const constants = new Map<string, ConstantDef>();
  const content = expandedYaml.content;

  if (!content || typeof content !== 'object' || !('constants' in content)) {
    return constants;
  }

  const constantsObj = content.constants;
  if (typeof constantsObj !== 'object' || constantsObj === null) {
    return constants;
  }

  for (const [name, value] of Object.entries(constantsObj)) {
    if (name === '_yamlLine') continue;

    const yamlLine = constantsObj._yamlLine || null;

    // Handle both direct values and wrapped values
    let actualValue = value;
    if (typeof value === 'object' && value !== null && '_value' in value) {
      actualValue = (value as any)._value;
    }

    constants.set(name, {
      name,
      value: actualValue as string | number | boolean,
      _yamlLine: yamlLine
    });
  }

  return constants;
}

/**
 * Extract tables and their columns from expanded YAML
 *
 * Note: This extracts the raw column definitions.
 * For FK columns (starting with "FK"), we:
 * - Set definition to empty string
 * - Set _inferDefinitionFrom to the parent table name
 * - Remove the FK syntax from the column
 *
 * Reusable column references ($ref) are NOT resolved here - that happens later
 * after topological sort is complete.
 */
export function extractTables(expandedYaml: ExpandedYaml): Map<string, TableDef> {
  const tables = new Map<string, TableDef>();
  const content = expandedYaml.content;

  if (!content || typeof content !== 'object' || !('tables' in content)) {
    return tables;
  }

  const tablesObj = content.tables;
  if (typeof tablesObj !== 'object' || tablesObj === null) {
    return tables;
  }

  for (const [tableName, tableValue] of Object.entries(tablesObj)) {
    if (tableName === '_yamlLine') continue;

    const tableObj = tableValue as any;
    const tableYamlLine = tableObj._yamlLine || null;

    const tableDef: TableDef = {
      name: tableName,
      _yamlLine: tableYamlLine,
      columns: new Map()
    };

    // Extract columns
    if (tableObj.columns && typeof tableObj.columns === 'object') {
      const columnsObj = tableObj.columns;
      for (const [columnName, columnValue] of Object.entries(columnsObj)) {
        if (columnName === '_yamlLine') continue;

        const columnObj = columnValue as any;
        const columnYamlLine = columnObj._yamlLine || null;

        // Handle both scalar (string) and object (with definition, formula, etc.) columns
        let definition = '';
        if (typeof columnValue === 'string' || (columnObj._value && typeof columnObj._value === 'string')) {
          definition = typeof columnValue === 'string' ? columnValue : columnObj._value;
        } else if (columnObj.definition) {
          // Object with definition field
          const defValue = columnObj.definition;
          definition = typeof defValue === 'object' && '_value' in defValue ? defValue._value : defValue;
        }

        // Check if this is an FK column
        let inferDefinitionFrom: string | undefined;
        if (definition.startsWith('FK')) {
          const parsed = parseFKDefinition(definition);
          if (parsed.parentTable && !parsed.error) {
            // This is a valid FK - blank out the definition and mark for inference
            definition = '';
            inferDefinitionFrom = parsed.parentTable;
          }
        }

        const columnDef: ColumnDef = {
          name: columnName,
          definition,
          _yamlLine: columnYamlLine,
          ...columnObj  // Keep all other properties (formula, automation, etc.)
        };

        // Remove _value and other YAML wrapper properties
        delete (columnDef as any)._value;

        // Set _inferDefinitionFrom if this is an FK column
        if (inferDefinitionFrom) {
          columnDef._inferDefinitionFrom = inferDefinitionFrom;
        }

        tableDef.columns.set(columnName, columnDef);
      }
    }

    tables.set(tableName, tableDef);
  }

  return tables;
}

/**
 * Extract foreign keys from expanded YAML
 *
 * Supports multiple FK definition styles:
 * - Inline: column: FK parentTable [not null] [auto create parent] [delete <action>]
 * - Named: foreign-keys: { fkName: { table: parentTable, column: parentColumn, deleteAction: ... } }
 */
export function extractForeignKeys(
  expandedYaml: ExpandedYaml,
  tables: Map<string, TableDef>
): ForeignKeyDef[] {
  const foreignKeys: ForeignKeyDef[] = [];
  const content = expandedYaml.content;

  if (!content || typeof content !== 'object' || !('tables' in content)) {
    return foreignKeys;
  }

  const tablesObj = content.tables;
  if (typeof tablesObj !== 'object' || tablesObj === null) {
    return foreignKeys;
  }

  for (const [tableName, tableValue] of Object.entries(tablesObj)) {
    if (tableName === '_yamlLine') continue;

    const tableObj = tableValue as any;

    // Method 1: Extract from columns with inline FK syntax
    // e.g., account_id: FK Account not null delete cascade
    if (tableObj.columns && typeof tableObj.columns === 'object') {
      const columnsObj = tableObj.columns;
      for (const [columnName, columnValue] of Object.entries(columnsObj)) {
        if (columnName === '_yamlLine') continue;

        const columnObj = columnValue as any;
        const columnYamlLine = columnObj._yamlLine || null;

        // Check if this is an inline FK definition
        let columnDef = '';
        if (typeof columnValue === 'string') {
          columnDef = columnValue;
        } else if (columnObj._value && typeof columnObj._value === 'string') {
          columnDef = columnObj._value;
        }

        // Parse inline FK if it starts with "FK"
        if (columnDef.startsWith('FK')) {
          const parsed = parseFKDefinition(columnDef);

          if (parsed.error) {
            // Throw error for invalid FK definitions
            throw new Error(`Line ${columnYamlLine}: ${parsed.error} in column ${tableName}.${columnName}`);
          }

          if (!parsed.parentTable) {
            // Not a valid FK definition, skip
            continue;
          }

          const fk: ForeignKeyDef = {
            childTable: tableName,
            childColumn: columnName,
            parentTable: parsed.parentTable,
            parentColumn: parsed.parentColumn || '',  // Empty until resolved
            parentPKDefinition: '',  // Empty until resolved
            _yamlLine: columnYamlLine,
            deleteAction: parsed.deleteAction
          };

          if (parsed.notNull) {
            fk.notNull = parsed.notNull;
          }
          if (parsed.autoCreateParent) {
            fk.autoCreateParent = parsed.autoCreateParent;
          }

          foreignKeys.push(fk);
        }
      }
    }

    // Method 2: Extract from foreign-keys section (object format)
    // e.g., foreign-keys: { account: { table: Account, column: account_id, deleteAction: CASCADE } }
    if (tableObj['foreign-keys'] && typeof tableObj['foreign-keys'] === 'object') {
      const fkObj = tableObj['foreign-keys'] as any;
      const fkYamlLine = fkObj._yamlLine || null;

      for (const [fkKey, fkValue] of Object.entries(fkObj)) {
        if (fkKey === '_yamlLine') continue;

        const fkDef = fkValue as any;
        let fkDefYamlLine = fkYamlLine;
        if (fkDef._yamlLine) {
          fkDefYamlLine = fkDef._yamlLine;
        }

        // Only handle object format in foreign-keys section
        // (not shorthand strings - those should be inline in columns)
        if (typeof fkValue === 'object' && fkDef.table) {
          const tableRef = fkDef.table;
          const parentTable = typeof tableRef === 'string' ? tableRef : (tableRef._value || tableRef);

          if (!parentTable) {
            console.warn(`Warning at line ${fkDefYamlLine}: foreign-key ${fkKey} in table ${tableName} missing table reference`);
            continue;
          }

          const fk: ForeignKeyDef = {
            fkName: fkKey,
            childTable: tableName,
            childColumn: fkKey,
            parentTable,
            parentColumn: '',  // Empty until resolved
            parentPKDefinition: '',  // Empty until resolved
            _yamlLine: fkDefYamlLine,
            deleteAction: 'RESTRICT'  // Default
          };

          // Optional: explicit parent column
          const columnRef = fkDef.column;
          if (columnRef) {
            const parentColumn = typeof columnRef === 'string' ? columnRef : (columnRef._value || columnRef);
            fk.parentColumn = parentColumn;
          }

          // Optional: delete action
          const deleteRef = fkDef.deleteAction;
          if (deleteRef) {
            fk.deleteAction = typeof deleteRef === 'string' ? deleteRef : deleteRef._value;
          }

          // Optional: not null
          const notNullRef = fkDef.notNull;
          if (notNullRef) {
            fk.notNull = typeof notNullRef === 'boolean' ? notNullRef : (notNullRef._value === true || notNullRef._value === 'true');
          }

          // Optional: auto create parent
          const autoRef = fkDef.autoCreateParent;
          if (autoRef) {
            fk.autoCreateParent = typeof autoRef === 'boolean' ? autoRef : (autoRef._value === true || autoRef._value === 'true');
          }

          foreignKeys.push(fk);
        }
      }
    }
  }

  return foreignKeys;
}

/**
 * Create an empty ExtractedSchema structure
 */
export function createExtractedSchema(schemaPath: string): ExtractedSchema {
  return {
    schemaPath,
    constants: new Map(),
    tables: new Map(),
    foreignKeys: []
  };
}
