import type { ColumnDefinition } from './types.js';
import type {
  SchemaDiff,
  TableCreation,
  ColumnAddition,
  ColumnModification,
  ForeignKeyAddition
} from './diff-engine.js';
import type { ProcessedSchema } from './schema-processor.js';
import { parseAutomationString } from './automation-parser.js';

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
  generateSQL(diff: SchemaDiff, processedSchema: ProcessedSchema): SQLStatements {
    const statements: SQLStatements = {
      createTables: [],
      addColumns: [],
      modifyColumns: [],
      cleanupForeignKeys: [],
      addForeignKeys: [],
      createIndexes: [],
      createTriggers: [],
      addComments: []
    };

    // 1. Create new tables
    for (const table of diff.tablesToCreate) {
      statements.createTables.push(this.generateCreateTableSQL(table));

      // Add table comment if present
      if (table.comment) {
        statements.addComments.push(this.generateTableCommentSQL(table.tableName, table.comment));
      }

      // Add column comments if present
      for (const column of table.columns) {
        if (column.definition.comment) {
          statements.addComments.push(
            this.generateColumnCommentSQL(table.tableName, column.name, column.definition.comment)
          );
        }
      }
    }

    // 2. Add new columns to existing tables
    for (const column of diff.columnsToAdd) {
      statements.addColumns.push(this.generateAddColumnSQL(column));

      // Add column comment if present
      if (column.definition.comment) {
        statements.addComments.push(
          this.generateColumnCommentSQL(column.tableName, column.columnName, column.definition.comment)
        );
      }
    }

    // 2.5. Modify existing columns (safe expansions only)
    for (const column of diff.columnsToModify) {
      statements.modifyColumns.push(this.generateModifyColumnSQL(column));
    }

    // 3. Clean up orphaned FK values before adding FK constraints
    for (const fk of diff.foreignKeysToAdd) {
      statements.cleanupForeignKeys.push(this.generateCleanupForeignKeySQL(fk, processedSchema));
    }

    // 4. Add foreign key constraints
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
   * Generate ALTER TABLE ALTER COLUMN TYPE statement (safe expansions only)
   */
  private generateModifyColumnSQL(column: ColumnModification): string {
    return `ALTER TABLE "${column.tableName}" ALTER COLUMN "${column.columnName}" TYPE ${column.newType.toUpperCase()};`;
  }

  /**
   * Generate UPDATE statement to clean up orphaned FK values
   * Sets FK columns to NULL where they reference non-existent parent rows
   */
  private generateCleanupForeignKeySQL(fk: ForeignKeyAddition, processedSchema: ProcessedSchema): string {
    const referencedTable = fk.definition.table;

    // Build SET clause for all FK columns
    const setClause = fk.columnNames.map(col => `"${col}" = NULL`).join(', ');

    // Build WHERE clause to check for orphaned values
    // Only update rows where FK is not NULL and parent row doesn't exist
    const notNullConditions = fk.columnNames.map(col => `"${col}" IS NOT NULL`).join(' OR ');

    // Get the parent table's PK columns
    const parentTable = processedSchema.tables[referencedTable];
    if (!parentTable) {
      throw new Error(`Referenced table "${referencedTable}" not found in processed schema`);
    }

    // Find PK columns in parent table
    const parentPKColumns: string[] = [];
    for (const [colName, colDef] of Object.entries(parentTable.columns)) {
      if (colDef.primary_key) {
        parentPKColumns.push(colName);
      }
    }

    if (parentPKColumns.length === 0) {
      throw new Error(`No primary key found in table "${referencedTable}"`);
    }

    if (parentPKColumns.length !== fk.columnNames.length) {
      throw new Error(`FK column count (${fk.columnNames.length}) doesn't match parent PK column count (${parentPKColumns.length}) for ${fk.tableName}.${fk.fkName} -> ${referencedTable}`);
    }

    // Build EXISTS condition matching FK columns to parent PK columns
    // For single-column FK: child.fk_col = parent.pk_col
    // For composite FK: child.fk_col1 = parent.pk_col1 AND child.fk_col2 = parent.pk_col2
    const existsConditions = fk.columnNames.map((fkCol, idx) => {
      const pkCol = parentPKColumns[idx];
      return `"${fk.tableName}"."${fkCol}" = "${referencedTable}"."${pkCol}"`;
    }).join(' AND ');

    return `UPDATE "${fk.tableName}" SET ${setClause} WHERE (${notNullConditions}) AND NOT EXISTS (SELECT 1 FROM "${referencedTable}" WHERE ${existsConditions});`;
  }

  /**
   * Generate ALTER TABLE ADD CONSTRAINT for foreign key
   */
  private generateAddForeignKeySQL(fk: ForeignKeyAddition): string {
    const fkDef = fk.definition;
    const referencedTable = fkDef.table;
    const onDelete = fkDef.delete === 'cascade' ? 'CASCADE' : 'RESTRICT';

    // Use the column names from the FK addition
    const columnList = fk.columnNames.map(col => `"${col}"`).join(', ');

    // For composite FKs, we need to reference the corresponding PK columns
    // For now, assuming single-column FKs or that composite FKs reference matching PK columns
    // TODO: Handle explicit column references in FK definition
    return `ALTER TABLE "${fk.tableName}" ADD CONSTRAINT "${fk.foreignKeyName}" FOREIGN KEY (${columnList}) REFERENCES "${referencedTable}" ON DELETE ${onDelete};`;
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
    // Ensure type is defined
    if (!definition.type) {
      throw new Error(`Column '${columnName}' has no type defined. This should have been resolved during schema processing.`);
    }

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
      // Parse automation string to get the type
      let automationType: string | undefined;

      if (typeof definition.automation === 'string') {
        // Parse string format: "SUM @table.column" or "SUM(fk_name) @table.column"
        try {
          const parsed = parseAutomationString(definition.automation);
          automationType = parsed.type;
        } catch (e) {
          // If parsing fails, skip default value logic
          automationType = undefined;
        }
      } else if ('mode' in definition.automation) {
        // RULE_MATCH automation - skip default value logic
        automationType = undefined;
      }

      // Set defaults for aggregation types
      if (automationType && ['SUM', 'COUNT'].includes(automationType)) {
        // SUM and COUNT: default to 0
        const baseType = definition.type.toLowerCase();
        if (baseType === 'integer' || baseType === 'bigint' || baseType === 'smallint' || baseType === 'numeric') {
          sql += ' DEFAULT 0';
        } else if (baseType === 'varchar' || baseType === 'text') {
          sql += " DEFAULT ''";
        } else if (baseType === 'boolean') {
          sql += ' DEFAULT FALSE';
        }
      }
      // MAX and MIN: keep NULL default (will be set on first INSERT via trigger)
      // SNAPSHOT, SYNC, LAST_VALUE: keep NULL default
    }

    // Add constraints
    if (definition.not_null) {
      sql += ' NOT NULL';
    }

    if (definition.unique && !definition.primary_key) {
      sql += ' UNIQUE';
    }

    // INTEGRITY: Block NaN and Infinity for all numeric types
    // NaN and Infinity are NEVER valid in business applications
    if (this.isFloatingPointNumeric(definition.type)) {
      // NaN is the only value where x <> x, so "x = x" blocks NaN
      // abs(x) < 'Infinity' blocks both Infinity and -Infinity
      sql += ` CHECK ("${columnName}" IS NULL OR ("${columnName}" = "${columnName}" AND abs("${columnName}") < 'Infinity'::numeric))`;
    }

    // Add DEFAULT clause (but skip if automation/generated already handles the value)
    if (definition.default !== undefined && !definition.automation && !definition.generated) {
      // Determine if default value needs quotes
      const defaultValue = definition.default;
      if (defaultValue.match(/^-?\d+(\.\d+)?$/) || // number
          defaultValue.toLowerCase() === 'true' ||
          defaultValue.toLowerCase() === 'false' ||
          defaultValue.toLowerCase() === 'null' ||
          defaultValue.match(/\w+\(.*\)$/)) { // function call
        sql += ` DEFAULT ${defaultValue}`;
      } else {
        sql += ` DEFAULT '${defaultValue}'`;
      }
    }

    return sql;
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

    // Convert common type aliases and normalized multi-word types
    const typeMap: Record<string, string> = {
      'integer': 'INTEGER',
      'varchar': 'VARCHAR',
      'numeric': 'NUMERIC',
      'date': 'DATE',
      'timestamp': 'TIMESTAMP',
      'double_precision': 'DOUBLE PRECISION'  // Restore multi-word type
    };

    // Extract base type for mapping
    const baseType = pgType.split('(')[0];
    if (typeMap[baseType]) {
      pgType = pgType.replace(baseType, typeMap[baseType]);
    }

    return pgType.toUpperCase();
  }

  /**
   * Generate COMMENT ON TABLE statement
   */
  private generateTableCommentSQL(tableName: string, description: string): string {
    const escapedDescription = description.replace(/'/g, "''");
    return `COMMENT ON TABLE "${tableName}" IS '${escapedDescription}';`;
  }

  /**
   * Generate COMMENT ON COLUMN statement
   */
  private generateColumnCommentSQL(tableName: string, columnName: string, description: string): string {
    const escapedDescription = description.replace(/'/g, "''");
    return `COMMENT ON COLUMN "${tableName}"."${columnName}" IS '${escapedDescription}';`;
  }
}

export interface SQLStatements {
  createTables: string[];
  addColumns: string[];
  modifyColumns: string[];
  cleanupForeignKeys: string[];
  addForeignKeys: string[];
  createIndexes: string[];
  createTriggers: string[];
  addComments: string[];
}