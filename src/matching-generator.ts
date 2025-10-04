import type { GenLogicSchema, MatchingDefinition } from './types.js';
import type { ProcessedSchema } from './schema-processor.js';

/**
 * Matching Function Generator
 *
 * Generates stored procedures for pattern matching against rule tables.
 * Two functions per table:
 * 1. {table}_match_best - Returns best match per input
 * 2. {table}_match_all - Returns all matches ranked by specificity
 */
export class MatchingGenerator {

  /**
   * Generate matching functions for all tables with matching: true
   */
  generateMatchingFunctions(schema: GenLogicSchema, processedSchema: ProcessedSchema): string[] {
    const functions: string[] = [];

    if (!schema.tables) return functions;

    for (const [tableName, table] of Object.entries(schema.tables)) {
      if (!table.matching) continue;

      functions.push(this.generateMatchBestFunction(tableName, table.matching, processedSchema));
      functions.push(this.generateMatchAllFunction(tableName, table.matching, processedSchema));
    }

    return functions;
  }

  /**
   * Generate {table}_match_best function
   */
  private generateMatchBestFunction(
    tableName: string,
    matching: MatchingDefinition,
    processedSchema: ProcessedSchema
  ): string {
    const functionName = `${tableName}_match_best`;
    const { pattern_column, result_column, match_columns } = matching;

    // Get primary key for rule table
    const pkColumn = this.getTablePrimaryKey(tableName, processedSchema);

    // Build input field extraction
    const inputFields = this.getInputFields(match_columns);
    const inputExtractions = this.buildInputExtractions(inputFields);

    // Build WHERE clause for pattern matching
    const whereConditions = this.buildWhereConditions(match_columns, pattern_column);

    // Build matched column count
    const matchedColumnCount = this.buildMatchedColumnCount(match_columns, pattern_column);

    return `
CREATE OR REPLACE FUNCTION ${functionName}(p_inputs JSONB)
RETURNS TABLE (
  input_id INTEGER,
  matched_rule_id INTEGER,
  pattern TEXT,
  result_value TEXT,
  matched_column_count INTEGER,
  pattern_length INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH input_data AS (
    SELECT
      (value->>'id')::INTEGER AS id,
      (value->>'description')::TEXT AS description${inputExtractions}
    FROM jsonb_array_elements(p_inputs)
  ),
  matches AS (
    SELECT
      i.id,
      r.${pkColumn} AS rule_id,
      r.${pattern_column} AS pattern,
      r.${result_column} AS result_value,
      ${matchedColumnCount} AS matched_column_count,
      LENGTH(r.${pattern_column}) AS pattern_length
    FROM input_data i
    CROSS JOIN ${tableName} r
    WHERE ${whereConditions}
  ),
  ranked AS (
    SELECT
      *,
      ROW_NUMBER() OVER (
        PARTITION BY id
        ORDER BY
          matched_column_count DESC,
          pattern_length DESC
      ) AS rank
    FROM matches
  )
  SELECT
    id,
    rule_id,
    pattern,
    result_value,
    matched_column_count,
    pattern_length
  FROM ranked
  WHERE rank = 1;
END;
$$ LANGUAGE plpgsql STABLE;
`;
  }

  /**
   * Generate {table}_match_all function
   */
  private generateMatchAllFunction(
    tableName: string,
    matching: MatchingDefinition,
    processedSchema: ProcessedSchema
  ): string {
    const functionName = `${tableName}_match_all`;
    const { pattern_column, result_column, match_columns } = matching;

    const pkColumn = this.getTablePrimaryKey(tableName, processedSchema);
    const inputFields = this.getInputFields(match_columns);
    const inputExtractions = this.buildInputExtractions(inputFields);
    const whereConditions = this.buildWhereConditions(match_columns, pattern_column);
    const matchedColumnCount = this.buildMatchedColumnCount(match_columns, pattern_column);

    return `
CREATE OR REPLACE FUNCTION ${functionName}(p_inputs JSONB)
RETURNS TABLE (
  input_id INTEGER,
  matched_rule_id INTEGER,
  pattern TEXT,
  result_value TEXT,
  matched_column_count INTEGER,
  pattern_length INTEGER,
  match_rank INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH input_data AS (
    SELECT
      (value->>'id')::INTEGER AS id,
      (value->>'description')::TEXT AS description${inputExtractions}
    FROM jsonb_array_elements(p_inputs)
  ),
  matches AS (
    SELECT
      i.id,
      r.${pkColumn} AS rule_id,
      r.${pattern_column} AS pattern,
      r.${result_column} AS result_value,
      ${matchedColumnCount} AS matched_column_count,
      LENGTH(r.${pattern_column}) AS pattern_length
    FROM input_data i
    CROSS JOIN ${tableName} r
    WHERE ${whereConditions}
  )
  SELECT
    id,
    rule_id,
    pattern,
    result_value,
    matched_column_count,
    pattern_length,
    ROW_NUMBER() OVER (
      PARTITION BY id
      ORDER BY
        matched_column_count DESC,
        pattern_length DESC
    )::INTEGER AS match_rank
  FROM matches;
END;
$$ LANGUAGE plpgsql STABLE;
`;
  }

  /**
   * Get input fields from match_columns
   */
  private getInputFields(match_columns?: MatchingDefinition['match_columns']): Set<string> {
    const fields = new Set<string>();
    fields.add('description'); // Always have description for pattern matching

    if (match_columns) {
      for (const col of match_columns) {
        fields.add(col.input_field);
      }
    }

    return fields;
  }

  /**
   * Build input field extractions for CTE
   */
  private buildInputExtractions(inputFields: Set<string>): string {
    const extractions: string[] = [];

    for (const field of inputFields) {
      if (field === 'description') continue; // Already included

      // Try to infer type from field name
      const isNumeric = field.includes('amount') || field.includes('price') || field.includes('qty');
      const type = isNumeric ? 'NUMERIC' : 'TEXT';

      extractions.push(`,\n      (value->>'${field}')::${type} AS ${field}`);
    }

    return extractions.join('');
  }

  /**
   * Build WHERE conditions for matching
   */
  private buildWhereConditions(
    match_columns: MatchingDefinition['match_columns'],
    pattern_column: string
  ): string {
    const conditions: string[] = [];

    // Pattern matching condition (required)
    conditions.push(`i.description LIKE r.${pattern_column}`);

    // Additional column conditions
    if (match_columns) {
      for (const col of match_columns) {
        conditions.push(
          `(r.${col.column} IS NULL OR i.${col.input_field} ${col.operator} r.${col.column})`
        );
      }
    }

    return conditions.join('\n      AND ');
  }

  /**
   * Build matched column count expression
   */
  private buildMatchedColumnCount(
    match_columns: MatchingDefinition['match_columns'],
    pattern_column: string
  ): string {
    const counts: string[] = [];

    // Pattern always counts as 1 (since it must match to get here)
    counts.push('1');

    // Count each additional column that matched
    if (match_columns) {
      for (const col of match_columns) {
        counts.push(
          `CASE WHEN r.${col.column} IS NOT NULL AND i.${col.input_field} ${col.operator} r.${col.column} THEN 1 ELSE 0 END`
        );
      }
    }

    return `(${counts.join(' + ')})`;
  }

  /**
   * Get primary key column for a table
   */
  private getTablePrimaryKey(tableName: string, processedSchema: ProcessedSchema): string {
    const table = processedSchema.tables[tableName];
    if (!table) {
      throw new Error(`Table '${tableName}' not found in processed schema`);
    }

    // Find primary key column
    for (const [colName, col] of Object.entries(table.columns)) {
      if (col.primary_key) {
        return colName;
      }
    }

    throw new Error(`No primary key found for table '${tableName}'`);
  }
}
