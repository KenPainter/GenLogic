/**
 * NewSchema Diff Engine
 *
 * GENLOGIC PRINCIPLE: Apples-to-apples comparison
 * Both desired and live schemas are NewSchema instances with identical structure
 * This makes diffing straightforward and reliable
 */

import type { NewSchema } from './new-schema.js';
import type { TableDef, ForeignKeyDef, ConstraintDef, UniqueConstraintDef, IndexDef } from './new-schema-subtypes.js';

export interface NewSchemaDiff {
  tablesToCreate: string[];
  tablesToDrop: string[];
  columnsToAdd: Array<{ table: string; column: string; definition: string }>;
  columnsToModify: Array<{ table: string; column: string; oldDef: string; newDef: string }>;
  columnsToDrop: Array<{ table: string; column: string }>;
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
    indexesToModify: []
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

  // Find columns to add
  for (const colName of desiredColNames) {
    if (!liveColNames.has(colName)) {
      diff.columnsToAdd.push({
        table: tableName,
        column: colName,
        definition: desiredColumns[colName].normalizedDef || desiredColumns[colName].definition
      });
    }
  }

  // Find columns to drop
  for (const colName of liveColNames) {
    if (!desiredColNames.has(colName)) {
      diff.columnsToDrop.push({
        table: tableName,
        column: colName
      });
    }
  }

  // Find columns to modify
  for (const colName of desiredColNames) {
    if (liveColNames.has(colName)) {
      // Compare using normalizedDef for apples-to-apples comparison
      const desiredDef = desiredColumns[colName].normalizedDef || desiredColumns[colName].definition;
      const liveDef = liveColumns[colName].definition; // Live always uses definition

      if (desiredDef !== liveDef) {
        diff.columnsToModify.push({
          table: tableName,
          column: colName,
          oldDef: liveDef,
          newDef: desiredDef
        });
      }
    }
  }
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
 * Compare CHECK constraints between desired and live table
 * Compares by constraint_definition (substance), not by name
 */
function diffConstraints(
  tableName: string,
  desiredTable: TableDef,
  liveTable: TableDef,
  diff: NewSchemaDiff
): void {
  const desiredConstraints = desiredTable.constraints || {};
  const liveConstraints = liveTable.constraints || {};

  // Build sets of constraint definitions (substance, not names)
  const desiredDefs = new Set<string>();
  const liveDefs = new Set<string>();
  const desiredByDef = new Map<string, ConstraintDef>();
  const liveByDef = new Map<string, ConstraintDef>();

  for (const constraint of Object.values(desiredConstraints)) {
    desiredDefs.add(constraint.constraint_definition);
    desiredByDef.set(constraint.constraint_definition, constraint);
  }

  for (const constraint of Object.values(liveConstraints)) {
    liveDefs.add(constraint.constraint_definition);
    liveByDef.set(constraint.constraint_definition, constraint);
  }

  // Find constraints to add (definition in desired, not in live)
  for (const def of desiredDefs) {
    if (!liveDefs.has(def)) {
      diff.constraintsToAdd.push({
        table: tableName,
        constraint: desiredByDef.get(def)!
      });
    }
  }

  // Find constraints to drop (definition in live, not in desired)
  for (const def of liveDefs) {
    if (!desiredDefs.has(def)) {
      diff.constraintsToDrop.push({
        table: tableName,
        constraint: liveByDef.get(def)!
      });
    }
  }

  // No need to check for modifications - if definitions match, they're identical
  // Names don't matter - we compare by substance
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
