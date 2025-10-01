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
   * NOTE: Trigger drops are now handled by DatabaseManager.generateDropAllGenLogicTriggersSQL()
   */
  generateSQL(diff: SchemaDiff): SQLStatements {
    const statements: SQLStatements = {
      createTables: [],
      addColumns: [],
      addForeignKeys: [],
      createIndexes: [],
      createTriggers: []
    };

    // 1. Create new tables
    for (const table of diff.tablesToCreate) {
      statements.createTables.push(this.generateCreateTableSQL(table));
    }

    // 2. Add new columns to existing tables
    for (const column of diff.columnsToAdd) {
      statements.addColumns.push(this.generateAddColumnSQL(column));
    }

    // 3. Add foreign key constraints
    for (const fk of diff.foreignKeysToAdd) {
      statements.addForeignKeys.push(this.generateAddForeignKeySQL(fk));
    }

    // 4. Create indexes (if any)
    for (const index of diff.indexesToCreate) {
      statements.createIndexes.push(this.generateCreateIndexSQL(index));
    }

    // 5. Create triggers will be added by TriggerGenerator

    return statements;
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
      .map(col => `"${col.name}"`);

    if (primaryKeyColumns.length > 0) {
      columnDefs.push(`PRIMARY KEY (${primaryKeyColumns.join(', ')})`);
    }

    return `CREATE TABLE "${table.tableName}" (\n  ${columnDefs.join(',\n  ')}\n);`;
  }

  /**
   * Generate ALTER TABLE ADD COLUMN statement
   */
  private generateAddColumnSQL(column: ColumnAddition): string {
    const columnDef = this.generateColumnDefinition(column.columnName, column.definition);
    return `ALTER TABLE "${column.tableName}" ADD COLUMN ${columnDef};`;
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
    const columnList = index.columns.map((col: string) => `"${col}"`).join(', ');
    return `CREATE ${uniqueKeyword}INDEX "${index.indexName}" ON "${index.tableName}" (${columnList});`;
  }

  /**
   * Generate column definition for CREATE TABLE or ALTER TABLE
   */
  private generateColumnDefinition(columnName: string, definition: ColumnDefinition): string {
    // Handle sequences/auto-increment - must be done before type conversion
    let pgType: string;
    if (definition.sequence && definition.type.toLowerCase().includes('int')) {
      // Use SERIAL types for integer columns with sequence
      if (definition.type.toLowerCase() === 'bigint') {
        pgType = 'BIGSERIAL';
      } else if (definition.type.toLowerCase() === 'smallint') {
        pgType = 'SMALLSERIAL';
      } else {
        pgType = 'SERIAL';
      }
    } else {
      pgType = this.getPostgreSQLType(definition);
    }

    let sql = `"${columnName}" ${pgType}`;

    // Add DEFAULT values for aggregation automations (hybrid approach)
    if (definition.automation) {
      const automationType = definition.automation.type;
      const isAggregation = ['SUM', 'COUNT', 'MAX', 'MIN'].includes(automationType);

      if (isAggregation) {
        const baseType = definition.type.toLowerCase();

        if (baseType === 'integer' || baseType === 'bigint' || baseType === 'smallint' || baseType === 'numeric') {
          sql += ' DEFAULT 0';
        } else if (baseType === 'varchar' || baseType === 'text') {
          sql += " DEFAULT ''";
        } else if (baseType === 'boolean') {
          sql += ' DEFAULT FALSE';
        }
      }
      // FETCH, FETCH_UPDATES, LATEST, calculated columns: keep NULL default
    }

    // Add constraints (nullable not defined in ColumnDefinition yet)
    // sql += definition.nullable === false ? ' NOT NULL' : '';

    if (definition.unique && !definition.primary_key) {
      sql += ' UNIQUE';
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
  createTables: string[];
  addColumns: string[];
  addForeignKeys: string[];
  createIndexes: string[];
  createTriggers: string[];
}