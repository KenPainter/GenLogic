import type { GenLogicSchema } from './types.js';
import type { ProcessedSchema, ProcessedTable } from './schema-processor.js';

/**
 * ContentManager - Handles insertion of seed data from 'content' sections
 *
 * Content rows are inserted only if they don't already exist (based on primary key check)
 */
export class ContentManager {
  /**
   * Generate INSERT statements for content sections
   * Only inserts rows that don't already exist based on primary key
   *
   * NOTE: Content inserts run AFTER all schema changes are complete,
   * so we can safely assume all columns exist
   */
  generateContentInserts(schema: GenLogicSchema, processedSchema: ProcessedSchema): string[] {
    const statements: string[] = [];

    if (!schema.tables || !processedSchema.tables) {
      return statements;
    }

    for (const [tableName, tableDef] of Object.entries(schema.tables)) {
      if (!tableDef.content || tableDef.content.length === 0) {
        continue;
      }

      const processedTable = processedSchema.tables[tableName];
      if (!processedTable) {
        console.warn(`⚠️  Warning: Table ${tableName} not found in processed schema, skipping content insertion`);
        continue;
      }

      // Find primary key columns
      const pkColumns = this.findPrimaryKeyColumns(processedTable);
      if (pkColumns.length === 0) {
        console.warn(`⚠️  Warning: Table ${tableName} has no primary key, skipping content insertion`);
        continue;
      }

      // Generate INSERT statements for each row
      for (const row of tableDef.content) {
        const statement = this.generateInsertStatement(tableName, row, pkColumns, processedTable);
        if (statement) {
          statements.push(statement);
        }
      }
    }

    return statements;
  }

  /**
   * Find primary key columns in a processed table
   */
  private findPrimaryKeyColumns(table: ProcessedTable): string[] {
    const pkColumns: string[] = [];

    for (const [columnName, columnDef] of Object.entries(table.columns)) {
      if (columnDef.primary_key) {
        pkColumns.push(columnName);
      }
    }

    return pkColumns;
  }

  /**
   * Generate a single INSERT statement with ON CONFLICT DO NOTHING
   * This ensures idempotent inserts - only adds rows that don't exist
   *
   * Supports $lookup for foreign key resolution:
   *   column_name:
   *     $lookup:
   *       table: target_table
   *       where: { col: value }
   *       column: id_column
   */
  private generateInsertStatement(
    tableName: string,
    row: Record<string, any>,
    pkColumns: string[],
    processedTable: ProcessedTable
  ): string | null {
    const columns = Object.keys(row);
    if (columns.length === 0) {
      return null;
    }

    const columnList = columns.join(', ');
    const valuePlaceholders = columns.map(col => this.formatValue(row[col])).join(', ');

    // Determine conflict target for ON CONFLICT clause
    let conflictClause = '';

    // Check if PK columns are included in the INSERT
    const pkColumnsInInsert = pkColumns.filter(pk => columns.includes(pk));

    if (pkColumnsInInsert.length === pkColumns.length) {
      // All PK columns are in the INSERT - use them for conflict detection
      conflictClause = `ON CONFLICT (${pkColumns.join(', ')}) DO NOTHING`;
    } else {
      // PK columns are missing (likely sequence) - look for unique columns
      const allColumns = { ...processedTable.columns, ...processedTable.generatedColumns };
      const uniqueColumns = columns.filter(col => {
        const columnDef = allColumns[col];
        return columnDef?.unique === true;
      });

      if (uniqueColumns.length > 0) {
        // Use unique columns for conflict detection
        conflictClause = `ON CONFLICT (${uniqueColumns.join(', ')}) DO NOTHING`;
      } else {
        // No unique columns and PK is sequence - skip ON CONFLICT
        // This means duplicates will cause an error, which may be desired behavior
        conflictClause = '';
      }
    }

    return `INSERT INTO ${tableName} (${columnList}) VALUES (${valuePlaceholders}) ${conflictClause};`;
  }

  /**
   * Format a value for SQL insertion
   * Supports $lookup objects for foreign key resolution
   */
  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }

    // Check for $lookup object
    if (typeof value === 'object' && '$lookup' in value) {
      return this.generateLookupSubquery(value.$lookup);
    }

    if (typeof value === 'string') {
      // Escape single quotes by doubling them
      const escaped = value.replace(/'/g, "''");
      return `'${escaped}'`;
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    if (typeof value === 'number') {
      return String(value);
    }

    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }

    // For objects/arrays, convert to JSON
    if (typeof value === 'object') {
      const escaped = JSON.stringify(value).replace(/'/g, "''");
      return `'${escaped}'::jsonb`;
    }

    // Default: convert to string
    return `'${String(value)}'`;
  }

  /**
   * Generate a SELECT subquery for $lookup
   * Example: (SELECT account_id FROM accounts WHERE account_code = 'PRIMARY_CHECKING')
   */
  private generateLookupSubquery(lookup: any): string {
    const table = lookup.table;
    const column = lookup.column;
    const where = lookup.where;

    if (!table || !column || !where) {
      throw new Error('$lookup requires table, column, and where properties');
    }

    // Build WHERE clause from the where object
    const whereConditions: string[] = [];
    for (const [col, val] of Object.entries(where)) {
      const formattedValue = this.formatValue(val);
      whereConditions.push(`${col} = ${formattedValue}`);
    }

    const whereClause = whereConditions.join(' AND ');

    return `(SELECT ${column} FROM ${table} WHERE ${whereClause})`;
  }

  /**
   * Validate content structure
   * Ensures all columns in content rows exist in the table definition
   */
  validateContent(schema: GenLogicSchema, processedSchema: ProcessedSchema): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!schema.tables || !processedSchema.tables) {
      return { isValid: true, errors: [] };
    }

    for (const [tableName, tableDef] of Object.entries(schema.tables)) {
      if (!tableDef.content || tableDef.content.length === 0) {
        continue;
      }

      const processedTable = processedSchema.tables[tableName];
      if (!processedTable) {
        errors.push(`Table '${tableName}' has content but is not defined in processed schema`);
        continue;
      }

      // Include both explicitly defined columns AND generated FK columns
      const validColumns = new Set([
        ...Object.keys(processedTable.columns),
        ...Object.keys(processedTable.generatedColumns)
      ]);

      // Check each row
      for (let i = 0; i < tableDef.content.length; i++) {
        const row = tableDef.content[i];
        const rowColumns = Object.keys(row);

        if (rowColumns.length === 0) {
          errors.push(`Table '${tableName}' content row ${i} is empty`);
          continue;
        }

        // Check all columns exist
        for (const col of rowColumns) {
          if (!validColumns.has(col)) {
            errors.push(`Table '${tableName}' content row ${i} references non-existent column '${col}'`);
          }

          // Validate $lookup references
          const value = row[col];
          if (value && typeof value === 'object' && '$lookup' in value) {
            const lookup = value.$lookup;

            // Validate $lookup structure
            if (!lookup.table || !lookup.column || !lookup.where) {
              errors.push(`Table '${tableName}' content row ${i}, column '${col}': $lookup requires table, column, and where properties`);
              continue;
            }

            // Validate lookup table exists
            if (!schema.tables?.[lookup.table]) {
              errors.push(`Table '${tableName}' content row ${i}, column '${col}': $lookup references non-existent table '${lookup.table}'`);
            } else {
              // Validate lookup column exists in target table
              const lookupTable = processedSchema.tables[lookup.table];
              if (lookupTable) {
                const lookupTableColumns = new Set([
                  ...Object.keys(lookupTable.columns),
                  ...Object.keys(lookupTable.generatedColumns)
                ]);

                if (!lookupTableColumns.has(lookup.column)) {
                  errors.push(`Table '${tableName}' content row ${i}, column '${col}': $lookup column '${lookup.column}' does not exist in table '${lookup.table}'`);
                }

                // Validate where columns exist
                if (typeof lookup.where === 'object') {
                  for (const whereCol of Object.keys(lookup.where)) {
                    if (!lookupTableColumns.has(whereCol)) {
                      errors.push(`Table '${tableName}' content row ${i}, column '${col}': $lookup where column '${whereCol}' does not exist in table '${lookup.table}'`);
                    }
                  }
                }
              }
            }
          }
        }

        // Check that all non-sequence primary key columns are provided
        // Sequence columns can be omitted and will be auto-generated
        const pkColumns = this.findPrimaryKeyColumns(processedTable);
        for (const pkCol of pkColumns) {
          // Check if this PK column has a sequence
          const allColumns = { ...processedTable.columns, ...processedTable.generatedColumns };
          const columnDef = allColumns[pkCol];
          const hasSequence = columnDef?.sequence === true;

          // Only require PK if it's NOT a sequence column
          if (!hasSequence && !(pkCol in row)) {
            errors.push(`Table '${tableName}' content row ${i} missing primary key column '${pkCol}'`);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}