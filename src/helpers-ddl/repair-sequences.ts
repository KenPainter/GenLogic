import type { NewSchema } from '../new-schema.js';

/**
 * Generate SQL to repair sequences that are out of sync with table data
 *
 * When users manually insert rows with explicit ID values higher than the sequence's
 * current value, the sequence can fall behind, causing future inserts to fail with
 * duplicate key violations.
 *
 * This function checks each serial column in the live schema and generates setval()
 * statements to fix sequences where:
 *   sequenceLastValue < columnMaxValue
 *
 * The sequence is set to: MAX(column_value) + 1, or 100 if table is empty
 */
export function generateSequenceRepairDDL(liveSchema: NewSchema): string[] {
  const statements: string[] = [];

  // Iterate through all tables in the live schema
  for (const [tableName, tableDef] of Object.entries(liveSchema.tables)) {
    if (!tableDef.columns) continue;

    // Check each column for serial type that needs repair
    for (const [colName, colDef] of Object.entries(tableDef.columns)) {
      // Only process serial columns that have tracking data
      if (!colDef.serial) continue;
      if (colDef.sequenceLastValue === undefined || colDef.sequenceLastValue === null) continue;
      if (colDef.columnMaxValue === undefined || colDef.columnMaxValue === null) continue;

      // Check if sequence needs repair
      // If columnMaxValue >= sequenceLastValue, the sequence is out of sync
      if (colDef.columnMaxValue >= colDef.sequenceLastValue) {
        const sequenceName = `${tableName}_${colName}_seq`;
        const newValue = colDef.columnMaxValue + 1;

        statements.push(
          `-- Repair sequence for ${tableName}.${colName} (max=${colDef.columnMaxValue}, seq=${colDef.sequenceLastValue})`,
          `SELECT setval('${sequenceName}', ${newValue}, false);`
        );
      }
    }
  }

  return statements;
}
