/**
 * Assertion matcher for GenLogic test outputs
 * Supports named key access for arrays (e.g., columns.balance.automation)
 */

export interface Assertions {
  flatten?: Record<string, any>;
  processed?: Record<string, any>;
  diffed?: Record<string, any>;
}

export interface FlattenedSchema {
  reusableColumns: any[];
  tables: any[];
  columns: any[];
  foreignKeys: any[];
  automations: any[];
  indexes: any[];
  uniqueConstraints: any[];
  checkConstraints: any[];
  seedRows: any[];
}

/**
 * Match assertions against a flattened schema output
 */
export function matchFlattenAssertions(
  actual: FlattenedSchema,
  assertions: Record<string, any>
): { pass: boolean; failures: string[] } {
  const failures: string[] = [];

  for (const [path, expectedValue] of Object.entries(assertions)) {
    const result = getValueByPath(actual, path);

    if (result.error) {
      failures.push(`${path}: ${result.error}`);
      continue;
    }

    // Special case: true means "just check existence"
    if (expectedValue === true) {
      if (result.value === undefined) {
        failures.push(`${path}: expected to exist but not found`);
      }
      continue;
    }

    // Deep equality check
    if (JSON.stringify(result.value) !== JSON.stringify(expectedValue)) {
      failures.push(
        `${path}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(result.value)}`
      );
    }
  }

  return {
    pass: failures.length === 0,
    failures
  };
}

/**
 * Get a value from a flattened schema by dotted path
 * Examples:
 *   - tables.accounts → find table with name "accounts"
 *   - columns.balance.automation → find column with name "balance", get automation
 *   - foreignKeys.accounts.childColumn → find FK with fkName "accounts", get childColumn
 *   - reusableColumns.amount.format → find reusable column with name "amount", get format
 *   - automations.accounts.balance.automation → find automation for accounts.balance
 */
function getValueByPath(
  data: FlattenedSchema,
  path: string
): { value: any; error?: string } {
  const parts = path.split('.');

  if (parts.length === 0) {
    return { value: undefined, error: 'Empty path' };
  }

  const topLevel = parts[0];

  // Handle top-level arrays with named access
  switch (topLevel) {
    case 'tables':
      return getTableValue(data.tables, parts.slice(1));

    case 'columns':
      return getColumnValue(data.columns, parts.slice(1));

    case 'reusableColumns':
      return getReusableColumnValue(data.reusableColumns, parts.slice(1));

    case 'foreignKeys':
      return getForeignKeyValue(data.foreignKeys, parts.slice(1));

    case 'automations':
      return getAutomationValue(data.automations, parts.slice(1));

    case 'indexes':
    case 'uniqueConstraints':
    case 'checkConstraints':
    case 'seedRows':
      // For now, these don't have named access
      return { value: undefined, error: `Named access not implemented for ${topLevel}` };

    default:
      // Direct property access
      return { value: (data as any)[topLevel] };
  }
}

function getTableValue(tables: any[], parts: string[]): { value: any; error?: string } {
  if (parts.length === 0) {
    return { value: tables };
  }

  const tableName = parts[0];
  const table = tables.find(t => t.name === tableName);

  if (!table) {
    return { value: undefined };
  }

  if (parts.length === 1) {
    // Just checking existence: tables.accounts
    return { value: table };
  }

  // Access property: tables.accounts.someProp
  return getNestedValue(table, parts.slice(1));
}

function getColumnValue(columns: any[], parts: string[]): { value: any; error?: string } {
  if (parts.length === 0) {
    return { value: columns };
  }

  const columnName = parts[0];
  const column = columns.find(c => c.columnName === columnName);

  if (!column) {
    return { value: undefined };
  }

  if (parts.length === 1) {
    return { value: column };
  }

  // Access property: columns.balance.automation
  return getNestedValue(column, parts.slice(1));
}

function getReusableColumnValue(reusableColumns: any[], parts: string[]): { value: any; error?: string } {
  if (parts.length === 0) {
    return { value: reusableColumns };
  }

  const name = parts[0];
  const reusableCol = reusableColumns.find(rc => rc.name === name);

  if (!reusableCol) {
    return { value: undefined };
  }

  if (parts.length === 1) {
    return { value: reusableCol };
  }

  // Access property: reusableColumns.amount.format
  return getNestedValue(reusableCol, parts.slice(1));
}

function getForeignKeyValue(foreignKeys: any[], parts: string[]): { value: any; error?: string } {
  if (parts.length === 0) {
    return { value: foreignKeys };
  }

  const fkName = parts[0];
  const fk = foreignKeys.find(f => f.fkName === fkName);

  if (!fk) {
    return { value: undefined };
  }

  if (parts.length === 1) {
    return { value: fk };
  }

  // Access property: foreignKeys.accounts.childColumn
  return getNestedValue(fk, parts.slice(1));
}

function getAutomationValue(automations: any[], parts: string[]): { value: any; error?: string } {
  if (parts.length === 0) {
    return { value: automations };
  }

  if (parts.length < 2) {
    return { value: undefined, error: 'automations requires tableName.columnName' };
  }

  const tableName = parts[0];
  const columnName = parts[1];
  const automation = automations.find(
    a => a.tableName === tableName && a.columnName === columnName
  );

  if (!automation) {
    return { value: undefined };
  }

  if (parts.length === 2) {
    return { value: automation };
  }

  // Access property: automations.accounts.balance.automation
  return getNestedValue(automation, parts.slice(2));
}

function getNestedValue(obj: any, parts: string[]): { value: any; error?: string } {
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return { value: undefined };
    }
    current = current[part];
  }

  return { value: current };
}
