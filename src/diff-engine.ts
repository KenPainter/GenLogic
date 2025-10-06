import type {
  DatabaseTable,
  ColumnDefinition
} from './types.js';
import type { ProcessedSchema, ProcessedTable } from './schema-processor.js';

/**
 * Schema Diff Engine
 *
 * GENLOGIC PRINCIPLE: Only add, never delete
 * Compare desired schema against current database and generate safe incremental changes
 */
export class DiffEngine {

  /**
   * Generate complete diff between desired and current schema
   */
  generateDiff(
    desiredSchema: ProcessedSchema,
    currentSchema: Record<string, DatabaseTable>
  ): SchemaDiff {
    const diff: SchemaDiff = {
      tablesToCreate: [],
      columnsToAdd: [],
      indexesToCreate: [],
      foreignKeysToAdd: [],
      triggersToRecreate: []
    };

    // Process each desired table
    for (const [tableName, desiredTable] of Object.entries(desiredSchema.tables)) {
      const currentTable = currentSchema[tableName];

      if (!currentTable) {
        // Table doesn't exist - create it with all columns
        diff.tablesToCreate.push({
          tableName,
          comment: desiredTable.comment,
          columns: this.getAllTableColumns(desiredTable),
          foreignKeys: desiredTable.foreignKeys
        });

        // Create indexes for foreign key columns
        for (const [fkName] of Object.entries(desiredTable.foreignKeys)) {
          // Get the FK column names from the mapping
          const columnNames = desiredTable.fkColumnMapping[fkName] || [fkName];

          diff.indexesToCreate.push({
            tableName,
            indexName: `idx_${tableName}_${columnNames.join('_')}`,
            columns: columnNames,
            isUnique: false
          });
        }
      } else {
        // Table exists - check for new columns
        const newColumns = this.findNewColumns(desiredTable, currentTable);
        for (const column of newColumns) {
          diff.columnsToAdd.push({
            tableName,
            columnName: column.name,
            definition: column.definition
          });
        }

        // Check for new foreign keys
        const newForeignKeys = this.findNewForeignKeys(desiredTable, currentTable);
        for (const fk of newForeignKeys) {
          diff.foreignKeysToAdd.push({
            tableName,
            foreignKeyName: fk.name,
            fkName: fk.fkName,
            definition: fk.definition,
            columnNames: fk.columnNames
          });

          // Create index for the new FK column(s)
          diff.indexesToCreate.push({
            tableName,
            indexName: `idx_${tableName}_${fk.columnNames.join('_')}`,
            columns: fk.columnNames,
            isUnique: false
          });
        }
      }

      // Always recreate GenLogic triggers (they get dropped first)
      diff.triggersToRecreate.push(tableName);
    }

    return diff;
  }

  /**
   * Get all columns for a table (explicit + generated FK columns)
   */
  private getAllTableColumns(table: ProcessedTable): Array<{name: string, definition: ColumnDefinition}> {
    const columns: Array<{name: string, definition: ColumnDefinition}> = [];

    // Add explicit columns
    for (const [name, definition] of Object.entries(table.columns)) {
      columns.push({ name, definition });
    }

    // Add generated FK columns
    for (const [name, definition] of Object.entries(table.generatedColumns)) {
      columns.push({ name, definition });
    }

    return columns;
  }

  /**
   * Find columns that exist in desired schema but not in current database
   */
  private findNewColumns(
    desiredTable: ProcessedTable,
    currentTable: DatabaseTable
  ): Array<{name: string, definition: ColumnDefinition}> {
    const newColumns: Array<{name: string, definition: ColumnDefinition}> = [];
    const currentColumnNames = new Set(currentTable.columns.map(col => col.name));

    // Check explicit columns
    for (const [name, definition] of Object.entries(desiredTable.columns)) {
      if (!currentColumnNames.has(name)) {
        newColumns.push({ name, definition });
      }
    }

    // Check generated FK columns
    for (const [name, definition] of Object.entries(desiredTable.generatedColumns)) {
      if (!currentColumnNames.has(name)) {
        newColumns.push({ name, definition });
      }
    }

    return newColumns;
  }

  /**
   * Find foreign keys that exist in desired schema but not in current database
   */
  private findNewForeignKeys(
    desiredTable: ProcessedTable,
    currentTable: DatabaseTable
  ): Array<{name: string, fkName: string, definition: any, columnNames: string[]}> {
    const newForeignKeys: Array<{name: string, fkName: string, definition: any, columnNames: string[]}> = [];
    const currentFKNames = new Set(currentTable.foreignKeys.map(fk => fk.name));

    for (const [fkName, definition] of Object.entries(desiredTable.foreignKeys)) {
      // Generate a consistent FK constraint name
      const constraintName = `fk_${currentTable.name}_${fkName}`;
      if (!currentFKNames.has(constraintName)) {
        // Get the column names for this FK from the mapping
        const columnNames = desiredTable.fkColumnMapping[fkName] || [fkName];
        newForeignKeys.push({
          name: constraintName,
          fkName,
          definition,
          columnNames
        });
      }
    }

    return newForeignKeys;
  }
}

// Diff result types
export interface SchemaDiff {
  tablesToCreate: TableCreation[];
  columnsToAdd: ColumnAddition[];
  indexesToCreate: IndexCreation[];
  foreignKeysToAdd: ForeignKeyAddition[];
  triggersToRecreate: string[]; // Table names that need trigger recreation
}

export interface TableCreation {
  tableName: string;
  comment?: string;
  columns: Array<{name: string, definition: ColumnDefinition}>;
  foreignKeys: Record<string, any>;
}

export interface ColumnAddition {
  tableName: string;
  columnName: string;
  definition: ColumnDefinition;
}

export interface IndexCreation {
  tableName: string;
  indexName: string;
  columns: string[];
  isUnique: boolean;
}

export interface ForeignKeyAddition {
  tableName: string;
  foreignKeyName: string;
  fkName: string;
  definition: any;
  columnNames: string[];
}