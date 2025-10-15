# Refactoring Plan: Validation Through Construction

## Context

**Current State:**
- Completed Phase 1 (CLI) review: 9 tests passing, all accurate to code
- Completed Phase 2 (Schema Loading) review: 2 tests passing, all accurate to code
- Total: 45 tests (38 passing, 7 failing in phases 4-5)
- Test runner supports filtering: `bun tests/run-cli-tests.ts 01-cli`
- Version reads from package.json (0.1.0), test uses regex pattern

**What We Found During Review:**
- cli.ts: Clean entry point, now validates all required args (database, user, password, schema)
- processor.ts: Orchestrator with 9+ phases, redundant validation spread across phases
- Phases 3, 4, 4.5 in wrong order: should be graph → layers → process
- Phases 5.3-5.6 duplicate validation after processing (checking what already built)

**Key Insight:**
User has 20 years of manual SQL generation experience. Manual approach:
1. Load reusable columns
2. Build FK graph and compute layers (fail on cycles)
3. Process tables layer-by-layer (parent before child)
4. Validate as you build (parent always exists when child references it)

This is compiler-style: build symbol table, process in dependency order.

**Decision Point:**
- Refactor now (this plan) vs continue reviewing then refactor later
- Chose refactor now to prevent adding more redundancy as we continue review

**After Refactoring:**
- Continue phase-by-phase review (Phase 3: Validation, Phase 4: Schema Features, Phase 5: Behavior)
- Fix 7 failing tests (mostly calculated-columns and automations)
- Complete documentation for all phases

## Problem Statement

Current code has redundant validation phases:
- Phase 3: validateCrossReferences - checks if tables/columns exist
- Phase 4: validateDataFlowSafety - builds graphs, detects cycles
- Phase 4.5: assignTableLayers - computes topological ordering
- Phase 5: processSchema - builds columns using layers
- Phase 5.3-5.6: More validation AFTER processing

This creates:
- Duplication: checking "does X exist?" in multiple places
- Complexity: validation logic spread across 8 phases
- Fragility: adding features requires updating multiple validators
- Unnatural flow: build topology AFTER validation, but validation needs topology

## Core Insight

If we process tables in topological order (layers), then when building table at layer N:
- All tables at layers 0..N-1 are already complete
- Parent columns exist before child references them
- Validation becomes: "does this reference exist in already-built tables?"

This is how compilers work: build dependency graph, then compile in order.

## Proposed Flow

```
Phase 1: Load YAML
Phase 2: Syntax validation (JSON Schema - structure only)
Phase 3: Build reusable columns store
Phase 4: Build FK graph and compute layers (FAIL FAST on cycles)
Phase 5: Process tables layer-by-layer with integrated validation
  For each table in layer order:
    - Resolve column inheritance (from reusable columns)
    - Generate FK columns (parent PKs already known)
    - Validate generated column references (dependencies exist)
    - Validate automations (FKs and columns exist)
    - Validate auto_create (all columns exist)
    - Validate indexes/constraints (columns exist)
Phase 6+: Database operations (unchanged)
```

## New Orchestrator

```typescript
async process(schemaPath: string): Promise<void> {
  console.log('🚀 GenLogic - Augmented Normalization Processor');

  try {
    // PHASE 1: Load and parse YAML
    console.log('📄 Loading YAML schema...');
    const schema = this.loadYamlSchema(schemaPath);

    // PHASE 2: Syntax validation (structure only - uses JSON Schema)
    console.log('✅ Validating schema syntax...');
    const syntaxResult = this.validator.validateSyntax(schema);
    if (!syntaxResult.isValid) {
      throw new Error(`Schema syntax validation failed:\n${syntaxResult.errors.join('\n')}`);
    }

    // PHASE 3: Build reusable columns store
    console.log('📦 Building reusable columns...');
    const reusableColumns = this.buildReusableColumnsStore(schema);

    // PHASE 4: Build FK graph and assign layers (FAIL FAST on cycles)
    console.log('🌐 Building dependency graph...');
    const fkGraph = this.graphValidator.buildForeignKeyGraph(schema);
    const cycleResult = this.graphValidator.detectCycles(fkGraph);
    if (!cycleResult.isValid) {
      throw new Error(`Foreign key cycles detected:\n${cycleResult.errors.join('\n')}`);
    }
    const tableLayers = this.graphValidator.assignTableLayers(fkGraph);
    console.log(`   Tables organized into ${Math.max(...tableLayers.values()) + 1} layers`);

    // PHASE 5: Process schema layer-by-layer with integrated validation
    console.log('🔄 Processing schema by layers...');
    const processedSchema = this.schemaProcessor.processSchemaByLayers(
      schema,
      tableLayers,
      reusableColumns
    );

    // PHASE 6: Database introspection and diffing
    console.log('🔍 Analyzing current database state...');
    await this.database.connect();

    // ... rest unchanged ...
  }
}
```

## Key Changes

### 1. Remove Redundant Validators

DELETE these methods (logic moves to processSchemaByLayers):
- `validateCrossReferences()` - checking if tables/columns exist
- `validateGeneratedColumnReferences()` - checking after processing
- `validateAutomationInference()` - checking after processing
- `validateSyncDefinitions()` - checking after processing
- `validateIndexesAndConstraints()` - checking after processing

### 2. Build Reusable Columns Store

NEW method in SchemaProcessor:

```typescript
buildReusableColumnsStore(schema: GenLogicSchema): Map<string, ResolvedColumn> {
  const store = new Map<string, ResolvedColumn>();

  if (!schema.columns) return store;

  // Resolve reusable columns (may reference each other)
  // Process in dependency order to handle $ref chains
  for (const [name, def] of Object.entries(schema.columns)) {
    store.set(name, this.resolveReusableColumn(name, def, store));
  }

  return store;
}
```

### 3. Process Schema By Layers

REPLACE `processSchema()` with:

```typescript
processSchemaByLayers(
  schema: GenLogicSchema,
  layers: Map<string, number>,
  reusableColumns: Map<string, ResolvedColumn>
): ProcessedSchema {

  const processedTables = new Map<string, ProcessedTable>();
  const maxLayer = Math.max(...layers.values());

  // Process tables layer by layer
  for (let layer = 0; layer <= maxLayer; layer++) {
    const tablesInLayer = [...layers.entries()]
      .filter(([_, l]) => l === layer)
      .map(([name, _]) => name);

    for (const tableName of tablesInLayer) {
      const table = schema.tables[tableName];

      // Build columns for this table
      const processedTable = this.processTable(
        tableName,
        table,
        schema,
        reusableColumns,
        processedTables  // Previously processed tables
      );

      processedTables.set(tableName, processedTable);
    }
  }

  return { tables: processedTables };
}
```

### 4. Validate During Processing

MODIFY `processTable()` to validate as it builds:

```typescript
private processTable(
  tableName: string,
  table: TableDef,
  schema: GenLogicSchema,
  reusableColumns: Map<string, ResolvedColumn>,
  processedTables: Map<string, ProcessedTable>
): ProcessedTable {

  const columns = new Map<string, ProcessedColumn>();

  // Step 1: Resolve column inheritance
  for (const [colName, colDef] of Object.entries(table.columns)) {
    const resolved = this.resolveColumn(
      tableName,
      colName,
      colDef,
      reusableColumns
    );
    columns.set(colName, resolved);
  }

  // Step 2: Generate FK columns (parent tables already processed)
  if (table.foreign_keys) {
    for (const [fkName, fkDef] of Object.entries(table.foreign_keys)) {
      const parentTable = processedTables.get(fkDef.table);
      if (!parentTable) {
        throw new Error(
          `Table '${tableName}', FK '${fkName}': ` +
          `parent table '${fkDef.table}' not yet processed ` +
          `(this indicates layer calculation error)`
        );
      }

      const fkColumns = this.generateFKColumns(fkName, parentTable);
      for (const [fkColName, fkCol] of fkColumns) {
        columns.set(fkColName, fkCol);
      }
    }
  }

  // Step 3: Validate generated columns (dependencies must exist in THIS table)
  for (const [colName, col] of columns) {
    if (col.generated) {
      this.validateGeneratedColumn(tableName, colName, col, columns);
    }
  }

  // Step 4: Validate automations (FK and columns must exist)
  for (const [colName, col] of columns) {
    if (col.automation) {
      this.validateAutomation(
        tableName,
        colName,
        col,
        table,
        schema,
        processedTables
      );
    }
  }

  // Step 5: Validate auto_create (all referenced columns must exist)
  if (table.foreign_keys) {
    for (const [fkName, fkDef] of Object.entries(table.foreign_keys)) {
      if (fkDef.auto_create) {
        this.validateAutoCreate(
          tableName,
          fkName,
          fkDef,
          columns,
          processedTables
        );
      }
    }
  }

  // Step 6: Validate indexes and constraints (columns must exist)
  this.validateIndexesAndConstraints(tableName, table, columns);

  return { columns };
}
```

## Critical Comments to Add

Add this comment at the TOP of `schema-processor.ts`:

```typescript
/**
 * ARCHITECTURAL PRINCIPLE: Validation Through Construction
 *
 * GenLogic validates by BUILDING the schema in topological order, not by
 * running separate validation passes. This is INTENTIONAL and CRITICAL.
 *
 * HOW IT WORKS:
 * 1. Build FK graph and compute layers (fail fast on cycles)
 * 2. Process tables in layer order (0, 1, 2, ...)
 * 3. When building table at layer N, all layers 0..N-1 are complete
 * 4. Parent columns ALWAYS exist before child references them
 * 5. Validation is: "does this reference exist in already-built schema?"
 *
 * WHY NOT SEPARATE VALIDATION:
 * - Separate validation duplicates the "what exists?" logic
 * - Separate validation can't use topology (needs to check everything)
 * - Adding features requires validation in TWO places (error-prone)
 * - Natural compiler approach: build dependency graph → process in order
 *
 * DO NOT ADD:
 * ❌ validateCrossReferences() before processing
 * ❌ validateGeneratedColumns() after processing
 * ❌ validateAutomations() as separate phase
 * ❌ Any "does X exist?" validation as separate method
 *
 * INSTEAD:
 * ✅ Validate during processSchemaByLayers()
 * ✅ Check references as columns are built
 * ✅ Use processedTables map to know what's available
 * ✅ Throw immediately when reference not found
 *
 * This matches your 20 years of manual SQL generation experience:
 * build parents first, then children can safely reference them.
 */
```

Add this comment before `processSchemaByLayers()`:

```typescript
/**
 * Process schema layer-by-layer with integrated validation
 *
 * LAYER-BY-LAYER PROCESSING:
 * - Layer 0: Tables with no FKs (no dependencies)
 * - Layer 1: Tables with FKs only to Layer 0
 * - Layer 2: Tables with FKs to Layers 0 or 1
 * - etc.
 *
 * VALIDATION HAPPENS DURING PROCESSING:
 * Each table is built and validated as we process it.
 * By processing in layer order, parent tables are always
 * complete before child tables reference them.
 *
 * NO SEPARATE VALIDATION PASSES NEEDED:
 * - Column references validated as columns built
 * - FK references validated as FK columns generated
 * - Generated column deps validated after all columns defined
 * - Automations validated when table complete
 *
 * This is faster, simpler, and more maintainable than
 * separate validate-then-process approach.
 */
```

## Migration Strategy

1. Create new methods alongside old ones (don't break tests)
2. Add `processSchemaByLayers()` to SchemaProcessor
3. Update orchestrator to call new method
4. Run all tests - should still pass
5. Remove old validation methods once tests pass
6. Update test documentation to reflect new flow

## Benefits

1. Fail fast: Cycles detected before any processing
2. Simpler: Single pass through schema
3. Maintainable: Validation logic in one place
4. Natural: Matches FK dependency order
5. Compiler-like: Build symbol table, process in order
6. Fewer bugs: Can't forget to validate in multiple places

## Risks

1. More complex processTable() method
2. Harder to test validation in isolation
3. Need careful error messages to indicate which validation failed

## Test Strategy

Tests should verify:
- Cycle detection still works (graph tests)
- Reference validation still works (now in processTable)
- Error messages are clear (indicate what failed where)
- Layer ordering is correct (parent before child)

## Next Steps

1. Review this plan
2. Create new methods (don't delete old ones yet)
3. Switch orchestrator to new flow
4. Verify tests pass
5. Delete old validation methods
6. Update documentation
