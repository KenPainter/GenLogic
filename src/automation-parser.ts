import type { AutomationDefinition, ParsedStandardAutomation, RuleMatchAutomationDefinition, GenLogicSchema } from './types.js';

/**
 * Parses automation string format into internal normalized format
 *
 * Supported formats:
 * - "SUM @table.column"
 * - "COUNT(fk_name) @table.column"
 * - "MAX @table.column"
 * - etc.
 *
 * The @ prefix marks column references consistently across GenLogic
 *
 * Returns ParsedStandardAutomation with type, table, column, and optional foreign_key
 */
export function parseAutomationString(automation: string): ParsedStandardAutomation {
  // Pattern: TYPE(optional_fk) @table.column WHERE optional_condition
  const pattern = /^(SUM|COUNT|MAX|MIN|LAST_VALUE|SNAPSHOT|SYNC|DOMINANT|QUEUEPOS)(?:\(([a-zA-Z_][a-zA-Z0-9_]*)\))?\s+@([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+WHERE\s+(.+))?$/;

  const match = automation.match(pattern);

  if (!match) {
    throw new Error(`Invalid automation format: "${automation}". Expected format: "TYPE @table.column" or "TYPE(fk_name) @table.column WHERE condition"`);
  }

  const [, type, foreign_key, table, column, whereClause] = match;

  const parsed: ParsedStandardAutomation = {
    type: type as ParsedStandardAutomation['type'],
    table,
    column,
  };

  if (foreign_key) {
    parsed.foreign_key = foreign_key;
  }

  if (whereClause) {
    parsed.whereClause = whereClause.trim();
  }

  return parsed;
}

/**
 * Normalizes any AutomationDefinition into ParsedStandardAutomation or RuleMatchAutomationDefinition
 */
export function normalizeAutomation(
  automation: AutomationDefinition
): ParsedStandardAutomation | RuleMatchAutomationDefinition {
  if (typeof automation === 'string') {
    return parseAutomationString(automation);
  }

  // Already a RuleMatchAutomationDefinition
  return automation;
}

/**
 * Infers the foreign key name for an automation when not explicitly provided
 *
 * Logic:
 * - Find all FKs in the child table that reference the parent table
 * - If exactly one FK exists, return it
 * - If zero FKs exist, throw error (invalid reference)
 * - If multiple FKs exist, throw error (ambiguous - must specify FK explicitly)
 *
 * @param childTableName - Table that HAS the foreign key
 * @param parentTableName - Table that the foreign key REFERENCES
 */
export function inferForeignKey(
  childTableName: string,
  parentTableName: string,
  schema: GenLogicSchema
): string {
  const childTable = schema.tables?.[childTableName];

  if (!childTable) {
    throw new Error(`Child table "${childTableName}" not found in schema`);
  }

  if (!childTable.foreign_keys) {
    throw new Error(`Child table "${childTableName}" has no foreign keys`);
  }

  // Find all FKs that reference the parent table
  const matchingFKs: string[] = [];

  for (const [fkName, fkDef] of Object.entries(childTable.foreign_keys)) {
    const targetTable = typeof fkDef === 'string' ? fkDef : fkDef.table;

    if (targetTable === parentTableName) {
      matchingFKs.push(fkName);
    }
  }

  if (matchingFKs.length === 0) {
    throw new Error(
      `Cannot infer foreign key: table "${childTableName}" has no foreign key to "${parentTableName}"`
    );
  }

  if (matchingFKs.length > 1) {
    throw new Error(
      `Cannot infer foreign key: table "${childTableName}" has multiple foreign keys to "${parentTableName}": [${matchingFKs.join(', ')}]. ` +
      `Please specify explicitly using the syntax: "TYPE(fk_name) table.column"`
    );
  }

  return matchingFKs[0];
}

/**
 * Validates that a specified foreign key is valid
 */
export function validateForeignKey(
  foreignKeyName: string,
  childTableName: string,
  parentTableName: string,
  schema: GenLogicSchema
): void {
  const childTable = schema.tables?.[childTableName];

  if (!childTable) {
    throw new Error(`Child table "${childTableName}" not found in schema`);
  }

  if (!childTable.foreign_keys) {
    throw new Error(`Child table "${childTableName}" has no foreign keys`);
  }

  const fkDef = childTable.foreign_keys[foreignKeyName];

  if (!fkDef) {
    const availableFKs = Object.keys(childTable.foreign_keys).join(', ');
    throw new Error(
      `Foreign key "${foreignKeyName}" not found in table "${childTableName}". Available: [${availableFKs}]`
    );
  }

  const targetTable = typeof fkDef === 'string' ? fkDef : fkDef.table;

  if (targetTable !== parentTableName) {
    throw new Error(
      `Foreign key "${foreignKeyName}" in table "${childTableName}" references "${targetTable}", not "${parentTableName}"`
    );
  }
}

/**
 * Fully resolves an automation by parsing and inferring/validating the foreign key
 * Returns a complete ParsedStandardAutomation with foreign_key always populated
 *
 * @param automation - The automation definition to resolve
 * @param tableWithAutomation - The table WHERE the automation is DEFINED
 * @param schema - The full schema
 */
export function resolveAutomation(
  automation: AutomationDefinition,
  tableWithAutomation: string,
  schema: GenLogicSchema
): ParsedStandardAutomation | RuleMatchAutomationDefinition {
  const normalized = normalizeAutomation(automation);

  // If it's a RULE_MATCH automation, return as-is
  if ('mode' in normalized) {
    return normalized;
  }

  const referencedTableName = normalized.table;

  // Determine which table has the FK based on automation type
  // - SUM/COUNT/MAX/MIN: Parent aggregates FROM child. FK is FROM child (referencedTable) TO parent (tableWithAutomation)
  // - SYNC/SNAPSHOT: Child syncs FROM parent. FK is FROM child (tableWithAutomation) TO parent (referencedTable)

  let childTableName: string;
  let parentTableName: string;

  if (['SUM', 'COUNT', 'MAX', 'MIN', 'LAST_VALUE'].includes(normalized.type)) {
    // Aggregation: tableWithAutomation is parent, referencedTable is child
    childTableName = referencedTableName;
    parentTableName = tableWithAutomation;
  } else {
    // SYNC/SNAPSHOT/etc: tableWithAutomation is child, referencedTable is parent
    childTableName = tableWithAutomation;
    parentTableName = referencedTableName;
  }

  // If FK is already specified, validate it
  if (normalized.foreign_key) {
    validateForeignKey(normalized.foreign_key, childTableName, parentTableName, schema);
    return normalized;
  }

  // Otherwise, infer the FK (always FROM child TO parent)
  const inferredFK = inferForeignKey(childTableName, parentTableName, schema);

  return {
    ...normalized,
    foreign_key: inferredFK
  };
}
