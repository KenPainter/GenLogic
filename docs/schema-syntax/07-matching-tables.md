Previous: [Moving Values from Child to Parent](06-child-to-parent.md) | Next: [Indexes and Unique Constraints](08-indexes-and-constraints.md)

# Pattern Matching Tables

Matching tables provide pattern-based categorization with specificity ranking.

## Basic Structure

```yaml
matching_tables:
  table_name:
    result_column_name: *name for result column*
```

This automatically creates a table with fixed structure and matching functions.

## Simple Example

```yaml
matching_tables:
  expense_rules:
    result_column_name: category
```

## Generated Table Structure

The above declaration creates:

```sql
CREATE TABLE expense_rules (
  id SERIAL PRIMARY KEY,
  string_match VARCHAR(200),
  category VARCHAR(100),
  range_low_bound NUMERIC(10,2),
  range_high_bound NUMERIC(10,2)
);
```

Fixed columns:
- id: Auto-incrementing primary key
- string_match: Pattern with SQL LIKE wildcards (%, _)
- result_column_name: The categorization result (name specified in schema)
- range_low_bound: Minimum numeric value (nullable)
- range_high_bound: Maximum numeric value (nullable)

## Generated Functions

Two stored procedures are created:

### match_best Function

Returns the best match for each input:

```sql
{table_name}_match_best(p_inputs JSONB)
```

Returns one row per input with the most specific match.

### match_all Function

Returns all matches ranked by specificity:

```sql
{table_name}_match_all(p_inputs JSONB)
```

Returns all matching rules with a match_rank column.

## Using the Table

### Insert Rules

```sql
INSERT INTO expense_rules (string_match, category) VALUES
  ('%starbucks%', 'Coffee'),
  ('%grocery%', 'Food'),
  ('%gas%', 'Transportation');
```

Patterns use SQL LIKE syntax:
- % matches any characters
- _ matches single character

### Call Matching Function

Input format is JSONB array with required fields:
- id: Unique identifier for each input
- description: Text to match against string_match
- amount: Numeric value (optional, for range matching)

```sql
SELECT * FROM expense_rules_match_best(
  '[{"id": 1, "description": "Starbucks coffee", "amount": 5.50},
    {"id": 2, "description": "Grocery store", "amount": 45.00}]'::jsonb
);
```

Returns:

```
input_id | matched_id | string_match  | result_value | matched_column_count | pattern_length
---------|------------|---------------|--------------|---------------------|---------------
1        | 1          | %starbucks%   | Coffee       | 1                   | 11
2        | 2          | %grocery%     | Food         | 1                   | 9
```

## Range Constraints

Add numeric filtering with range bounds:

```yaml
matching_tables:
  transaction_rules:
    result_column_name: category
```

```sql
-- Rules with amount ranges
INSERT INTO transaction_rules (string_match, category, range_low_bound, range_high_bound) VALUES
  ('%coffee%', 'Beverage', NULL, 10.00),
  ('%coffee%', 'Expensive Beverage', 10.00, NULL),
  ('%grocery%', 'Small Purchase', NULL, 50.00),
  ('%grocery%', 'Large Purchase', 50.00, NULL);

-- Match with amounts
SELECT * FROM transaction_rules_match_best(
  '[{"id": 1, "description": "Morning coffee", "amount": 4.50},
    {"id": 2, "description": "Grocery shopping", "amount": 120.00}]'::jsonb
);
```

Returns:

```
input_id | matched_id | string_match | result_value        | matched_column_count | pattern_length
---------|------------|--------------|---------------------|---------------------|---------------
1        | 1          | %coffee%     | Beverage            | 2                   | 8
2        | 4          | %grocery%    | Large Purchase      | 2                   | 9
```

Range matching:
- range_low_bound: Input amount must be >= this value
- range_high_bound: Input amount must be <= this value
- NULL in either bound means no constraint

## Specificity Ranking

Matches are ranked by specificity:

1. Matched column count (higher is better)
   - String pattern matches: 1 point
   - Range low bound matches: +1 point
   - Range high bound matches: +1 point

2. Pattern length (tiebreaker, longer is better)

### Example Ranking

```sql
INSERT INTO expense_rules (string_match, category, range_low_bound, range_high_bound) VALUES
  ('%coffee%', 'Any Coffee', NULL, NULL),                -- specificity: 1
  ('%coffee%', 'Cheap Coffee', NULL, 5.00),              -- specificity: 2
  ('%coffee%', 'Normal Coffee', 5.00, 10.00),            -- specificity: 3
  ('%starbucks%coffee%', 'Starbucks', NULL, NULL);       -- specificity: 1, but longer pattern
```

For input "starbucks coffee" with amount 7.00:
- "Normal Coffee" wins (3 matched columns)

For input "starbucks coffee" with amount 12.00:
- "Starbucks" wins (1 matched column, but longer pattern than "Any Coffee")

## Exact Value Matching

Use identical bounds for exact matching:

```sql
INSERT INTO transaction_rules (string_match, category, range_low_bound, range_high_bound) VALUES
  ('%streaming%', 'Basic Plan', 9.99, 9.99),
  ('%streaming%', 'Premium Plan', 14.99, 14.99);
```

This matches only when amount equals exactly 9.99 or 14.99.

## Multiple Matching Tables

Define multiple matching tables for different purposes:

```yaml
matching_tables:
  expense_rules:
    result_column_name: category

  priority_rules:
    result_column_name: priority_level

  routing_rules:
    result_column_name: destination
```

Each table is independent with its own rules and functions.

## Input Format Requirements

JSONB input must be an array of objects with these fields:

Required:
- id (integer): Unique identifier for matching results
- description (text): String to match against patterns

Optional:
- amount (numeric): For range matching

Example:

```json
[
  {"id": 1, "description": "Purchase description", "amount": 25.50},
  {"id": 2, "description": "Another purchase", "amount": 100.00}
]
```

## Complete Example

```yaml
matching_tables:
  expense_categorization:
    result_column_name: category
```

Populate rules:

```sql
INSERT INTO expense_categorization (string_match, category, range_low_bound, range_high_bound) VALUES
  ('%restaurant%', 'Dining - Expensive', 50.00, NULL),
  ('%restaurant%', 'Dining - Moderate', 15.00, 50.00),
  ('%restaurant%', 'Dining - Cheap', NULL, 15.00),
  ('%coffee%', 'Beverage', NULL, 10.00),
  ('%grocery%', 'Food - Groceries', NULL, NULL);
```

Match expenses:

```sql
SELECT
  input_id,
  result_value AS category,
  matched_column_count AS specificity
FROM expense_categorization_match_best(
  '[{"id": 1, "description": "Fine restaurant dinner", "amount": 85.00},
    {"id": 2, "description": "Quick coffee", "amount": 4.50},
    {"id": 3, "description": "Casual restaurant lunch", "amount": 22.00}]'::jsonb
);
```

Returns:

```
input_id | category           | specificity
---------|--------------------|------------
1        | Dining - Expensive | 2
2        | Beverage           | 2
3        | Dining - Moderate  | 3
```

## Use Cases

Pattern matching tables are useful for:
- Transaction categorization
- Rule-based routing
- Priority assignment
- Automated classification
- Pattern-based defaults

---

Previous: [Moving Values from Child to Parent](06-child-to-parent.md) | Next: [Indexes and Unique Constraints](08-indexes-and-constraints.md)
