# GenLogic Processing Pipeline: Layer-by-Layer Schema Processing

## Executive Summary

Inserted before the YOLO marker (after testing we will move the marker
and rip out older code), we process the schema in **two passes**:

### Pass 1: Per-Column Processing (Layer-by-Layer)
For every column in every table (processing tables in dependency order):

1. Replace `${CONSTANT}` in any expression: definition, automation, formula, CHECK constraints, seed-rows
2. Put the PK in a special key so downstream code can find it easily
3. Establish column definition (pick one source):
    - From string if present (explicit definition)
    - From reusable column reference (`$ref`) if present
    - Or infer from parent table PK (for FK columns)
4. Parse and validate column definition into components:
    - Base type (integer, varchar, numeric, etc.)
    - Type modifiers (length, precision, scale)
    - Nullability (NOT NULL flag)
    - Default value (if present)
    - Note: Diffing compares these components, not the raw definition string
5. Parse and validate formula expressions using SQL parser:
    - Extract column dependencies from SQL AST (ignore the `*` we add to make parseable expression)
    - **Save as edges**: `[table.computed_col, table.dependency_col]`
    - Example: `balance = debits - credits` → edges: `[accounts.balance, accounts.debits]`, `[accounts.balance, accounts.credits]`
    - Edge direction: The computed column depends on (points to) the columns it references
6. Parse and validate automation expressions using SQL parser (WHERE clauses only):
    - **SYNC (parent→child)**: Child column copies from parent
      - Edge: `[child.col, parent.col]` (child depends on parent)
      - Example: `ledger.category_base SYNC batches.category_base` → `[ledger.category_base, batches.category_base]`
    - **SUM/COUNT/MIN/MAX (child→parent)**: Parent column aggregates from children
      - Edge: `[parent.col, child.col]` (parent depends on child)
      - Example: `accounts.debits SUM ledger.amount` → `[accounts.debits, ledger.amount]`

### Pass 1: Table-Level Processing (After All Columns)
After all columns are processed for a table:

7. Validate seed-rows are naming valid columns
8. Validate table-level unique constraints are naming valid columns
9. Validate table-level indexes are naming valid columns
10. Validate table-level CHECK constraints (using SQL parser and check columns exist)
11. Generate constraint/index names to simplify SQL generation:
    - FK constraint names: `fk_childtable_parenttable_column`
    - Unique constraint names: `uq_tablename_col1_col2`
    - Index names: `idx_tablename_col1_col2`
    - CHECK constraint names: `chk_tablename_N` (numbered sequentially)
12. Extract sequence information for serial/bigserial columns:
    - Sequence name: `tablename_columnname_seq`
    - Starting value (from seed-rows, if specified)

### Pass 2: Global Validation and Cycle Detection
After all tables have been processed:

13. Detect cycles in the unified edge set → **ERROR if any found**
    - Formula cycles: `table.a → table.b → table.a`
    - Automation cycles: `parent.sum → child.col2 → child.col1 → parent.sum`
      - Example: `child.col1 SYNC parent.sum`, `child.col2 = child.col1 * 2`, `parent.sum SUM child.col2`
      - Triggers would recurse infinitely until hitting max_stack_depth → ERROR
    - Mixed cycles: Any cycle involving both formulas and automations
    - Note: We pass edges directly to topological sort - no need to "build graph" separately
14. Assign column computation layers using topological sort (important for trigger code generation)

### Final Output
Dump the fully processed schema as `.populated.json` (next step after `.extracted.json`)   

### Key Innovation: SQL Parser for Dependency Extraction
We use `pgsql-ast-parser` (see `test-expression-parser.ts`) to:
- **Validate** SQL expressions (formulas, automations, WHERE clauses)
- **Extract** column dependencies automatically by walking the AST
- **No custom parsing needed** - the SQL parser does all the work!

This means **we don't need `@` sigils** in elite-finance.yaml - the SQL parser can identify column references directly from valid SQL expressions.

### Edge Representation and Cycle Detection

**Edge Format**: `[from_col, to_col]` where `from_col` **depends on** `to_col`
- Both are fully qualified: `table_name.column_name`
- Direction: Points FROM computed column TO its dependency
- Example: `[accounts.balance, accounts.debits]` means "balance depends on debits"

**Why table.column format?**
- Works for both formula edges (same table) and automation edges (cross-table)
- More informative error messages when cycles are detected
- Single unified edge list for all dependency types

**Cycle Detection**:
- All edges (formulas + automations) go into ONE list
- Pass to topological sort (reuse existing `topological-sort.ts`)
- Any cycle is an ERROR (whether formula-only, automation-only, or mixed)
- Error message shows the full cycle path with table.column names

### Constraint and Index Naming for Diffing

**Purpose**: Generate consistent, deterministic names to simplify SQL generation

**Naming Conventions**:
- Foreign keys: `fk_childtable_parenttable_columnname`
- Unique constraints: `uq_tablename_col1_col2_col3`
- Indexes: `idx_tablename_col1_col2_col3`
- CHECK constraints: `chk_tablename_1`, `chk_tablename_2` (numbered sequentially)

**Diffing Philosophy**:
- **Substance over names**: We diff based on what the constraint/index DOES, not what it's called
- **Indexes**: Compare column lists and table names
  - If columns match, index exists (regardless of database's index name)
  - If columns differ, drop old and create new
- **Constraints**: Compare definitions and referenced columns
  - FK: Compare parent/child tables and columns
  - Unique: Compare column lists
  - CHECK: Compare constraint expressions (normalized)
- **Names generated here** are for SQL generation convenience only
- **Database names** (from introspection) are ignored during diffing

### Action Required: Remove @ Sigils from elite-finance.yaml

Before implementing the new processing pipeline, we need to strip all `@` sigils from the schema files:

**Why?**
The `@columnName` syntax was a custom marker we used for dependency tracking. Now that we're using a proper SQL parser (pgsql-ast-parser), we can:
1. Write **valid SQL expressions** instead of custom DSL
2. Let the parser **validate** the SQL syntax
3. Let the parser **extract** column dependencies automatically

**Example Transformation**:

Before (with @ sigils):
```yaml
balance:
  formula: "@debits - @credits"

debits:
  automation: SUM(account_id_debit) @ledger.amount
```

After (valid SQL):
```yaml
balance:
  formula: "debits - credits"

debits:
  automation: "SUM(account_id_debit) ledger.amount"
```

**Benefits**:
- ✅ Valid SQL can be copy-pasted into psql for testing
- ✅ No custom parsing logic needed
- ✅ Better error messages from SQL parser
- ✅ Easier for users to write (standard SQL)
- ✅ Can use full SQL expression power (CASE, COALESCE, etc.)

---

## Overview

This document describes the comprehensive processing that happens after the YOLO marker in `processor.ts`. At this point, we have:

- ✅ Parsed YAML with line tracking
- ✅ Extracted constants, tables, and foreign keys
- ✅ Detected cycles and assigned table layers
- ✅ Validated FK table names

Now we need to **fully populate and validate every table** in two passes.

## Current State (ExtractedSchema)

After the extraction phase, we have an `ExtractedSchema` with:

```typescript
{
  schemaPath: string,
  constants: Map<string, ConstantDef>,
  tables: Map<string, TableDef>,
  foreignKeys: ForeignKeyDef[],
  tableLayers: Map<number, string[]>,  // Layer 0, 1, 2, ...
  cycles: string[][]  // Should be empty (we error if not)
}
```

### Incomplete Data at This Point

1. **Columns with `_inferDefinitionFrom`**: FK columns that need their definition copied from parent table's PK
   ```json
   {
     "name": "continent_id",
     "definition": "",  // ← EMPTY!
     "_inferDefinitionFrom": "continents"  // ← Need to look up continents PK
   }
   ```

2. **Columns with `$ref`**: Reusable column references that need to be resolved
   ```json
   {
     "name": "debit",
     "definition": "",  // ← EMPTY!
     "$ref": "amount"  // ← Need to copy from columns.amount
   }
   ```

3. **Foreign Keys with empty fields**:
   ```json
   {
     "parentTable": "continents",
     "parentColumn": "",  // ← Need to find PK column name
     "parentPKDefinition": ""  // ← Need to copy PK definition
   }
   ```

4. **Formulas and automations**: Need to be parsed for column dependencies
   ```yaml
   balance:
     definition: numeric(12,2)
     formula: "@debits - @credits"  # ← References other columns
   ```

5. **Column dependency graph**: Not yet built
   - Which columns depend on which other columns?
   - Are there cycles in formulas?
   - What order should columns be computed?

## Processing Goals

### Single-Pass Layer-by-Layer Processing

Process tables in dependency order (layer 0, then 1, then 2, etc.) to ensure parent tables are fully processed before children.

For each table, we need to:

1. ✅ **Resolve reusable column references** (`$ref`)
2. ✅ **Infer FK column definitions** from parent table PKs
3. ✅ **Populate foreign key metadata** (parent column name and definition)
4. ✅ **Extract formula dependencies** (within-row column references using `@`)
5. ✅ **Extract automation dependencies** (across-table references using `@`)
6. ✅ **Build column dependency graph** for each table
7. ✅ **Detect formula cycles** within tables
8. ✅ **Validate all formulas and automations** reference valid columns
9. ✅ **Process constraints** (CHECK, UNIQUE)
10. ✅ **Process indexes**
11. ✅ **Process seed-rows** (validate against schema)

## Detailed Processing Steps

### Step 1: Resolve Reusable Columns (`$ref`)

**When**: First pass, can be done for all tables in any order

**Input**: Column with `$ref` property
```yaml
columns:
  amount:
    definition: numeric(12,2) default 0
    format: currency

tables:
  transactions:
    columns:
      debit:
        $ref: amount
```

**Processing**:
1. Look up reusable column by name in schema's `columns` section
2. Copy all properties from reusable column to target column
3. Keep the target column's overrides (if any)
4. Remove `$ref` marker
5. Error if reusable column not found

**Output**:
```json
{
  "name": "debit",
  "definition": "numeric(12,2) default 0",
  "format": "currency"
}
```

**Error Cases**:
- `$ref` references non-existent reusable column
- Circular `$ref` (if we allow reusable columns to reference other reusable columns - currently we don't)

---

### Step 2: Infer FK Column Definitions

**When**: Layer-by-layer (must process parent table's PKs first)

**Input**: Column with `_inferDefinitionFrom` marker
```json
{
  "name": "continent_id",
  "definition": "",
  "_inferDefinitionFrom": "continents"
}
```

**Processing**:
1. Look up parent table by name
2. Find the PRIMARY KEY column in parent table
3. Copy the PK's definition to the FK column
4. Remove `_inferDefinitionFrom` marker
5. Add nullability based on FK's `notNull` flag

**Output**:
```json
{
  "name": "continent_id",
  "definition": "integer"  // Copied from continents.continent_id (serial → integer for FK)
}
```

**Special Cases**:
- `serial` in parent PK becomes `integer` in FK column
- `bigserial` becomes `bigint`
- Other types copied verbatim

**Error Cases**:
- Parent table not found
- Parent table has no PRIMARY KEY
- Parent table has composite PRIMARY KEY (not supported in current design)

---

### Step 3: Populate Foreign Key Metadata

**When**: Layer-by-layer (after parent PKs are known)

**Input**: ForeignKeyDef with empty fields
```json
{
  "childTable": "countries",
  "childColumn": "continent_id",
  "parentTable": "continents",
  "parentColumn": "",  // ← Empty
  "parentPKDefinition": ""  // ← Empty
}
```

**Processing**:
1. Look up parent table
2. Find PRIMARY KEY column
3. Set `parentColumn` to PK column name
4. Set `parentPKDefinition` to PK definition
5. Validate child column exists and matches parent PK type

**Output**:
```json
{
  "childTable": "countries",
  "childColumn": "continent_id",
  "parentTable": "continents",
  "parentColumn": "continent_id",
  "parentPKDefinition": "serial primary key"
}
```

**Error Cases**:
- Parent table not found (already caught earlier)
- Parent table has no PK
- Child column doesn't exist in child table
- Child column type doesn't match parent PK type

---

### Step 4: Extract Formula Dependencies

**When**: PASS 1 - During column processing

**Input**: Column with `formula` property
```yaml
balance:
  definition: numeric(12,2)
  formula: "debits - credits"
```

**Processing**:
1. Wrap formula in `SELECT ${formula}` to make it parseable
2. Parse using `pgsql-ast-parser`
3. Walk AST to extract all column references (using `astVisitor`)
4. Validate all referenced columns exist in same table
5. Store dependency edges: `(balance, debits)`, `(balance, credits)`

**SQL Parser Magic** (from test-expression-parser.ts):
```typescript
const sql = `SELECT debits - credits`;
const ast = parse(sql);
const columns = new Set<string>();

const visitor = astVisitor(() => ({
  ref: (ref) => {
    if (ref.name) columns.add(ref.name);
  }
}));

visitor.statement(ast[0]);
// Result: columns = ['debits', 'credits']
```

**Output**:
```json
{
  "name": "balance",
  "definition": "numeric(12,2)",
  "formula": "debits - credits",
  "_formulaEdges": [
    ["balance", "debits"],
    ["balance", "credits"]
  ]
}
```

**Error Cases**:
- Invalid SQL syntax in formula
- References non-existent column
- References column in different table (use automation instead)
- Cycle detection happens in PASS 2

---

### Step 5: Extract Automation Dependencies

**When**: PASS 1 - During column processing (but validation deferred to PASS 2)

**Input**: Column with `automation` property
```yaml
debits:
  definition: numeric(12,2)
  automation: SUM(account_id_debit) ledger.amount
```

**Processing**:
1. Parse automation syntax (custom parser for our DSL)
2. Identify automation type (SUM, COUNT, MIN, MAX, SYNC)
3. Extract target table and column references
4. Extract optional WHERE clause → validate with SQL parser
5. Extract optional FK column qualifier (for multiple FKs to same table)
6. Store cross-table dependency edges for PASS 2 validation

**Automation Patterns**:
- `SUM childTable.column` - aggregate from children
- `SUM(fkColumn) childTable.column` - aggregate from children via specific FK
- `COUNT childTable.pkColumn` - count children
- `MIN/MAX childTable.column` - min/max from children
- `SYNC parentTable.column` - copy from parent
- `WHERE condition` - filter clause (validated by SQL parser)

**SQL Parser for WHERE clauses**:
```typescript
// automation: "COUNT ledger.ledger_id WHERE account_id_offset = 0"
const whereClause = "account_id_offset = 0";
const sql = `SELECT * FROM ledger WHERE ${whereClause}`;
const ast = parse(sql);  // Validates SQL syntax
const columns = extractColumns(ast);  // ['account_id_offset']
```

**Output**:
```json
{
  "name": "debits",
  "definition": "numeric(12,2)",
  "automation": "SUM(account_id_debit) ledger.amount",
  "_automationDeps": {
    "type": "SUM",
    "targetTable": "ledger",
    "targetColumn": "amount",
    "fkColumn": "account_id_debit",
    "whereClause": null,
    "whereColumns": []
  },
  "_automationEdges": [
    ["accounts.debits", "ledger.amount"]
  ]
}
```

**Error Cases** (validated in PASS 2):
- References non-existent table
- References non-existent column
- Invalid FK qualifier (FK doesn't exist or doesn't point to target table)
- SYNC from child table (wrong direction)
- Aggregate from parent table (wrong direction)
- Invalid WHERE clause SQL syntax
- WHERE clause references non-existent columns

---

### Step 6: Build Column Dependency Graph (Per Table)

**When**: PASS 2 - After all tables and columns are processed

**Goal**: Determine column computation order and detect cycles

**Input**: List of dependency edges collected during PASS 1

**Processing**:
1. Build directed graph from edges: `[(fromColumn, toColumn), ...]`
2. Use topological sort to find computation order
3. Detect cycles using DFS (reuse topological-sort.ts)
4. Assign column layers (like table layers, but for columns)

**Example**:
```yaml
columns:
  amount_input: numeric(12,2)
  sign_flip: boolean
  amount:
    formula: "CASE WHEN sign_flip THEN -amount_input ELSE amount_input END"
  balance:
    formula: "amount * 2"
```

**SQL Parser extracts dependencies**:
- `amount` depends on: `sign_flip`, `amount_input`
- `balance` depends on: `amount`

**Edges stored during PASS 1**:
```
['amount', 'sign_flip']
['amount', 'amount_input']
['balance', 'amount']
```

**Dependency Graph built in PASS 2**:
```
amount_input → amount → balance
sign_flip -----↗
```

**Column Layers**:
- Layer 0: `amount_input`, `sign_flip` (no dependencies)
- Layer 1: `amount` (depends on layer 0)
- Layer 2: `balance` (depends on layer 1)

**Error Cases**:
- Cycle detected (e.g., `a` depends on `b`, `b` depends on `a`)

---

### Step 7: Detect Formula Cycles

**When**: PASS 2 - During column dependency graph building

**Example of Invalid Cycle**:
```yaml
a:
  formula: "b + 1"
b:
  formula: "a + 1"
```

**Error Message**:
```
Formula cycle detected in table 'foo':
  a → b → a
```

---

### Step 8: Validate Formulas and Automations

**Validation Rules**:

1. **Formula columns**:
   - Must have `definition` (SQL type)
   - Can only reference columns in same table
   - Cannot reference other tables (use automation for that)
   - All referenced columns must exist
   - No cycles allowed

2. **Automation columns**:
   - Must have `definition` (SQL type)
   - Must reference valid table via `@tableName.column`
   - Direction must be correct:
     - `SYNC` - from parent table (table we have FK to)
     - `SUM/COUNT/MIN/MAX` - from child table (table that has FK to us)
   - FK qualifier (if present) must be valid FK name
   - WHERE clause (if present) must be valid SQL expression

3. **Columns cannot have both `formula` AND `automation`**
   - Pick one computation method

---

### Step 9: Process Constraints (CHECK)

**When**: PASS 2 - After all columns are validated

**Input**: Table-level `constraints` array
```yaml
constraints:
  - NOT (batch_type_id = 1 AND batch_count > 1)
```

**Processing**:
1. Wrap in `SELECT * FROM table WHERE ${constraint}`
2. Parse using SQL parser to validate syntax
3. Extract column references using AST visitor
4. Validate all referenced columns exist
5. Generate constraint name
6. Store for SQL generation

**SQL Parser for CHECK constraints**:
```typescript
const constraint = "NOT (batch_type_id = 1 AND batch_count > 1)";
const sql = `SELECT * FROM batch_types WHERE ${constraint}`;
const ast = parse(sql);  // Validates SQL syntax
const columns = extractColumns(ast);  // ['batch_type_id', 'batch_count']
```

**Error Cases**:
- Invalid SQL syntax
- References non-existent column

---

### Step 10: Process Unique Constraints

**When**: PASS 2 - After all columns are validated

**Input**: Table-level `unique-constraints` array
```yaml
unique-constraints:
  - [account_id, tag_code]
  - [institution, trxid]
```

**Processing**:
1. For each unique constraint definition (array of column names)
2. Validate all columns exist in table
3. Generate constraint name (e.g., `uq_tablename_col1_col2`)
4. Store for SQL generation

**Error Cases**:
- References non-existent column
- Empty constraint definition
- Duplicate constraint definition

---

### Step 11: Process Indexes

**When**: PASS 2 - After all columns are validated

**Input**: Table-level `indexes` array
```yaml
indexes:
  - [institution, trxid]
  - [account_id, date]
```

**Processing**:
1. For each index definition (array of column names)
2. Validate all columns exist in table
3. Generate index name (e.g., `idx_tablename_col1_col2`)
4. Store for SQL generation

**Error Cases**:
- References non-existent column
- Empty index definition
- Duplicate index definition

---

### Step 12: Process Seed Rows

**When**: PASS 1 - During table processing (after columns are resolved)

**Input**: Table-level `seed-rows` array
```yaml
seed-rows:
  - { category: Asset, display_order: 1 }
```

**Processing**:
1. Validate all column names exist
2. Validate values match column types
3. Substitute constants (${CONSTANT_NAME})
4. Store for content generation

**Error Cases**:
- References non-existent column
- Value type mismatch
- References undefined constant

---

## Processing Order Summary

### PASS 1: Layer-by-Layer Column Processing

```
For each layer (0, 1, 2, ...):
  For each table in layer:
    For each column in table:
      1. Resolve $ref (reusable column expansion)
      2. Infer FK column definition (from parent PK)
      3. Parse formula using SQL parser → extract dependencies → store as edges
      4. Parse automation using SQL parser → extract dependencies → store as edges
      5. Validate column definition is populated

    Populate FK metadata (parent column name + definition)
    Process seed-rows
```

### PASS 2: Table-Level Validation & Graph Building

```
For each table:
  1. Validate unique-constraints (all columns exist)
  2. Validate indexes (all columns exist)
  3. Parse and validate table-level CHECK constraints using SQL parser
  4. Build column dependency graph from collected edges
  5. Detect formula cycles → ERROR if found
  6. Assign column computation layers (topological sort)
  7. Validate automation references (cross-table)
  8. Build automation dependency graph
  9. Detect automation cycles → ERROR if found (if we decide to disallow them)
```

**Why two passes?**
- Pass 1 (layer-by-layer): Ensures parent tables are fully defined before children, allows FK definition inference
- Pass 2 (all tables): All columns exist, so we can validate cross-table references and build dependency graphs

---

## Output: ProcessedSchema

The final output should be a fully-populated, validated schema ready for database operations:

```typescript
interface ProcessedSchema {
  schemaPath: string;
  constants: Map<string, ConstantDef>;
  tables: Map<string, ProcessedTableDef>;
  foreignKeys: ProcessedForeignKeyDef[];
  tableLayers: Map<number, string[]>;
}

interface ProcessedTableDef {
  name: string;
  _yamlLine: number | null;
  columns: Map<string, ProcessedColumnDef>;
  columnLayers: Map<number, string[]>;  // NEW: column computation order
  constraints: ConstraintDef[];
  indexes: IndexDef[];
  seedRows: SeedRowDef[];
  singleton?: boolean;
  comment?: string;
}

interface ProcessedColumnDef {
  name: string;
  definition: string;  // ← ALWAYS POPULATED (no more empty strings!)
  _yamlLine: number | null;

  // Computed column info
  formula?: string;
  _formulaDeps?: string[];  // Columns this formula depends on

  automation?: string;
  _automationDeps?: AutomationDeps;  // Cross-table dependencies

  // Metadata
  comment?: string;
  label?: string;
  format?: string;

  // NO MORE _inferDefinitionFrom or $ref markers!
}

interface ProcessedForeignKeyDef {
  fkName?: string;
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;  // ← ALWAYS POPULATED
  parentPKDefinition: string;  // ← ALWAYS POPULATED
  _yamlLine: number | null;
  deleteAction: string;
  notNull?: boolean;
  autoCreateParent?: boolean;
}
```

---

## Key Principles

1. **Layer-by-layer processing**: Parent tables before children
2. **Single pass per table**: Fully process each table when we get to it
3. **Fail fast**: Validate everything, error immediately on problems
4. **Keep line numbers**: Preserve `_yamlLine` for error reporting
5. **No partial state**: Either fully processed or error
6. **Dependencies before dependents**: Resolve in topological order

---

## Error Messages Should Include

- Table name
- Column name (if applicable)
- YAML line number
- Clear description of the problem
- Suggestion for fix (if possible)

**Example**:
```
Error in table 'ledger', column 'balance' (line 156):
  Formula references non-existent column '@invalid_col'
  Available columns: amount, account_id_debit, account_id_credit
```

---

## Test Coverage Needed

Based on elite-finance.yaml, we need to handle:

1. ✅ Simple tables (no FKs, no formulas)
2. ✅ Tables with FKs (infer definitions)
3. ✅ Tables with multiple FKs to same parent
4. ✅ Tables with reusable columns ($ref)
5. ✅ Tables with formula columns
6. ✅ Tables with automation columns (SYNC, SUM, COUNT, etc.)
7. ✅ Tables with WHERE clauses in automations
8. ✅ Tables with FK qualifiers in automations
9. ✅ Tables with constraints (CHECK)
10. ✅ Tables with indexes
11. ✅ Tables with seed-rows
12. ✅ Singleton tables
13. ✅ Constant substitution in seed-rows
14. ✅ Formula cycles (error case)
15. ✅ Invalid column references (error case)

---

## Implementation Files

**Suggested structure**:

```
src/helpers-processor/
  schema-processor.ts         ← Main processing orchestrator
  column-resolver.ts          ← Resolve $ref and infer definitions
  dependency-extractor.ts     ← Parse formulas/automations for deps
  column-graph.ts             ← Build column dependency graph
  validation.ts               ← Validate formulas, automations, etc.
```

Or keep it simpler with one file if the logic is cohesive.

---

## Next Steps

1. Create `src/helpers-processor/schema-processor.ts`
2. Implement layer-by-layer processing loop
3. Implement each processing step as a function
4. Add comprehensive error handling with line numbers
5. Write tests for each processing step
6. Run against elite-finance.yaml and verify output
