import type { NewSchema } from '../new-schema.js';

/**
 * Generate INSERT statements for seed data
 * Seed rows are inserted as-is - triggers will fire to populate automation columns
 */
export function generateSeedDataDML(
  newSchema: NewSchema,
  tablesInLayer: string[]
): string[] {
  const statements: string[] = [];

  for (const tableName of tablesInLayer) {
    const table = newSchema.tables[tableName];
    if (!table || !table.seedRows || table.seedRows.length === 0) {
      continue;
    }

    // For each seed row, generate an INSERT statement
    for (const row of table.seedRows) {
      const columns = Object.keys(row);
      const columnList = columns.map(col => `"${col}"`).join(', ');

      // Build values list with proper escaping
      const values = columns.map(col => {
        let value = row[col];

        // Handle NULL
        if (value === null || value === undefined) {
          return 'NULL';
        }

        // Handle strings - replace constants first, THEN check if it became a number
        if (typeof value === 'string') {
          value = newSchema.replaceConstants(value, `${tableName}.seedRows.${col}`);

          // After constant replacement, check if it's now a numeric string
          if (/^-?\d+(\.\d+)?$/.test(value)) {
            return value; // Return as unquoted number
          }

          // Still a string, escape single quotes
          return `'${value.replace(/'/g, "''")}'`;
        }

        // Handle boolean
        if (typeof value === 'boolean') {
          return value ? 'TRUE' : 'FALSE';
        }

        // Handle numbers
        if (typeof value === 'number') {
          return String(value);
        }

        // Handle arrays/objects - convert to JSON
        return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
      });

      const valueList = values.join(', ');

      statements.push(
        `INSERT INTO "${tableName}" (${columnList}) VALUES (${valueList}) ON CONFLICT DO NOTHING;`
      );
    }
  }

  return statements;
}
