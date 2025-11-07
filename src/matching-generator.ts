// Pattern Matching Generator - Creates fixed-structure matching tables and stored procedures
import { GenLogicSchema, MatchingTableDefinition, ProcessedSchema } from './types.js';

export class MatchingGenerator {
  /**
   * Generate table DDL and matching functions for all matching_tables
   */
  generateMatchingSQL(schema: GenLogicSchema, processedSchema: ProcessedSchema): string[] {
    const statements: string[] = [];

    if (!schema["matching-tables"]) {
      return statements;
    }

    for (const [tableName, definition] of Object.entries(schema["matching-tables"])) {
      // Generate CREATE TABLE statement
      statements.push(this.generateTableDDL(tableName, definition));

      // Generate match_best function
      statements.push(this.generateMatchBestFunction(tableName, definition));

      // Generate match_all function
      statements.push(this.generateMatchAllFunction(tableName, definition));
    }

    return statements;
  }

  /**
   * Generate CREATE TABLE statement with fixed structure
   */
  private generateTableDDL(tableName: string, definition: MatchingTableDefinition): string {
    const resultColumn = definition["result-column-name"];

    return `
-- GENLOGIC MATCHING TABLE: ${tableName}
CREATE TABLE IF NOT EXISTS ${tableName} (
  id SERIAL PRIMARY KEY,
  string_match VARCHAR(200),
  ${resultColumn} VARCHAR(100),
  range_low_bound NUMERIC(10,2),
  range_high_bound NUMERIC(10,2)
);`;
  }

  /**
   * Generate {table}_match_best function
   * Returns best match per input based on specificity
   */
  private generateMatchBestFunction(tableName: string, definition: MatchingTableDefinition): string {
    const functionName = `${tableName}_match_best`;
    const resultColumn = definition["result-column-name"];

    return `
-- GENLOGIC: Best match function for ${tableName}
CREATE OR REPLACE FUNCTION ${functionName}(p_inputs JSONB)
RETURNS TABLE (
  input_id INTEGER,
  matched_id INTEGER,
  string_match VARCHAR(200),
  result_value VARCHAR(100),
  matched_column_count INTEGER,
  pattern_length INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH input_data AS (
    SELECT
      (value->>'id')::INTEGER AS id,
      (value->>'description')::TEXT AS description,
      (value->>'amount')::NUMERIC AS amount
    FROM jsonb_array_elements(p_inputs)
  ),
  matches AS (
    SELECT
      i.id,
      r.id AS rule_id,
      r.string_match,
      r.${resultColumn} AS result_value,
      (1
        + CASE WHEN r.range_low_bound IS NOT NULL AND i.amount >= r.range_low_bound THEN 1 ELSE 0 END
        + CASE WHEN r.range_high_bound IS NOT NULL AND i.amount <= r.range_high_bound THEN 1 ELSE 0 END
      ) AS matched_column_count,
      LENGTH(r.string_match) AS pattern_length
    FROM input_data i
    CROSS JOIN ${tableName} r
    WHERE i.description ILIKE r.string_match
      AND (r.range_low_bound IS NULL OR i.amount >= r.range_low_bound)
      AND (r.range_high_bound IS NULL OR i.amount <= r.range_high_bound)
  ),
  ranked AS (
    SELECT
      *,
      ROW_NUMBER() OVER (
        PARTITION BY matches.id
        ORDER BY
          matches.matched_column_count DESC,
          matches.pattern_length DESC
      ) AS rank
    FROM matches
  )
  SELECT
    ranked.id AS input_id,
    ranked.rule_id AS matched_id,
    ranked.string_match AS string_match,
    ranked.result_value AS result_value,
    ranked.matched_column_count AS matched_column_count,
    ranked.pattern_length AS pattern_length
  FROM ranked
  WHERE ranked.rank = 1;
END;
$$ LANGUAGE plpgsql STABLE;`;
  }

  /**
   * Generate {table}_match_all function
   * Returns all matches with ranking
   */
  private generateMatchAllFunction(tableName: string, definition: MatchingTableDefinition): string {
    const functionName = `${tableName}_match_all`;
    const resultColumn = definition["result-column-name"];

    return `
-- GENLOGIC: All matches function for ${tableName}
CREATE OR REPLACE FUNCTION ${functionName}(p_inputs JSONB)
RETURNS TABLE (
  input_id INTEGER,
  matched_id INTEGER,
  string_match VARCHAR(200),
  result_value VARCHAR(100),
  matched_column_count INTEGER,
  pattern_length INTEGER,
  match_rank INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH input_data AS (
    SELECT
      (value->>'id')::INTEGER AS id,
      (value->>'description')::TEXT AS description,
      (value->>'amount')::NUMERIC AS amount
    FROM jsonb_array_elements(p_inputs)
  ),
  matches AS (
    SELECT
      i.id,
      r.id AS rule_id,
      r.string_match,
      r.${resultColumn} AS result_value,
      (1
        + CASE WHEN r.range_low_bound IS NOT NULL AND i.amount >= r.range_low_bound THEN 1 ELSE 0 END
        + CASE WHEN r.range_high_bound IS NOT NULL AND i.amount <= r.range_high_bound THEN 1 ELSE 0 END
      ) AS matched_column_count,
      LENGTH(r.string_match) AS pattern_length
    FROM input_data i
    CROSS JOIN ${tableName} r
    WHERE i.description ILIKE r.string_match
      AND (r.range_low_bound IS NULL OR i.amount >= r.range_low_bound)
      AND (r.range_high_bound IS NULL OR i.amount <= r.range_high_bound)
  )
  SELECT
    matches.id AS input_id,
    matches.rule_id AS matched_id,
    matches.string_match AS string_match,
    matches.result_value AS result_value,
    matches.matched_column_count AS matched_column_count,
    matches.pattern_length AS pattern_length,
    ROW_NUMBER() OVER (
      PARTITION BY matches.id
      ORDER BY
        matches.matched_column_count DESC,
        matches.pattern_length DESC
    )::INTEGER AS match_rank
  FROM matches;
END;
$$ LANGUAGE plpgsql STABLE;`;
  }
}
