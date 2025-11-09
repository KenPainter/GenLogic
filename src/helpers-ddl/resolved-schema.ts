import type { NewSchema } from '../new-schema.js';

/**
 * Generate resolved schema documentation
 *
 * Creates a TypeScript file showing the actual database structure
 * after GenLogic processing, with guidance on what is writable vs automated.
 * Can be imported by other code for runtime access to schema metadata.
 */
export function generateResolvedSchema(newSchema: NewSchema, sourceFile: string, database: string): string {
  const resolved: any = {
    _metadata: {
      generated_at: new Date().toISOString(),
      source_schema: sourceFile,
      database: database,
      genlogic_version: '2.0.0',
      note: 'This describes the ACTUAL database structure after GenLogic processing'
    },
    tables: {}
  };

  // Process each table
  for (const [tableName, table] of Object.entries(newSchema.tables)) {
    if (!table.columns) continue;

    resolved.tables[tableName] = {
      _table_info: generateTableInfo(tableName, table),
      columns: {}
    };

    // Add indexes if present
    if (table.indexes && table.indexes.length > 0) {
      resolved.tables[tableName].indexes = table.indexes.map((cols: string[]) => ({
        columns: cols
      }));
    }

    // Add unique constraints if present
    if (table.uniqueConstraints && table.uniqueConstraints.length > 0) {
      resolved.tables[tableName].unique_constraints = table.uniqueConstraints.map((cols: string[]) => ({
        columns: cols
      }));
    }

    // Process each column
    for (const [columnName, columnDef] of Object.entries(table.columns)) {
      resolved.tables[tableName].columns[columnName] = generateColumnDoc(
        columnName,
        columnDef,
        tableName,
        table
      );
    }
  }

  // Add usage guide
  resolved._usage_guide = generateUsageGuide();

  // Convert to TypeScript module
  return generateTypeScriptModule(resolved);
}

/**
 * Generate table-level information
 */
function generateTableInfo(tableName: string, table: any): any {
  const hasFormulas = Object.values(table.columns || {}).some(
    (col: any) => col.formula
  );

  const hasAutomations = Object.values(table.columns || {}).some(
    (col: any) => col.automationType
  );

  const info: any = {
    layer: table.layer,
    has_triggers: hasFormulas || hasAutomations,
    has_formulas: hasFormulas,
    has_aggregations: hasAutomations,
    foreign_key_count: Object.keys(table.foreignKeys || {}).length
  };

  if (table.comment) {
    info.comment = table.comment;
  }

  if (table.singleton) {
    info.singleton = true;
    info.note = 'This table should contain exactly one row';
  }

  return info;
}

/**
 * Generate documentation for a single column
 */
function generateColumnDoc(
  columnName: string,
  columnDef: any,
  tableName: string,
  table: any
): any {
  const doc: any = {
    type: columnDef.sqlType || columnDef.definition || 'unknown'
  };

  // Add comment if present
  if (columnDef.comment) {
    doc.comment = columnDef.comment;
  }

  // Add label and format if present
  if (columnDef.label) {
    doc.label = columnDef.label;
  }
  if (columnDef.format) {
    doc.format = columnDef.format;
  }

  // Add key flags
  if (columnDef.isPrimaryKey) {
    doc.primary_key = true;
  }
  if (columnDef.isUnique) {
    doc.unique = true;
  }

  // Nullable
  doc.nullable = columnDef.nullable !== false;

  // Default value
  if (columnDef.default !== undefined) {
    doc.default = columnDef.default;
  }

  // Determine writability
  const writability = determineWritability(columnName, columnDef, tableName, table);
  Object.assign(doc, writability);

  return doc;
}

/**
 * Determine column writability and behavior
 */
function determineWritability(
  columnName: string,
  columnDef: any,
  tableName: string,
  table: any
): any {
  // Case 1: Formula column
  if (columnDef.formula) {
    return {
      controlled_by: 'database server',
      computation: 'formula',
      formula: columnDef.formula,
      trigger: `${tableName}_before_insert_genlogic, ${tableName}_before_update_genlogic`,
      note: 'Recalculated automatically on every INSERT/UPDATE'
    };
  }

  // Case 2: SYNC automation
  if (columnDef.automationType === 'SYNC') {
    return {
      controlled_by: 'database server',
      computation: 'sync',
      source: `${columnDef.automationSourceTable}.${columnDef.automationSourceColumn}`,
      trigger_pull: `${tableName}_before_insert_genlogic, ${tableName}_before_update_genlogic`,
      trigger_push: `${columnDef.automationSourceTable}_before_update_genlogic`,
      note: 'Synchronized with parent table - pulled on INSERT/UPDATE, pushed when parent changes'
    };
  }

  // Case 3: Aggregation (SUM, COUNT, MIN, MAX)
  if (columnDef.automationType) {
    const operation = columnDef.automationType;
    const sourceTable = columnDef.automationSourceTable;
    const sourceColumn = columnDef.automationSourceColumn;

    return {
      controlled_by: 'database server',
      computation: 'aggregation',
      operation: operation,
      source: `${sourceTable}.${sourceColumn}`,
      trigger: `${sourceTable}_before_insert_genlogic, ${sourceTable}_before_update_genlogic, ${sourceTable}_before_delete_genlogic`,
      note: `Aggregates ${operation} from child table ${sourceTable}`
    };
  }

  // Case 4: Foreign key column
  const isFKColumn = Object.values(table.foreignKeys || {}).some(
    (fk: any) => fk.childColumn === columnName
  );

  if (isFKColumn) {
    // Find the FK details
    const fk = Object.values(table.foreignKeys || {}).find(
      (fk: any) => fk.childColumn === columnName
    ) as any;

    return {
      controlled_by: 'client application',
      foreign_key: true,
      references: `${fk.parentTable}.${fk.parentColumn}`,
      note: `Must reference an existing row in ${fk.parentTable}`
    };
  }

  // Case 5: Primary key
  if (columnDef.isPrimaryKey) {
    if (columnDef.sqlType?.toUpperCase().includes('SERIAL')) {
      return {
        controlled_by: 'database server',
        auto_increment: true,
        note: 'Auto-generated by database sequence'
      };
    } else {
      return {
        controlled_by: 'client application',
        note: 'Must be provided by application on INSERT'
      };
    }
  }

  // Case 6: Regular user column
  return {
    controlled_by: 'client application'
  };
}

/**
 * Generate usage guide
 */
function generateUsageGuide(): any {
  return {
    philosophy: `GenLogic implements "Augmented Normalization":
- Write normalized data (base tables, raw transactions)
- Read denormalized data (aggregations pre-calculated)
- Application NEVER calculates aggregations or formulas
- Database maintains ALL computed values via triggers
- Zero application business logic = zero bugs`,

    insert_pattern: `To insert data, only include columns where controlled_by = "client application".

Example:
  INSERT INTO accounts (account_name, category) VALUES ('Checking', 'Asset');

❌ WRONG - don't set database-controlled columns:
  INSERT INTO accounts (account_name, category, debits, balance) VALUES (...);

The balance and debits will be calculated automatically by triggers.`,

    update_pattern: `To update data, only modify columns where controlled_by = "client application".

Example:
  UPDATE accounts SET category = 'Liability' WHERE account_id = 5;

❌ WRONG - don't update database-controlled columns:
  UPDATE accounts SET balance = 1000 WHERE account_id = 5;  -- Will be overwritten!

If you need to change an aggregation, change the source data (child rows).`,

    query_pattern: `All columns are readable. Automated columns are always current.

Example:
  SELECT account_name, category, balance, debits, credits
  FROM accounts
  WHERE category = 'Asset';

The balance, debits, and credits are ALWAYS up-to-date due to triggers.`,

    repair_script: `If aggregations become corrupted (e.g., manual data edits), run the repair script:

  psql -d database_name -f schema.repair.sql

This will recalculate ALL formula and aggregation columns from scratch.`,

    protection: `To prevent corruption, consider:
1. Grant UPDATE only on "client application" columns
2. Run repair script periodically as verification
3. Use row-level security for sensitive data
4. Monitor for direct UPDATEs to automated columns`
  };
}

/**
 * Convert resolved schema object to TypeScript module
 */
function generateTypeScriptModule(resolved: any): string {
  const lines: string[] = [];

  lines.push('/**');
  lines.push(' * Resolved Schema - Auto-generated by GenLogic');
  lines.push(' *');
  lines.push(` * Generated: ${resolved._metadata.generated_at}`);
  lines.push(` * Source: ${resolved._metadata.source_schema}`);
  lines.push(` * Database: ${resolved._metadata.database}`);
  lines.push(' *');
  lines.push(' * This file documents the ACTUAL database structure after GenLogic processing.');
  lines.push(' * Import this to access schema metadata at runtime.');
  lines.push(' */');
  lines.push('');
  lines.push('export const resolvedSchema = ' + formatObjectAsTypeScript(resolved, 0) + ' as const;');
  lines.push('');
  lines.push('export type ResolvedSchema = typeof resolvedSchema;');
  lines.push('');
  lines.push('// Helper type to extract table names');
  lines.push('export type TableName = keyof typeof resolvedSchema.tables;');
  lines.push('');
  lines.push('// Helper type to extract column names for a table');
  lines.push('export type ColumnName<T extends TableName> = keyof (typeof resolvedSchema.tables)[T]["columns"];');
  lines.push('');
  lines.push('// Helper to get writable columns for a table');
  lines.push('export function getWritableColumns(tableName: TableName): string[] {');
  lines.push('  const table = (resolvedSchema.tables as any)[tableName];');
  lines.push('  return Object.entries(table.columns)');
  lines.push('    .filter(([_, col]: [string, any]) => col.controlled_by === "client application")');
  lines.push('    .map(([name]) => name);');
  lines.push('}');
  lines.push('');
  lines.push('// Helper to check if column is database-controlled');
  lines.push('export function isComputedColumn(tableName: TableName, columnName: string): boolean {');
  lines.push('  const table = (resolvedSchema.tables as any)[tableName];');
  lines.push('  const col = table.columns[columnName];');
  lines.push('  return col?.controlled_by === "database server";');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

/**
 * Format JavaScript object as TypeScript literal with proper indentation
 */
function formatObjectAsTypeScript(obj: any, indent: number): string {
  const spaces = '  '.repeat(indent);
  const innerSpaces = '  '.repeat(indent + 1);

  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj === 'string') {
    // Escape special characters and use template literals for multi-line strings
    const escaped = obj
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');

    if (obj.includes('\n')) {
      return '`' + escaped + '`';
    }
    return JSON.stringify(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      return '[]';
    }
    const items = obj.map(item =>
      innerSpaces + formatObjectAsTypeScript(item, indent + 1)
    );
    return '[\n' + items.join(',\n') + '\n' + spaces + ']';
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) {
      return '{}';
    }

    const props = entries.map(([key, value]) => {
      const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
      return innerSpaces + safeKey + ': ' + formatObjectAsTypeScript(value, indent + 1);
    });

    return '{\n' + props.join(',\n') + '\n' + spaces + '}';
  }

  return 'null';
}
