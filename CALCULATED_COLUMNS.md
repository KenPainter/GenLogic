# Calculated Columns Feature

## Overview

Calculated columns allow you to define columns whose values are automatically computed from SQL expressions. The values are recalculated on every INSERT and UPDATE operation using PostgreSQL triggers.

## Basic Usage

```yaml
tables:
  orders:
    columns:
      price: { type: numeric, size: 10, decimal: 2 }
      quantity: { type: integer }
      total:
        type: numeric
        size: 10
        decimal: 2
        calculated: "price * quantity"
```

## Key Features

### 1. Automatic Calculation
- Calculated on INSERT: When a new row is inserted, calculated columns are computed before storage
- Recalculated on UPDATE: When any column is updated, all calculated columns are recomputed
- BEFORE triggers: Calculations happen before data is written, ensuring consistency

### 2. Dependency Ordering
The system automatically detects dependencies between calculated columns and evaluates them in the correct order:

```yaml
columns:
  price: { type: numeric, size: 10, decimal: 2 }
  quantity: { type: integer }
  subtotal:
    type: numeric
    size: 10
    decimal: 2
    calculated: "price * quantity"  # Calculated first
  tax:
    type: numeric
    size: 10
    decimal: 2
    calculated: "subtotal * 0.1"    # Calculated second (depends on subtotal)
  total:
    type: numeric
    size: 10
    decimal: 2
    calculated: "subtotal + tax"    # Calculated third (depends on subtotal and tax)
```

### 3. Cycle Detection
The system prevents circular dependencies between calculated columns:

```yaml
# This will be REJECTED with a validation error
columns:
  col_a:
    type: integer
    calculated: "col_b + 1"  # Depends on col_b
  col_b:
    type: integer
    calculated: "col_a + 1"  # Depends on col_a - CYCLE DETECTED!
```

### 4. SQL Expression Support
Any valid PostgreSQL expression is supported:

**Arithmetic:**
```yaml
calculated: "price * quantity"
calculated: "(amount - discount) * 1.1"
```

**CASE Expressions:**
```yaml
calculated: "case when amount > 100 then 'high' else 'low' end"
calculated: "case when price > 0 then price else 0 end"
```

**String Operations:**
```yaml
calculated: "first_name || ' ' || last_name"
calculated: "UPPER(email)"
```

**NULL Handling:**
```yaml
calculated: "COALESCE(value1, 0) + COALESCE(value2, 0)"
```

### 5. Mutual Exclusion with Automation
A column cannot have both `calculated` and `automation` properties:

```yaml
# INVALID - will be rejected
balance:
  type: numeric
  size: 10
  decimal: 2
  calculated: "debit - credit"  # Cannot have both!
  automation:
    type: SUM
    table: transactions
    foreign_key: account_fk
    column: amount
```

## Implementation Details

### Generated SQL
GenLogic uses a **consolidated trigger architecture** where calculated columns are evaluated within the main AFTER trigger for each table. This ensures proper execution order alongside automations.

See [CONSOLIDATED_TRIGGERS.md](CONSOLIDATED_TRIGGERS.md) for complete details on the trigger architecture.

Calculated columns are evaluated in **Step 3** of the consolidated trigger, after:
- Step 1: PUSH to children (FETCH_UPDATES)
- Step 2: PULL from parents (if FK changed)

And before:
- Step 4: PUSH to parents (aggregations)

Example section from a consolidated trigger:
```sql
-- Step 3: Calculate calculated columns (in dependency order)
NEW.subtotal := price * quantity;
NEW.tax := subtotal * 0.1;
NEW.total := subtotal + tax;
```

### Validation Steps

1. **Syntax Validation**: JSON Schema validates the `calculated` property is a string
2. **Mutual Exclusion**: Ensures `calculated` and `automation` don't coexist
3. **Expression Parsing**: Extracts column references from SQL expressions
4. **Dependency Graph**: Builds a directed graph of column dependencies
5. **Cycle Detection**: Uses DFS algorithm to detect circular dependencies
6. **Topological Sort**: Determines correct evaluation order for calculations

## Use Cases

### 1. Denormalized Aggregates
Store pre-calculated totals for performance:
```yaml
order_total:
  type: numeric
  size: 10
  decimal: 2
  calculated: "subtotal + shipping + tax"
```

### 2. Derived Status Fields
Compute status based on other columns:
```yaml
account_status:
  type: text
  calculated: "case when balance < 0 then 'overdrawn' when balance = 0 then 'empty' else 'active' end"
```

### 3. Display Fields
Generate user-friendly display values:
```yaml
full_address:
  type: text
  calculated: "street || ', ' || city || ', ' || state || ' ' || zip"
```

### 4. Business Logic
Encode domain logic in the database:
```yaml
discount_amount:
  type: numeric
  size: 10
  decimal: 2
  calculated: "case when quantity > 10 then price * 0.1 when quantity > 5 then price * 0.05 else 0 end"
```

## Comparison with Automation

| Feature | Calculated | Automation |
|---------|-----------|------------|
| **Scope** | Same row | Across tables via FK |
| **Trigger Type** | AFTER INSERT/UPDATE (Step 3) | AFTER INSERT/UPDATE/DELETE (Steps 1,2,4) |
| **Data Source** | Same row columns | Related table rows |
| **Direction** | N/A | Parent ↔ Child |
| **Examples** | `price * quantity` | SUM, COUNT, MAX, FETCH |

## Best Practices

### 1. Keep Expressions Simple
✅ Good:
```yaml
calculated: "price * quantity"
calculated: "first_name || ' ' || last_name"
```

❌ Avoid:
```yaml
calculated: "(SELECT COUNT(*) FROM other_table WHERE ...)"  # Use automation instead
```

### 2. Handle NULLs Explicitly
✅ Good:
```yaml
calculated: "COALESCE(value1, 0) + COALESCE(value2, 0)"
```

❌ Risky:
```yaml
calculated: "value1 + value2"  # NULL + anything = NULL
```

### 3. Use Appropriate Data Types
Match the calculated column type to the expression result:
```yaml
# Numeric calculation -> numeric type
total: { type: numeric, size: 10, decimal: 2, calculated: "a + b" }

# String operation -> text type
full_name: { type: text, calculated: "first_name || ' ' || last_name" }

# Boolean logic -> boolean type
is_active: { type: boolean, calculated: "status = 'active'" }
```

### 4. Document Complex Expressions
Add comments for business logic:
```yaml
# Volume discount: 10% off for orders over 100 units, 5% for over 50
discount_rate:
  type: numeric
  size: 5
  decimal: 4
  calculated: "case when quantity > 100 then 0.10 when quantity > 50 then 0.05 else 0.00 end"
```

## Testing

### Validation Tests
Located in `tests/validation/calculated-columns.test.ts`:
- Schema syntax validation
- Mutual exclusion with automation
- Cycle detection
- Dependency graph building
- Topological sort
- Column reference extraction

### Database Tests
Located in `tests/database/calculated-columns.test.ts`:
- Simple arithmetic calculations
- CASE expression handling
- Dependent column calculations
- NULL value handling
- Integration with regular columns
- UPDATE recalculation

Run tests:
```bash
# Validation tests (no database required)
npm run test:validation

# Database tests (requires PostgreSQL)
npm run test:database
```

## Example Schema

See `CALCULATED_EXAMPLE.yaml` for a complete working example with:
- Arithmetic calculations
- Dependent calculations
- CASE expressions
- String concatenation
- Real-world use cases

## Architecture

### Files Modified

1. **genlogic-schema.json**: Added `calculated` property to column definitions
2. **src/types.ts**: Added `calculated?: string` to `ColumnDefinition` interface
3. **src/validation.ts**: Added mutual exclusion check for `calculated` and `automation`
4. **src/graph.ts**:
   - Added `extractColumnReferences()` to parse SQL expressions
   - Added `buildCalculatedColumnGraphs()` to build dependency graphs
   - Added `topologicalSortCalculatedColumns()` for evaluation ordering
   - Enhanced `validateDataFlowSafety()` to check calculated column cycles
   - **Note**: Automation cycle detection was removed - only FK structural cycles are checked
5. **src/trigger-generator.ts**:
   - **Complete rewrite** to consolidated trigger architecture
   - Calculated columns integrated into Step 3 of consolidated triggers
   - See [CONSOLIDATED_TRIGGERS.md](CONSOLIDATED_TRIGGERS.md) for details

## Future Enhancements

Possible future additions:
- **Expression validation**: Parse and validate SQL expressions before execution
- **Performance optimization**: Cache dependency graphs
- **Type inference**: Automatically infer column type from expression
- **Cross-table calculations**: Allow references to parent table columns via FK paths
- **Async calculations**: Support for long-running calculations