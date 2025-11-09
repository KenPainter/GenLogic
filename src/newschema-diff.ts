/**
 * NewSchema Diff Engine
 *
 * GENLOGIC PRINCIPLE: Apples-to-apples comparison
 * Both desired and live schemas are NewSchema instances with identical structure
 * This makes diffing straightforward and reliable
 */

import type { NewSchema } from './new-schema.js';
import type { TableDef, ForeignKeyDef, ConstraintDef, UniqueConstraintDef, IndexDef, ColumnDef } from './new-schema-subtypes.js';
import { parse, toSql } from 'pgsql-ast-parser';

export interface NewSchemaDiff {
  tablesToCreate: string[];
  tablesToDrop?: string[];  // Optional - deleted after extraction to drops.sql
  columnsToAdd: Array<{ table: string; column: string; columnDef: ColumnDef }>;
  columnsToModify: Array<{ table: string; column: string; oldColumnDef: ColumnDef; newColumnDef: ColumnDef }>;
  columnsToDrop?: Array<{ table: string; column: string }>;  // Optional - deleted after extraction to drops.sql
  foreignKeysToAdd: Array<{ table: string; fk: ForeignKeyDef }>;
  foreignKeysToDrop: Array<{ table: string; fkName: string }>;
  foreignKeysToModify: Array<{ table: string; fkName: string; oldFk: ForeignKeyDef; newFk: ForeignKeyDef }>;
  constraintsToAdd: Array<{ table: string; constraint: ConstraintDef }>;
  constraintsToDrop: Array<{ table: string; constraint: ConstraintDef }>;
  constraintsToModify: Array<{ table: string; constraintName: string; oldConstraint: ConstraintDef; newConstraint: ConstraintDef }>;
  uniqueConstraintsToAdd: Array<{ table: string; constraint: UniqueConstraintDef }>;
  uniqueConstraintsToDrop: Array<{ table: string; constraintName: string }>;
  uniqueConstraintsToModify: Array<{ table: string; constraintName: string; oldConstraint: UniqueConstraintDef; newConstraint: UniqueConstraintDef }>;
  indexesToAdd: Array<{ table: string; index: IndexDef }>;
  indexesToDrop: Array<{ table: string; indexName: string }>;
  indexesToModify: Array<{ table: string; indexName: string; oldIndex: IndexDef; newIndex: IndexDef }>;
  primaryKeyChanges: Array<{ table: string; oldPkColumns: string[]; newPkColumns: string[] }>;

  // Layer information from desired schema (for SQL ordering)
  tableLayers?: Record<number, string[]>;  // FK dependency layers
  columnLayers?: Record<string, Record<number, string[]>>;  // Formula column dependency layers per table
}

/**
 * Compare two NewSchema instances and generate a comprehensive diff
 *
 * @param desired - The desired schema from YAML
 * @param live - The live schema from database introspection
 * @returns Comprehensive diff showing all differences
 */
export function diffSchemas(desired: NewSchema, live: NewSchema): NewSchemaDiff {
  const diff: NewSchemaDiff = {
    tablesToCreate: [],
    tablesToDrop: [],
    columnsToAdd: [],
    columnsToModify: [],
    columnsToDrop: [],
    foreignKeysToAdd: [],
    foreignKeysToDrop: [],
    foreignKeysToModify: [],
    constraintsToAdd: [],
    constraintsToDrop: [],
    constraintsToModify: [],
    uniqueConstraintsToAdd: [],
    uniqueConstraintsToDrop: [],
    uniqueConstraintsToModify: [],
    indexesToAdd: [],
    indexesToDrop: [],
    indexesToModify: [],
    primaryKeyChanges: []
  };

  const desiredTableNames = new Set(Object.keys(desired.tables));
  const liveTableNames = new Set(Object.keys(live.tables));

  // Find tables to create (in desired, not in live)
  for (const tableName of desiredTableNames) {
    if (!liveTableNames.has(tableName)) {
      diff.tablesToCreate.push(tableName);
    }
  }

  // Find tables to drop (in live, not in desired)
  for (const tableName of liveTableNames) {
    if (!desiredTableNames.has(tableName)) {
      diff.tablesToDrop.push(tableName);
    }
  }

  // Compare common tables
  for (const tableName of desiredTableNames) {
    if (!liveTableNames.has(tableName)) {
      continue; // Already handled in tablesToCreate
    }

    const desiredTable = desired.tables[tableName];
    const liveTable = live.tables[tableName];

    // Compare columns
    diffColumns(tableName, desiredTable, liveTable, diff);

    // Compare foreign keys
    diffForeignKeys(tableName, desiredTable, liveTable, diff);

    // Compare constraints
    diffConstraints(tableName, desiredTable, liveTable, diff);

    // Compare unique constraints
    diffUniqueConstraints(tableName, desiredTable, liveTable, diff);

    // Compare indexes
    diffIndexes(tableName, desiredTable, liveTable, diff);
  }

  return diff;
}

/**
 * Compare columns between desired and live table
 * Also detects PRIMARY KEY changes at table level
 */
function diffColumns(
  tableName: string,
  desiredTable: TableDef,
  liveTable: TableDef,
  diff: NewSchemaDiff
): void {
  const desiredColumns = desiredTable.columns || {};
  const liveColumns = liveTable.columns || {};

  const desiredColNames = new Set(Object.keys(desiredColumns));
  const liveColNames = new Set(Object.keys(liveColumns));

  // Track PK columns for table-level PK change detection
  const oldPkColumns: string[] = [];
  const newPkColumns: string[] = [];

  // Find columns to add
  for (const colName of desiredColNames) {
    if (!liveColNames.has(colName)) {
      diff.columnsToAdd.push({
        table: tableName,
        column: colName,
        columnDef: desiredColumns[colName]  // Full ColumnDef object
      });
      // Track new PK columns
      if (desiredColumns[colName].isPrimaryKey) {
        newPkColumns.push(colName);
      }
    }
  }

  // Find columns to drop
  for (const colName of liveColNames) {
    if (!desiredColNames.has(colName)) {
      diff.columnsToDrop.push({
        table: tableName,
        column: colName
      });
      // Track old PK columns
      if (liveColumns[colName].isPrimaryKey) {
        oldPkColumns.push(colName);
      }
    }
  }

  // Find columns to modify
  for (const colName of desiredColNames) {
    if (liveColNames.has(colName)) {
      const oldCol = liveColumns[colName];
      const newCol = desiredColumns[colName];

      // Track PK columns
      if (oldCol.isPrimaryKey) {
        oldPkColumns.push(colName);
      }
      if (newCol.isPrimaryKey) {
        newPkColumns.push(colName);
      }

      // Compare using normalizedDef for apples-to-apples comparison
      const desiredDef = newCol.normalizedDef || newCol.definition;
      const liveDef = oldCol.definition; // Live always uses definition

      if (desiredDef !== liveDef) {
        // Check if this is ONLY a PK change (no other column property changes)
        const isPkOnlyChange = areColumnsIdenticalExceptPk(oldCol, newCol);

        if (!isPkOnlyChange) {
          // Only add to columnsToModify if there are non-PK changes
          diff.columnsToModify.push({
            table: tableName,
            column: colName,
            oldColumnDef: oldCol,    // Full ColumnDef from live
            newColumnDef: newCol     // Full ColumnDef from desired
          });
        }
      }
    }
  }

  // Detect table-level PK changes
  const oldPkSorted = oldPkColumns.sort();
  const newPkSorted = newPkColumns.sort();

  // Compare as JSON strings for deep array equality
  if (JSON.stringify(oldPkSorted) !== JSON.stringify(newPkSorted)) {
    diff.primaryKeyChanges.push({
      table: tableName,
      oldPkColumns: oldPkSorted,
      newPkColumns: newPkSorted
    });
  }
}

/**
 * Check if two ColumnDefs are identical except for isPrimaryKey
 * Used to filter out PK-only changes from columnsToModify
 */
function areColumnsIdenticalExceptPk(oldCol: ColumnDef, newCol: ColumnDef): boolean {
  return (
    oldCol.type === newCol.type &&
    oldCol.character_maximum_length === newCol.character_maximum_length &&
    oldCol.numeric_precision === newCol.numeric_precision &&
    oldCol.numeric_scale === newCol.numeric_scale &&
    oldCol.nullable === newCol.nullable &&
    oldCol.defaultValue === newCol.defaultValue &&
    oldCol.serial === newCol.serial
    // Explicitly NOT comparing isPrimaryKey
  );
}

/**
 * Compare foreign keys between desired and live table
 */
function diffForeignKeys(
  tableName: string,
  desiredTable: TableDef,
  liveTable: TableDef,
  diff: NewSchemaDiff
): void {
  const desiredFKs = desiredTable.foreignKeys || {};
  const liveFKs = liveTable.foreignKeys || {};

  const desiredFKNames = new Set(Object.keys(desiredFKs));
  const liveFKNames = new Set(Object.keys(liveFKs));

  // Find FKs to add
  for (const fkName of desiredFKNames) {
    if (!liveFKNames.has(fkName)) {
      diff.foreignKeysToAdd.push({
        table: tableName,
        fk: desiredFKs[fkName]
      });
    }
  }

  // Find FKs to drop
  for (const fkName of liveFKNames) {
    if (!desiredFKNames.has(fkName)) {
      diff.foreignKeysToDrop.push({
        table: tableName,
        fkName: fkName
      });
    }
  }

  // Find FKs to modify (compare full definition)
  for (const fkName of desiredFKNames) {
    if (liveFKNames.has(fkName)) {
      const desiredFK = desiredFKs[fkName];
      const liveFK = liveFKs[fkName];

      // Compare all FK properties
      if (
        desiredFK.childColumn !== liveFK.childColumn ||
        desiredFK.parentTable !== liveFK.parentTable ||
        desiredFK.parentColumn !== liveFK.parentColumn ||
        desiredFK.deleteAction !== liveFK.deleteAction
      ) {
        diff.foreignKeysToModify.push({
          table: tableName,
          fkName: fkName,
          oldFk: liveFK,
          newFk: desiredFK
        });
      }
    }
  }
}

/**
 * Normalize CHECK constraint definition for structural comparison
 * PostgreSQL adds extra parentheses during normalization - we parse and re-serialize
 * to compare the AST structure rather than string formatting
 *
 * Example:
 *   Input:  "CHECK ((NOT (batch_type_id = 1 AND batch_count > 1)))"
 *   Input:  "CHECK ((NOT ((batch_type_id = 1) AND (batch_count > 1))))"
 *   Output: Both normalize to same canonical form
 */
function normalizeConstraintDefinition(def: string): string {
  try {
    // Extract expression from CHECK (...) wrapper
    // PostgreSQL format: "CHECK ((expression))" with double parens
    const match = def.match(/^CHECK\s+\(\((.+)\)\)$/is);
    if (!match) {
      // Fall back to simpler match if format is different
      const simpleMatch = def.match(/^CHECK\s+\((.+)\)$/is);
      if (!simpleMatch) return def;
    }

    const expr = match ? match[1] : def.match(/^CHECK\s+\((.+)\)$/is)![1];

    // Parse as WHERE clause to get AST and normalize
    const sql = `SELECT * FROM dummy WHERE ${expr}`;
    const ast = parse(sql);

    // Re-serialize AST to canonical form (removes redundant parens, normalizes spacing)
    const normalized = toSql.statement(ast[0]);

    // Extract just the WHERE clause part
    const whereMatch = normalized.match(/WHERE\s+(.+)$/is);
    if (!whereMatch) return def;

    // Rebuild in PostgreSQL's canonical CHECK format
    return `CHECK ((${whereMatch[1]}))`;
  } catch (error) {
    // If parsing fails, fall back to original definition
    // This ensures we don't break on edge cases
    return def;
  }
}

/**
 * Compare CHECK constraints between desired and live table
 * Compares by constraint_definition (substance), not by name
 * Uses AST-based normalization to avoid spurious diffs from PostgreSQL's extra parentheses
 */
function diffConstraints(
  tableName: string,
  desiredTable: TableDef,
  liveTable: TableDef,
  diff: NewSchemaDiff
): void {
  const desiredConstraints = desiredTable.constraints || {};
  const liveConstraints = liveTable.constraints || {};

  // Build sets of NORMALIZED constraint definitions (substance, not names or formatting)
  const desiredDefs = new Set<string>();
  const liveDefs = new Set<string>();
  const desiredByNormalizedDef = new Map<string, ConstraintDef>();
  const liveByNormalizedDef = new Map<string, ConstraintDef>();

  for (const constraint of Object.values(desiredConstraints)) {
    const normalized = normalizeConstraintDefinition(constraint.constraint_definition);
    desiredDefs.add(normalized);
    desiredByNormalizedDef.set(normalized, constraint);
  }

  for (const constraint of Object.values(liveConstraints)) {
    const normalized = normalizeConstraintDefinition(constraint.constraint_definition);
    liveDefs.add(normalized);
    liveByNormalizedDef.set(normalized, constraint);
  }

  // Find constraints to add (definition in desired, not in live)
  for (const def of desiredDefs) {
    if (!liveDefs.has(def)) {
      diff.constraintsToAdd.push({
        table: tableName,
        constraint: desiredByNormalizedDef.get(def)!
      });
    }
  }

  // Find constraints to drop (definition in live, not in desired)
  for (const def of liveDefs) {
    if (!desiredDefs.has(def)) {
      diff.constraintsToDrop.push({
        table: tableName,
        constraint: liveByNormalizedDef.get(def)!
      });
    }
  }

  // No need to check for modifications - if normalized definitions match, they're identical
  // Names don't matter - we compare by substance (AST structure)
}

/**
 * Compare UNIQUE constraints between desired and live table
 */
function diffUniqueConstraints(
  tableName: string,
  desiredTable: TableDef,
  liveTable: TableDef,
  diff: NewSchemaDiff
): void {
  const desiredConstraints = desiredTable.uniqueConstraints || {};
  const liveConstraints = liveTable.uniqueConstraints || {};

  const desiredNames = new Set(Object.keys(desiredConstraints));
  const liveNames = new Set(Object.keys(liveConstraints));

  // Find unique constraints to add
  for (const name of desiredNames) {
    if (!liveNames.has(name)) {
      diff.uniqueConstraintsToAdd.push({
        table: tableName,
        constraint: desiredConstraints[name]
      });
    }
  }

  // Find unique constraints to drop
  for (const name of liveNames) {
    if (!desiredNames.has(name)) {
      diff.uniqueConstraintsToDrop.push({
        table: tableName,
        constraintName: name
      });
    }
  }

  // Find unique constraints to modify (column list changed)
  for (const name of desiredNames) {
    if (liveNames.has(name)) {
      const desired = desiredConstraints[name];
      const live = liveConstraints[name];

      // Compare column arrays
      const desiredCols = JSON.stringify(desired.columns);
      const liveCols = JSON.stringify(live.columns);

      if (desiredCols !== liveCols) {
        diff.uniqueConstraintsToModify.push({
          table: tableName,
          constraintName: name,
          oldConstraint: live,
          newConstraint: desired
        });
      }
    }
  }
}

/**
 * Compare indexes between desired and live table
 */
function diffIndexes(
  tableName: string,
  desiredTable: TableDef,
  liveTable: TableDef,
  diff: NewSchemaDiff
): void {
  const desiredIndexes = desiredTable.indexes || {};
  const liveIndexes = liveTable.indexes || {};

  const desiredNames = new Set(Object.keys(desiredIndexes));
  const liveNames = new Set(Object.keys(liveIndexes));

  // Find indexes to add
  for (const name of desiredNames) {
    if (!liveNames.has(name)) {
      diff.indexesToAdd.push({
        table: tableName,
        index: desiredIndexes[name]
      });
    }
  }

  // Find indexes to drop
  for (const name of liveNames) {
    if (!desiredNames.has(name)) {
      diff.indexesToDrop.push({
        table: tableName,
        indexName: name
      });
    }
  }

  // Find indexes to modify (column list changed)
  for (const name of desiredNames) {
    if (liveNames.has(name)) {
      const desired = desiredIndexes[name];
      const live = liveIndexes[name];

      // Compare column arrays
      const desiredCols = JSON.stringify(desired.columns);
      const liveCols = JSON.stringify(live.columns);

      if (desiredCols !== liveCols) {
        diff.indexesToModify.push({
          table: tableName,
          indexName: name,
          oldIndex: live,
          newIndex: desired
        });
      }
    }
  }
}
