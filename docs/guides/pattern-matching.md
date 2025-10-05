# Pattern Matching Guide

GenLogic can generate pattern matching tables and stored procedures for intelligent categorization. This is useful for categorizing transactions, routing records, or applying rules based on text patterns and numeric constraints.

## Overview

Matching tables are defined in the `matching_tables` section (separate from `tables`) and automatically get:
- **Fixed table structure** with standard columns
- **Two stored procedures** for matching: `{table}_match_best(jsonb)` and `{table}_match_all(jsonb)`

## Basic Example: Transaction Categorization

```yaml
matching_tables:
  transaction_rules:
    result_column_name: category
```

This **automatically creates** a table with these columns:
- `id` (integer, primary key, auto-increment)
- `string_match` (varchar 200) - Pattern with SQL LIKE wildcards
- `category` (varchar 100) - The result value (named from result_column_name)
- `range_low_bound` (numeric 10,2, nullable) - Minimum value constraint
- `range_high_bound` (numeric 10,2, nullable) - Maximum value constraint

**And generates two functions:**
- `transaction_rules_match_best(jsonb)` - Returns best match per input
- `transaction_rules_match_all(jsonb)` - Returns all matches ranked by specificity

**Usage:**

```sql
-- Insert rules with wildcard patterns
INSERT INTO transaction_rules (string_match, category) VALUES
  ('%SUPERSTREAMING%', 'Entertainment'),
  ('%MEGASTORE%', 'Shopping'),
  ('GROCERYMART%', 'Food');

-- Match transactions
SELECT * FROM transaction_rules_match_best(
  '[{"id": 1001, "description": "SUPERSTREAMING SUBSCRIPTION"},
    {"id": 1002, "description": "MEGASTORE PURCHASE"}]'::jsonb
);
```

**Returns:**
```
input_id | matched_id | string_match      | category      | matched_column_count | pattern_length
---------|------------|-------------------|---------------|---------------------|---------------
1001     | 1          | %SUPERSTREAMING%  | Entertainment | 1                   | 16
1002     | 2          | %MEGASTORE%       | Shopping      | 1                   | 11
```

## Adding Range Constraints

Use `range_low_bound` and `range_high_bound` for numeric filtering:

```sql
-- Insert rules with amount constraints
INSERT INTO transaction_rules (string_match, category, range_low_bound, range_high_bound) VALUES
  ('%SUPERSTREAMING%', 'Entertainment - Streaming', 5.00, 50.00),
  ('%COFFEESHOP%', 'Food - Coffee', NULL, 10.00),
  ('%RENT%', 'Housing', 500.00, NULL);

-- Match with amounts (input must include "amount" field)
SELECT * FROM transaction_rules_match_best(
  '[{"id": 1001, "description": "SUPERSTREAMING SUBSCRIPTION", "amount": 24.99},
    {"id": 1002, "description": "COFFEESHOP PURCHASE", "amount": 5.50},
    {"id": 1003, "description": "MONTHLY RENT", "amount": 1500.00}]'::jsonb
);
```

**Returns:**
```
input_id | matched_id | string_match      | category                    | matched_column_count | pattern_length
---------|------------|-------------------|----------------------------|---------------------|---------------
1001     | 1          | %SUPERSTREAMING%  | Entertainment - Streaming  | 3                   | 16
1002     | 2          | %COFFEESHOP%      | Food - Coffee              | 2                   | 12
1003     | 3          | %RENT%            | Housing                    | 2                   | 5
```

## Specificity Ranking

Rules are ranked by **specificity** - more matched constraints = more specific:

1. **Matched column count** (primary ranking)
   - String pattern match = 1 point
   - Range low bound match = +1 point
   - Range high bound match = +1 point

2. **Pattern length** (tiebreaker)
   - Longer patterns are more specific

**Example ranking:**

```sql
-- Rule A: '%SUPERSTREAMING%' only
--   → Matched columns: 1 (pattern only)

-- Rule B: '%SUPERSTREAMING%' with range_low_bound >= 10.00
--   → Matched columns: 2 (pattern + low bound)

-- Rule C: '%SUPERSTREAMING%' with range_low_bound >= 10.00 AND range_high_bound <= 100.00
--   → Matched columns: 3 (pattern + low + high)

-- If all match, Rule C wins (highest column count)
```

## Exact Amount Matching

To match exact amounts, use both bounds with the same value:

```sql
-- Exact match: Streaming service standard plan at $24.99
INSERT INTO transaction_rules (string_match, category, range_low_bound, range_high_bound) VALUES
  ('%SUPERSTREAMING%', 'Entertainment - Standard Plan', 24.99, 24.99);

-- This matches ONLY when amount is exactly 24.99
-- Specificity = 3 (pattern + low bound + high bound)
```

This gives maximum specificity and will beat any less specific rule.

## NULL Handling

Constraints with NULL values are treated as "don't care":

```sql
-- This rule matches ANY amount (both bounds are NULL)
INSERT INTO transaction_rules (string_match, category, range_low_bound, range_high_bound) VALUES
  ('%MISC%', 'Miscellaneous', NULL, NULL);

-- This rule only checks minimum (high bound is NULL = no upper limit)
INSERT INTO transaction_rules (string_match, category, range_low_bound, range_high_bound) VALUES
  ('%RENT%', 'Housing', 500.00, NULL);
```

## Match All vs Match Best

**`{table}_match_best`** - Returns only the highest-ranked match per input:

```sql
SELECT * FROM transaction_rules_match_best('[...]'::jsonb);
-- Returns 1 row per input (or 0 if no match)
```

**`{table}_match_all`** - Returns all matches with ranking:

```sql
SELECT * FROM transaction_rules_match_all('[...]'::jsonb);
-- Returns all matching rules with match_rank column
-- match_rank = 1 is the best match, 2 is second best, etc.
```

## Input Format

Both functions accept a JSONB array of objects. Each object must include:
- `id` - Unique identifier for the input row
- `description` - Text field to match against string_match patterns
- `amount` - (optional) Numeric value for range constraint matching

```json
[
  {
    "id": 1001,
    "description": "SUPERSTREAMING SUBSCRIPTION",
    "amount": 24.99
  },
  {
    "id": 1002,
    "description": "MEGAGROCERIES STORE",
    "amount": 85.50
  }
]
```

## Generated Functions

For a matching table `transaction_rules`, GenLogic generates:

1. **`transaction_rules_match_best(p_inputs JSONB)`**
   - Returns: input_id, matched_id, string_match, result_value, matched_column_count, pattern_length
   - One row per input (best match only)

2. **`transaction_rules_match_all(p_inputs JSONB)`**
   - Returns: input_id, matched_id, string_match, result_value, matched_column_count, pattern_length, match_rank
   - All matching rows with rank

## Multiple Matching Tables

You can define multiple matching tables in one schema:

```yaml
matching_tables:
  transaction_rules:
    result_column_name: category

  product_rules:
    result_column_name: department

  email_rules:
    result_column_name: inbox
```

Each gets the same structure (id, string_match, result, range_low_bound, range_high_bound) with its own custom result column name.

## Use Cases

- Transaction categorization - Auto-categorize bank transactions
- Product classification - Route products to departments based on description
- Email routing - Direct emails based on subject line patterns
- Data validation - Flag records that match suspicious patterns
- Price monitoring - Alert when prices change using exact amount matching

## Performance Considerations

- Pattern matching uses `LIKE` which can be slow on large tables
- Consider adding indexes: `CREATE INDEX idx_pattern ON transaction_rules USING gin(string_match gin_trgm_ops);` (requires pg_trgm extension)
- For very large rule sets, consider partitioning by pattern prefix
- Match functions are marked `STABLE` for query optimization
