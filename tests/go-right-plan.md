# GenLogic Go-Right Test Plan

Comprehensive test coverage for GenLogic features when schemas are valid and processing succeeds.

## Test Organization

### **Group 1: Core-Relational** (tests/core-relational/)[COMPLETE - PASSING]
*Standard SQL DDL - tables, columns, keys, constraints, indexes, and idempotency*

All database build functions necessary for GenLogic value-add, but without the value-add itself. Proves GenLogic can handle standard SQL correctly, efficiently, and idempotently.

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

#### 1D. FK Basics
- Simple parent-child relationship
- Multi-level hierarchy (3-4 levels)
- Multiple FKs to same parent table
- Self-referential FK (allowed)

#### 1E. FK Delete Actions
- `delete cascade`
- `delete restrict` (default)
- `delete set null`
- `delete set default`
- `delete no action`

#### 1F. Layer Ordering
- Verify tables created in correct dependency order
- Verify seed data inserted in layer order
- 4-level hierarchy test

#### 1G. UNIQUE Constraints
- Single column unique
- Multi-column unique (composite)
- Unique constraint naming

#### 1H. CHECK Constraints
- Custom CHECK expressions
- Verify constraint blocks invalid data
- Verify constraint allows valid data

#### 1I. NOT NULL
- NOT NULL enforcement
- PK columns always NOT NULL
- FK columns with `not null` modifier

#### 1J. Auto-Generated Indexes
- FK columns auto-indexed
- Unique constraints create indexes
- PK creates index

#### 1K. Custom Indexes
- Single column index
- Multi-column composite index
- Index naming conventions

#### 1L. No-Change Rebuilds
(expect some issues on this, GenLogic does not make this
 easy to test.  Do your best and work through it with the user)
- Run same schema twice → Zero DDL
- Verify `.sql` is empty or only has comments (will have trigger commands)

#### 1M. Schema Normalization
- Equivalent definitions recognized as same
- `varchar(100)` vs `character varying(100)`
- `integer` vs `int` vs `int4`
- Whitespace variations

#### 1N. Live Schema Detection
- Correctly detect all live tables/columns
- Correctly detect all live constraints
- Correctly detect all live indexes
- Correctly populate `.live.json`

---

### **Group 2: Automation - Pull from Parents**
*Child columns that pull values from parent*

#### 2A. SYNC Automation
- Child pulls value from parent on INSERT
- Child updates value when FK changes (UPDATE)
- Child updates when parent value changes (push-to-children trigger)
- Verify SYNC always matches current parent value

#### 2B. SNAPSHOT Automation
- Child captures parent value on INSERT
- Value does NOT change when FK changes
- Value does NOT change when parent changes
- Historical point-in-time capture

---

### **Group 3: Automation - Push to Parents**
*Parent columns that aggregate child values*

#### 3A. SUM Automation
- Parent sums numeric column from children
- INSERT child → parent updates
- UPDATE child value → parent updates
- DELETE child → parent updates
- Multiple children

#### 3B. COUNT Automation
- Parent counts children
- INSERT/UPDATE/DELETE updates count
- COUNT with WHERE condition

#### 3C. MAX/MIN Automation (if implemented)
- Parent tracks max/min of child values
- Handles INSERT/UPDATE/DELETE

---

### **Group 4: Formula Columns**
*Calculated columns within a row*

#### 4A. Simple Formulas
- Arithmetic expressions (`amount * tax_rate`)
- String concatenation
- Date calculations
- NULL handling

#### 4B. Formula Dependencies
- Formula depends on another formula
- Verify correct layer ordering
- Multi-level formula chains

#### 4C. Formula + Automation
- Formula that uses SYNC'd value from parent
- Automation that uses formula result

#### 4D. Formula + Automation
 - Formula that populates an FK col, triggering
   SYNC on column that is used in a formula

---

### **Group 5: FK Auto-Create Parent**
*GenLogic-specific FK behavior*

#### 5A. Auto-Create Parent
- Insert child with `auto create parent` → parent row created automatically
- Verify parent created with correct PK value
- Multiple children auto-creating same parent (deduplication)

---

### **Group 6: Seed Data**
*Initial data population with GenLogic features*

#### 6A. Basic Seeding
- Insert seed rows
- Verify inserted in layer order (parent before child)
- Verify automations trigger during seed
- Verify formulas calculate during seed

#### 6B. Seed with Lookups
- Seed references other seed rows by natural key
- Cross-table seed dependencies

---

### **Group 7: Schema Syntax Features**
*GenLogic schema reuse and abstraction*

#### 7A. Constants
- Numeric constants
- String constants
- Constant substitution in definitions
- Constant substitution in defaults
- Recursive constants (constant references constant)

#### 7B. Reusable Columns
- Define once, use many times
- Reusable with extensions
- Verify type consistency

---

### **Group 8: Advanced Triggers**
*Complex multi-table automation*

#### 8A. Cascading Updates
- Parent changes → SYNC children update
- Child aggregation → parent updates → grandparent aggregation updates
- 3-level cascade

#### 8B. Before/After Trigger Sequencing
- Verify correct trigger execution order
- BEFORE INSERT sequence
- BEFORE UPDATE sequence
- AFTER UPDATE/DELETE sequence

#### 8C. Formula + Automation Interplay
- Formula uses SYNC value
- SYNC value uses formula from parent
- Complex dependency chains

---

### **Group 9: Protections**
*GenLogic data integrity protections*

#### 9A. NaN/Infinity Protection
- numeric, decimal, real, double precision columns
- Verify CHECK constraint blocks NaN
- Verify CHECK constraint blocks Infinity
- Verify CHECK constraint blocks -Infinity
- Verify NULL is allowed
- Verify normal numbers pass

#### 9B. Aggregation Repair
- Verify `.repair.sql` script regenerates correct aggregations
- Test after manual data corruption
- Ensures data integrity can be restored

---

### **Group 10: Error Handling** ✅
*Schema validation*
- ✅ All 29 error tests passing in `tests/errors-schema/`

---

