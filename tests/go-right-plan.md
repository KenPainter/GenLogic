# GenLogic Go-Right Test Plan

Comprehensive test coverage for GenLogic features when schemas are valid and processing succeeds.

## Test Organization

### **Group 1: Core Schema Operations**
*Foundation tests for basic DDL generation*

Directory: tests/build-core

#### 1A. Blank Database Bootstrap
- Empty database → Create simple schema
- Verify tables created in correct layer order
- Verify all columns have correct types
- Re-run same schema → Zero changes (idempotency)

#### 1B. Schema Evolution
- Start with simple schema
- Add new table (layer 0)
- Add new table with FK dependency (creates new layer)
- Add column to existing table
- Modify column type
- Verify diff engine correctly identifies changes

#### 1C. Primary Keys
- Single column PK
- Serial PK
- PK with different integer types (smallint, bigint)
- Table without PK (should work for lookup tables)

---

### **Group 2: Foreign Keys & Relationships**
*FK behavior, cascades, and data pipelines*

#### 2A. FK Basics
- Simple parent-child relationship
- Multi-level hierarchy (3-4 levels)
- Multiple FKs to same parent table
- Self-referential FK (allowed)

#### 2B. FK Delete Actions
- `delete cascade`
- `delete restrict` (default)
- `delete set null`
- `delete set default`
- `delete no action`

#### 2C. FK Auto-Create Parent
- Insert child with `auto create parent` → parent row created automatically
- Verify parent created with correct PK value
- Multiple children auto-creating same parent (deduplication)

#### 2D. Layer Ordering
- Verify tables created in correct dependency order
- Verify seed data inserted in layer order
- 4-level hierarchy test

---

### **Group 3: Automation - Pull from Parents**
*Child columns that pull values from parent*

#### 3A. SYNC Automation
- Child pulls value from parent on INSERT
- Child updates value when FK changes (UPDATE)
- Child updates when parent value changes (push-to-children trigger)
- Verify SYNC always matches current parent value

#### 3B. SNAPSHOT Automation
- Child captures parent value on INSERT
- Value does NOT change when FK changes
- Value does NOT change when parent changes
- Historical point-in-time capture

#### 3C. MATCH Automation
- Child pulls value based on matching parent column (not FK)
- Lookup table pattern
- Verify correct row matched

---

### **Group 4: Automation - Push to Parents**
*Parent columns that aggregate child values*

#### 4A. SUM Automation
- Parent sums numeric column from children
- INSERT child → parent updates
- UPDATE child value → parent updates
- DELETE child → parent updates
- Multiple children

#### 4B. COUNT Automation
- Parent counts children
- INSERT/UPDATE/DELETE updates count
- COUNT with WHERE condition

#### 4C. MAX/MIN Automation (if implemented)
- Parent tracks max/min of child values
- Handles INSERT/UPDATE/DELETE

#### 4D. Aggregation Repair
- Verify `.repair.sql` script regenerates correct aggregations
- Test after manual data corruption

---

### **Group 5: Formula Columns**
*Calculated columns within a row*

#### 5A. Simple Formulas
- Arithmetic expressions (`amount * tax_rate`)
- String concatenation
- Date calculations
- NULL handling

#### 5B. Formula Dependencies
- Formula depends on another formula
- Verify correct layer ordering
- Multi-level formula chains

#### 5C. Formula + Automation
- Formula that uses SYNC'd value from parent
- Automation that uses formula result

---

### **Group 6: Constraints & Integrity**
*Data validation and protection*

#### 6A. NaN/Infinity Protection
- numeric, decimal, real, double precision columns
- Verify CHECK constraint blocks NaN
- Verify CHECK constraint blocks Infinity
- Verify CHECK constraint blocks -Infinity
- Verify NULL is allowed
- Verify normal numbers pass

#### 6B. UNIQUE Constraints
- Single column unique
- Multi-column unique (composite)
- Unique constraint naming

#### 6C. CHECK Constraints
- Custom CHECK expressions
- Verify constraint blocks invalid data
- Verify constraint allows valid data

#### 6D. NOT NULL
- NOT NULL enforcement
- PK columns always NOT NULL
- FK columns with `not null` modifier

---

### **Group 7: Indexes**
*Performance and lookup optimization*

#### 7A. Auto-Generated Indexes
- FK columns auto-indexed
- Unique constraints create indexes
- PK creates index

#### 7B. Custom Indexes
- Single column index
- Multi-column composite index
- Index naming conventions

---

### **Group 8: Seed Data**
*Initial data population*

#### 8A. Basic Seeding
- Insert seed rows
- Verify inserted in layer order (parent before child)
- Verify automations trigger during seed
- Verify formulas calculate during seed

#### 8B. Seed with Lookups
- Seed references other seed rows by natural key
- Cross-table seed dependencies

---

### **Group 9: Constants & Reusable Columns**
*Schema-level reuse*

#### 9A. Constants
- Numeric constants
- String constants
- Constant substitution in definitions
- Constant substitution in defaults
- Recursive constants (constant references constant)

#### 9B. Reusable Columns
- Define once, use many times
- Reusable with extensions
- Verify type consistency

---

### **Group 10: Advanced Triggers**
*Complex multi-table automation*

#### 10A. Cascading Updates
- Parent changes → SYNC children update
- Child aggregation → parent updates → grandparent aggregation updates
- 3-level cascade

#### 10B. Before/After Trigger Sequencing
- Verify correct trigger execution order
- BEFORE INSERT sequence
- BEFORE UPDATE sequence
- AFTER UPDATE/DELETE sequence

#### 10C. Formula + Automation Interplay
- Formula uses SYNC value
- SYNC value uses formula from parent
- Complex dependency chains

---

### **Group 11: Error Handling** ✅
*Schema validation*
- ✅ All 29 error tests passing in `tests/errors-schema/`

---

### **Group 12: Idempotency & Convergence**
*Repeatability and stability*

#### 12A. No-Change Rebuilds
- Run same schema twice → Zero DDL
- Verify `.sql` is empty or only has comments (will have trigger commands)

#### 12B. Schema Normalization
- Equivalent definitions recognized as same
- `varchar(100)` vs `character varying(100)`
- `integer` vs `int` vs `int4`
- Whitespace variations

#### 12C. Live Schema Detection
- Correctly detect all live tables/columns
- Correctly detect all live constraints
- Correctly detect all live indexes
- Correctly populate `.live.json`

---

## Prioritization

### **Phase 1 (Essential)**
Core functionality that must work for GenLogic to be usable:
- Group 1: Core Schema Operations
- Group 2A-2B: FK Basics & Delete Actions
- Group 3A: SYNC Automation
- Group 4A-4B: SUM/COUNT Automation
- Group 5A: Simple Formulas
- Group 6A: NaN Protection
- Group 12A: Idempotency

### **Phase 2 (Important)**
Features that significantly enhance GenLogic's value:
- Group 2C-2D: Auto-create & Layers
- Group 3B-3C: SNAPSHOT/MATCH
- Group 4D: Aggregation Repair
- Group 5B: Formula Dependencies
- Group 6B-6D: Other Constraints
- Group 7: Indexes
- Group 8: Seed Data

### **Phase 3 (Polish)**
Advanced features and edge cases:
- Group 9: Constants & Reusable Columns
- Group 10: Advanced Triggers
- Group 12B-12C: Normalization & Detection

---

## Test Implementation Strategy

### Test Structure

Each test should:
1. **Setup**: Create/drop test database
2. **Schema**: Apply YAML schema via GenLogic processor
3. **Verify Structure**: Query `information_schema` to verify DDL correctness
4. **Verify Behavior**: Insert/update/delete data to verify triggers and constraints
5. **Verify Outputs**: Check generated files (`.sql`, `.diff.json`, `.live.json`, etc.)
6. **Teardown**: Clean up test database

### Assertion Helpers Needed
- `assertTableExists(tableName)`
- `assertColumnExists(table, column, expectedType)`
- `assertConstraintExists(table, constraintName, expectedDef)`
- `assertIndexExists(table, indexName)`
- `assertTriggerExists(table, triggerName)`
- `assertRowCount(table, expectedCount)`
- `assertColumnValue(table, column, pk, expectedValue)`
- `assertSQLFileEmpty(schemaPath)` - for idempotency tests
- `assertDiffHasChanges(diffPath, expectedChanges)`

### Test Database Strategy
- Use test database: genlogic_test
- Test runner drops db at beginning and end of test
- Consider using transactions with rollback for speed (if triggers work in transactions)
  

---

## Current Test Coverage Status

### Completed ✅
- **Group 11**: All 29 error validation tests passing

### In Progress 🚧
- Planning phase (this document)

### Not Started ⏳
- Groups 1-10, 12

---

## Notes

### Existing Test Schemas
The `tests/schemas/` directory has some existing schemas that can be starting points:
- `minimal-table.yaml` - Group 1A candidate
- `constants-substitution.yaml` - Group 9A candidate
- `formula-column.yaml` - Group 5A candidate
- `reusable-column.yaml` - Group 9B candidate
- `child-to-parent-automations.yaml` - Group 4 candidate
- `four-level-hierarchy.md` - Group 2D candidate
- `multiple-fk-same-table.md` - Group 2A candidate

### Key Questions to Answer
1. Should tests run against real PostgreSQL or use mocks?
   - **Recommendation**: Real PostgreSQL for integration testing
2. Should tests verify trigger logic or just DDL generation?
   - **Recommendation**: Both - verify DDL exists AND that it works correctly
3. How to handle test data cleanup between runs?
   - **Recommendation**: Drop/recreate test databases for each group
4. Should we test `.repair.sql` scripts?
   - **Recommendation**: Yes, in Group 4D
5. Should we test permissions generation?
   - **Recommendation**: Later - not critical for Phase 1
