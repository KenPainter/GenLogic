
---

### **Group 7: Schema Substitution Features**
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

