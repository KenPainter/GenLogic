import type { ColumnDefinition } from './types.js';
import type {
  SchemaDiff,
  TableCreation,
  ColumnAddition,
  ForeignKeyAddition
} from './diff-engine.js';

/**
 * SQL Generation Engine
 *
 * GENLOGIC APPROACH: Generate DDL and trigger SQL from schema diff
 * This translates the data flow graph into executable PostgreSQL statements
 */
export class SQLGenerator {

  /**
   * Generate all SQL statements from schema diff
   */
  generateSQL(diff: SchemaDiff): SQLStatements {
    const statements: SQLStatements = {
      dropTriggers: [],
      createTables: [],
      addColumns: [],
      addForeignKeys: [],
      createIndexes: [],
      createTriggers: []
    };

    // 1. Drop all GenLogic triggers first to avoid conflicts
    for (const tableName of diff.triggersToRecreate) {
      statements.dropTriggers.push(this.generateDropTriggersSQL(tableName));
    }

    // 2. Create new tables
    for (const table of diff.tablesToCreate) {
      statements.createTables.push(this.generateCreateTableSQL(table));
    }

    // 3. Add new columns to existing tables
    for (const column of diff.columnsToAdd) {
      statements.addColumns.push(this.generateAddColumnSQL(column));
    }

    // 4. Add foreign key constraints
    for (const fk of diff.foreignKeysToAdd) {
      statements.addForeignKeys.push(this.generateAddForeignKeySQL(fk));
    }

    // 5. Create indexes (if any)
    for (const index of diff.indexesToCreate) {
      statements.createIndexes.push(this.generateCreateIndexSQL(index));
    }

    // 6. Create triggers will be added by TriggerGenerator

    return statements;
  }

  /**
   * Generate DROP TRIGGER statements for GenLogic triggers
   * Uses naming convention: <TABLE>_<INSERT|UPDATE|DELETE>_genlogic
   */
  private generateDropTriggersSQL(tableName: string): string {
    const triggerNames = [
      `${tableName}_insert_genlogic`,
      `${tableName}_update_genlogic`,
      `${tableName}_delete_genlogic`
    ];

    const dropStatements = triggerNames.map(triggerName =>
      `DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName};`
    );

    return dropStatements.join('\\n');
  }

  /**
   * Generate CREATE TABLE statement
   */
  private generateCreateTableSQL(table: TableCreation): string {
    const columnDefs: string[] = [];

    // Add all columns
    for (const column of table.columns) {
      columnDefs.push(this.generateColumnDefinition(column.name, column.definition));
    }

    // Add primary key constraint if any columns are marked as primary key
    const primaryKeyColumns = table.columns
      .filter(col => col.definition.primary_key)
      .map(col => col.name);

    if (primaryKeyColumns.length > 0) {
      columnDefs.push(`PRIMARY KEY (${primaryKeyColumns.join(', ')})`);
    }

    return `CREATE TABLE ${table.tableName} (\\n  ${columnDefs.join(',\\n  ')}\\n);`;
  }

  /**
   * Generate ALTER TABLE ADD COLUMN statement
   */
  private generateAddColumnSQL(column: ColumnAddition): string {
    const columnDef = this.generateColumnDefinition(column.columnName, column.definition);
    return `ALTER TABLE ${column.tableName} ADD COLUMN ${columnDef};`;
  }

  /**
   * Generate ALTER TABLE ADD CONSTRAINT for foreign key
   */
  private generateAddForeignKeySQL(fk: ForeignKeyAddition): string {
    // This would need to be expanded based on FK definition structure
    // For now, generating a placeholder
    return `-- ALTER TABLE ${fk.tableName} ADD CONSTRAINT ${fk.foreignKeyName} FOREIGN KEY (...) REFERENCES (...);`;
  }

  /**
   * Generate CREATE INDEX statement
   */
  private generateCreateIndexSQL(index: any): string {
    const uniqueKeyword = index.isUnique ? 'UNIQUE ' : '';
    const columnList = index.columns.join(', ');
    return `CREATE ${uniqueKeyword}INDEX ${index.indexName} ON ${index.tableName} (${columnList});`;
  }

  /**
   * Generate column definition for CREATE TABLE or ALTER TABLE
   */
  private generateColumnDefinition(columnName: string, definition: ColumnDefinition): string {
    let sql = `${columnName} ${this.getPostgreSQLType(definition)}`;

    // Add constraints (nullable not defined in ColumnDefinition yet)
    // sql += definition.nullable === false ? ' NOT NULL' : '';

    if (definition.unique && !definition.primary_key) {
      sql += ' UNIQUE';
    }

    if (definition.sequence) {
      // Handle sequences/auto-increment
      if (definition.type.toLowerCase().includes('int')) {
        sql = sql.replace(definition.type, 'SERIAL');
      }
    }

    return sql;
  }

  /**
   * Convert GenLogic type definition to PostgreSQL type
   */
  private getPostgreSQLType(definition: ColumnDefinition): string {
    let pgType = definition.type.toLowerCase();

    // Handle sized types
    if (definition.size) {
      if (definition.decimal !== undefined) {
        pgType += `(${definition.size}, ${definition.decimal})`;
      } else {
        pgType += `(${definition.size})`;
      }
    }

    // Convert common type aliases
    const typeMap: Record<string, string> = {
      'integer': 'INTEGER',
      'varchar': 'VARCHAR',
      'numeric': 'NUMERIC',
      'date': 'DATE',
      'timestamp': 'TIMESTAMP'
    };

    // Extract base type for mapping
    const baseType = pgType.split('(')[0];
    if (typeMap[baseType]) {
      pgType = pgType.replace(baseType, typeMap[baseType]);
    }

    return pgType.toUpperCase();
  }
}

export interface SQLStatements {
  dropTriggers: string[];
  createTables: string[];
  addColumns: string[];
  addForeignKeys: string[];
  createIndexes: string[];
  createTriggers: string[];
}