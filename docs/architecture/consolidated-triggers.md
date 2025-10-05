Previous: [Design Documentation](design.md) | Next: [Calculated Columns](../guides/calculated-columns.md)

# Consolidated Trigger Architecture

## Overview

GenLogic uses a consolidated trigger architecture where each table has a single BEFORE trigger per operation (INSERT, UPDATE, DELETE) instead of multiple specialized triggers.

Key characteristics:
1. Predictable execution order - Automation and calculation steps follow a defined sequence
2. Infinite loop prevention - Change detection ensures triggers only fire when values actually change
3. One trigger per table/operation
4. Reduced trigger overhead compared to multiple separate triggers

## Core Design Principles

### 1. One Trigger Per Table Per Operation

Each table gets up to three triggers:
- `{table}_before_insert_genlogic` - Handles INSERT operations
- `{table}_before_update_genlogic` - Handles UPDATE operations
- `{table}_before_delete_genlogic` - Handles DELETE operations

All automation logic and calculated columns for a given operation are consolidated into its single trigger function.

### 2. BEFORE Triggers

All triggers fire BEFORE the operation completes. This allows:
- Modifying NEW row values before they are written to disk
- Calculated columns to compute values
- FOLLOW automations to fetch values from parent tables
- Change detection by comparing OLD vs NEW values

### 3. Four-Step Execution Order

Within each UPDATE trigger, steps execute in this order:

```
1. PUSH to children (FOLLOW)            - Cascade parent changes downward
2. PULL from parents (when FK changes)  - Fetch new parent values
3. Calculate calculated columns          - Evaluate expressions in dependency order
4. PUSH to parents (aggregations)       - Update parent aggregations
```

This ordering ensures:
- Children see parent changes immediately
- New parent values are fetched before calculations
- Calculations run after all data dependencies are resolved
- Parent aggregations reflect final child values

### 4. Change Detection Prevents Infinite Loops

Every PUSH operation (steps 1 and 4) includes change detection:

```sql
-- Only push to children if parent columns actually changed
IF OLD.parent_value IS DISTINCT FROM NEW.parent_value THEN
  UPDATE child SET fetched_parent_value = NEW.parent_value
  WHERE parent_fk_id = NEW.id;
END IF;
```

The `IS DISTINCT FROM` operator is NULL-safe: `NULL IS DISTINCT FROM NULL` returns FALSE.

This breaks potential infinite loops because:
- Parent → Child cascade only fires if parent columns changed
- Child → Parent aggregation only fires if child columns changed
- If no values change, no updates occur, loop terminates

## Example: Parent/Child with Bidirectional Automations

Consider this schema with potential infinite loop:

```yaml
tables:
  parent:
    columns:
      parent_id: { type: integer, primary_key: true, sequence: true }
      parent_value: { type: numeric, size: 10, decimal: 2 }

      # Aggregation from children
      child_sum:
        type: numeric
        size: 10
        decimal: 2
        automation:
          type: SUM
          table: child
          foreign_key: parent_fk
          column: child_value

      # Calculated column
      total:
        type: numeric
        size: 10
        decimal: 2
        calculated: "COALESCE(parent_value, 0) + COALESCE(child_sum, 0)"

  child:
    foreign_keys:
      parent_fk: { table: parent }
    columns:
      child_id: { type: integer, primary_key: true, sequence: true }
      child_value: { type: numeric, size: 10, decimal: 2 }

      # FOLLOW from parent
      fetched_parent_value:
        type: numeric
        size: 10
        decimal: 2
        automation:
          type: FOLLOW
          table: parent
          foreign_key: parent_fk
          column: parent_value

      # Calculated column
      doubled:
        type: numeric
        size: 10
        decimal: 2
        calculated: "COALESCE(fetched_parent_value, 0) * 2"
```

### Generated Parent UPDATE Trigger

```sql
CREATE OR REPLACE FUNCTION parent_before_update_genlogic()
RETURNS TRIGGER AS $$
BEGIN
  -- Step 1: PUSH to children (FOLLOW with change detection)
  IF OLD.parent_value IS DISTINCT FROM NEW.parent_value THEN
    UPDATE child SET
      fetched_parent_value = NEW.parent_value
    WHERE parent_fk_id = NEW.parent_id;
  END IF;

  -- Step 2: PULL from parents (none - parent has no FK)

  -- Step 3: Calculate calculated columns (in dependency order)
  NEW.total := COALESCE(NEW.parent_value, 0) + COALESCE(NEW.child_sum, 0);

  -- Step 4: PUSH to parents (none - parent has no parent)

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER parent_before_update_genlogic
  BEFORE UPDATE ON parent
  FOR EACH ROW EXECUTE FUNCTION parent_before_update_genlogic();
```

### Generated Child UPDATE Trigger

```sql
CREATE OR REPLACE FUNCTION child_before_update_genlogic()
RETURNS TRIGGER AS $$
BEGIN
  -- Step 1: PUSH to children (none - child has no children)

  -- Step 2: PULL from parents (if FK changed)
  IF OLD.parent_fk_id IS DISTINCT FROM NEW.parent_fk_id THEN
    SELECT parent_value
    INTO NEW.fetched_parent_value
    FROM parent
    WHERE parent_id = NEW.parent_fk_id;
  END IF;

  -- Step 3: Calculate calculated columns (in dependency order)
  NEW.doubled := COALESCE(NEW.fetched_parent_value, 0) * 2;

  -- Step 4: PUSH to parents (aggregations with change detection)
  IF OLD.child_value IS DISTINCT FROM NEW.child_value THEN
    -- Update old parent's aggregation (if FK changed)
    IF OLD.parent_fk_id IS DISTINCT FROM NEW.parent_fk_id AND OLD.parent_fk_id IS NOT NULL THEN
      UPDATE parent SET
        child_sum = COALESCE(child_sum, 0) - COALESCE(OLD.child_value, 0)
      WHERE parent_id = OLD.parent_fk_id;
    END IF;

    -- Update new parent's aggregation
    IF NEW.parent_fk_id IS NOT NULL THEN
      UPDATE parent SET
        child_sum = COALESCE(child_sum, 0) + COALESCE(NEW.child_value, 0) - COALESCE(OLD.child_value, 0)
      WHERE parent_id = NEW.parent_fk_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER child_before_update_genlogic
  BEFORE UPDATE ON child
  FOR EACH ROW EXECUTE FUNCTION child_before_update_genlogic();
```

### Why This Doesn't Loop Infinitely

Scenario: User updates `parent.parent_value`

1. Parent UPDATE trigger fires:
   - Step 1: `parent_value` changed → Push to children
   - Child UPDATE trigger fires (for each child):
     - Step 1: (none)
     - Step 2: FK unchanged → No pull
     - Step 3: `fetched_parent_value` changed → Recalculate `doubled`
     - Step 4: `child_value` unchanged → No push to parent
   - Step 3: Recalculate `total`
   - Step 4: (none)

The loop terminates at child Step 4 because `child_value` didn't change, so no push to parent occurs.

Scenario: User updates `child.child_value`

1. Child UPDATE trigger fires:
   - Step 1: (none)
   - Step 2: FK unchanged → No pull
   - Step 3: Recalculate `doubled`
   - Step 4: `child_value` changed → Push to parent
   - Parent UPDATE trigger fires:
     - Step 1: `parent_value` unchanged → No push to children
     - Step 3: `child_sum` changed → Recalculate `total`
     - Step 4: (none)

The loop terminates at parent Step 1 because `parent_value` didn't change, so no push to children occurs.

## Trigger Generation Details

### Data Structure: TableAutomations

All automation and calculation logic for a table is organized in the `TableAutomations` interface:

```typescript
interface TableAutomations {
  tableName: string;

  // Step 1: PUSH to children (FOLLOW)
  pushToChildren: Array<{
    childTable: string;
    foreignKeyName: string;
    columns: Array<{
      parentColumn: string;
      childColumn: string;
      isFetchUpdates: boolean;
    }>;
  }>;

  // Step 2: PULL from parents
  pullFromParents: Array<{
    parentTable: string;
    foreignKeyName: string;
    fkColumns: string[];
    columns: Array<{
      parentColumn: string;
      childColumn: string;
    }>;
  }>;

  // Step 3: Calculate columns
  calculatedColumns: Array<{
    columnName: string;
    expression: string;
  }>;

  // Step 4: PUSH to parents (aggregations)
  pushToParents: Array<{
    parentTable: string;
    foreignKeyName: string;
    fkColumns: string[];
    aggregations: Array<{
      parentColumn: string;
      aggregationType: string;
      childColumn: string;
    }>;
  }>;
}
```

This structure is built by analyzing the schema and grouping instances of automation by table.

### Change Detection Utilities

Two helper functions generate change detection SQL:

```typescript
private generateChangeDetection(columnName: string): string {
  return `OLD.${columnName} IS DISTINCT FROM NEW.${columnName}`;
}

private generateChangeDetectionMultiple(columnNames: string[]): string {
  if (columnNames.length === 0) return 'FALSE';
  if (columnNames.length === 1) return this.generateChangeDetection(columnNames[0]);
  return columnNames.map(col => this.generateChangeDetection(col)).join(' OR ');
}
```

These ensure NULL-safe comparisons using PostgreSQL's `IS DISTINCT FROM` operator.

### Trigger Generation Flow

For each table with automation or calculated columns:

1. Analyze schema to build `TableAutomations` data structure
2. Group instances of automation by direction and type
3. Order calculated columns using topological sort on dependency graph
4. Generate INSERT trigger if needed (steps 1, 3, 4)
5. Generate UPDATE trigger if needed (all steps)
6. Generate DELETE trigger if needed (step 4 only - remove from parent aggregations)

Each trigger is generated by:
1. Creating function header with proper naming: `{table}_after_{operation}_genlogic`
2. Generating each step's SQL code conditionally
3. Combining steps in the correct order
4. Creating trigger that calls the function

## Cycle Detection

### What IS Checked: Foreign Key Structural Cycles

The system detects cycles in foreign key relationships using the `DataFlowGraphValidator`:

```yaml
# REJECTED - FK cycle detected
tables:
  table_a:
    foreign_keys:
      fk_b: { table: table_b }

  table_b:
    foreign_keys:
      fk_a: { table: table_a }  # Cycle: A → B → A
```

This is checked because FK cycles create ambiguous hierarchies and can cause referential integrity issues.

### What IS Checked: Calculated Column Cycles

The system detects cycles in calculated column dependencies within each table:

```yaml
# REJECTED - calculated column cycle
columns:
  col_a:
    type: integer
    calculated: "col_b + 1"
  col_b:
    type: integer
    calculated: "col_a + 1"  # Cycle: col_a → col_b → col_a
```

This is checked because circular calculations cannot be evaluated.

### What IS NOT Checked: Automation Cycles

Cycles in automation between tables are not detected or blocked:

```yaml
# ALLOWED - automation cycle is safe with change detection
tables:
  parent:
    columns:
      child_sum:
        automation:
          type: SUM
          table: child
          column: child_value  # parent ← child

  child:
    foreign_keys:
      parent_fk: { table: parent }
    columns:
      fetched_value:
        automation:
          type: FOLLOW
          table: parent
          column: parent_value  # child ← parent (cycle!)
```

This is safe because:
1. Runtime change detection breaks the loop (see examples above)
2. Cycles are often useful (bidirectional data flow between parent/child)

## Comparison: Old vs New Architecture

| Aspect | Old (Separate Triggers) | New (Consolidated) |
|--------|------------------------|-------------------|
| Triggers per table | 3-6+ triggers | 1-3 triggers (INSERT/UPDATE/DELETE) |
| Timing | Mix of BEFORE and AFTER | All BEFORE |
| Execution order | Implicit (trigger naming) | Explicit (numbered steps) |
| Loop prevention | Not addressed | Change detection in every PUSH |
| Maintainability | Complex, scattered logic | Simple, centralized logic |
| Calculated columns | Separate BEFORE trigger | Integrated at Step 3 |
| Change detection | Not implemented | Built into every cascade |


## Files Implementing This Architecture

### src/trigger-generator.ts
The main implementation file. Key methods:

- `generateTriggers()` - Entry point, builds `TableAutomations` for all tables
- `buildTableAutomations()` - Analyzes schema to populate the data structure
- `generateConsolidatedInsertTrigger()` - Generates INSERT triggers
- `generateConsolidatedUpdateTrigger()` - Generates UPDATE triggers (most complex)
- `generateConsolidatedDeleteTrigger()` - Generates DELETE triggers
- `generatePushToChildren()` - Step 1 logic with change detection
- `generatePullFromParents()` - Step 2 logic with foreign key change detection
- `generateCalculatedColumns()` - Step 3 logic in dependency order
- `generatePushToParents()` - Step 4 logic with change detection

### src/graph.ts
Validation and graph analysis:

- `buildForeignKeyGraph()` - Builds FK relationship graph
- `buildCalculatedColumnGraphs()` - Builds per-table calculated dependency graphs
- `detectCycles()` - DFS cycle detection algorithm
- `validateDataFlowSafety()` - Main validation entry point
  - ✅ Checks FK structural cycles
  - ✅ Checks calculated column cycles
  - ❌ Does NOT check automation cycles (by design)

### src/processor.ts
Integration into main processing pipeline:

```typescript
const triggerStatements = this.triggerGenerator.generateTriggers(schema, processedSchema);
```

Triggers are generated after schema processing and included in the SQL execution plan.

## Testing

### Manual Testing
Use test mode to validate trigger generation without database:

```bash
bun run src/cli.ts -s test_consolidated_triggers.yaml --test-mode
```

### Viewing Generated SQL
Enable debug mode to see all generated SQL:

```bash
DEBUG_SQL=1 bun run src/cli.ts -s test_consolidated_triggers.yaml --dry-run
```

### Test Schemas
- `test_simple_consolidated.yaml` - Basic SUM aggregation and calculated columns
- `test_consolidated_triggers.yaml` - Complex Parent/Child with FOLLOW, calculations, and aggregations

### Integration Tests
Database tests verify the complete trigger execution flow with real data.

## Best Practices

### 1. Trust Change Detection
Don't try to manually optimize or skip change detection. The `IS DISTINCT FROM` check is fast and necessary for correctness.

### 2. Order Calculated Columns Carefully
If column A depends on column B, B must be calculated first. The topological sort handles this automatically - just define dependencies correctly in the schema.

### 3. Use COALESCE for NULL Safety
Both calculated columns and change detection handle NULLs correctly, but your SQL expressions should still use `COALESCE()` to avoid NULL propagation:

```yaml
calculated: "COALESCE(a, 0) + COALESCE(b, 0)"  # Good
calculated: "a + b"  # NULL + anything = NULL
```

### 4. Test Bidirectional Flows
When you have parent ↔ child automation (SUM + FOLLOW), test updates in both directions to verify loop prevention works.

### 5. Understand the Four Steps
When debugging trigger issues, trace through the four steps sequentially. Most issues are ordering problems (e.g., calculating before pulling from parent).



---

Previous: [Design Documentation](design.md) | Next: [NULL Handling](null-handling.md)
