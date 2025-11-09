# Trigger Sequence

GenLogic generates up to three triggers per table: BEFORE INSERT, BEFORE UPDATE, and BEFORE DELETE. Each trigger executes a specific sequence of operations to maintain data integrity and propagate changes.

## BEFORE INSERT Trigger

Executed when a new row is inserted into the table.

2. Auto-create parents - If FK references non-existent parent, create parent row
3. Pull from parents - Fetch SYNC/SNAPSHOT values from parent tables via FK
4. Calculate formulas - Evaluate formula expressions in dependency order
6. Push to parents - Update aggregation columns (SUM/COUNT/MAX/MIN)   in parent tables

## BEFORE UPDATE Trigger

Executed when an existing row is updated.

2. Auto-create parents - If FK changed to reference non-existent parent, create parent row
3. Pull from parents - Re-fetch SYNC/SNAPSHOT values if FK changed
4. Recalculate formulas - Evaluate formula expressions based on changed input columns
5. Push to children - Update FETCH_UPDATES columns in child tables if parent columns changed
6. Push to parents - Recalculate aggregation columns in parent tables

## BEFORE DELETE Trigger

Executed when a row is deleted from the table.

1. Push to parents
     - Decrement COUNT, 
     - Reduce SUM
     - recalculate MAX
        - if this row's value is the max
     - recalculate MIN
        - if this row's value is the min

## UNKNOWN UNKNOWNS - no action now

Need to take note of these but not analyze them yet.

- protect genlogic_protected rows
- protect from users specifying values for automated
- protect from users specifying values for formula
- granting permissions to the tables - user versus owner