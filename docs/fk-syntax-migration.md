# Foreign Key Syntax Migration

## Decision

Migrate from separate `foreign-keys:` section to inline FK definitions within `columns:`.

## Rationale

### Current Problems
1. **Magic column inference** - FK columns not explicitly listed in `columns:`
2. **Confusing semantics** - What is column name vs FK name?
3. **Hard to learn** - Even the designer forgets how it works
4. **Separated concerns** - FK properties far from column definition
5. **Type inference invisible** - Column type pulled from parent PK invisibly

### Example of Current (Old) Syntax

```yaml
transfers:
  foreign-keys:
    accounts:
      - account_id_from
      - account_id_to
  columns:
    transfer_id: serial primary key
    amount: numeric(12,2)
    # Where are account_id_from and account_id_to defined??
```

### Example of New Syntax

```yaml
transfers:
  columns:
    transfer_id: serial primary key
    account_id_from: FK accounts not null
    account_id_to: FK accounts not null
    amount: numeric(12,2)
```

## Syntax Specification

### Simple Form (string)
```yaml
column_name: FK parent_table [not null] [delete cascade|restrict|set null]
```

Examples:
- `account_id: FK accounts`
- `user_id: FK users not null`
- `parent_id: FK categories delete cascade`
- `owner_id: FK users not null delete restrict`

### Object Form (for additional properties)
```yaml
column_name:
  definition: FK parent_table [not null] [delete cascade|restrict|set null]
  comment: "Optional comment"
  # Other column properties...
```

### Formula FK (computed foreign key)
```yaml
account_id_crazy:
  definition: FK accounts not null
  formula: >
    case when @account_id_from < 100
    then @account_id_from
    else @account_id_to end
```

## Type Inference

Column type is **inferred from parent table's primary key**:
- If `accounts.account_id` is `serial` (integer), then `FK accounts` creates an `integer` column
- If parent PK is `uuid`, FK column becomes `uuid`

## FK Naming Convention

**The column name IS the FK name** for constraint naming purposes.

Multiple FKs to same parent:
```yaml
created_by: FK users not null
modified_by: FK users not null
```

Creates constraints:
- `fk_mytable_created_by` → references `users`
- `fk_mytable_modified_by` → references `users`

## Migration Tasks

### 1. Schema Changes

**Files to update:**
- `tests/schemas/*.yaml` - All test schemas
- `elite-finance.yaml` - Production schema
- All assertions files

**Pattern:**
```yaml
# OLD
foreign-keys:
  parent_table: column_name

# NEW (move to columns section)
columns:
  column_name: FK parent_table
```

### 2. JSON Schema Changes (`genlogic-schema.json`)

**Remove:**
- `foreign-keys` as separate table property

**Add:**
- FK pattern recognition in column definitions
- Support for `FK parent_table` syntax
- Support for FK modifiers (not null, delete cascade, etc.)

### 3. Phase 10 (YAML Validation) Changes

**Current:** Validates `foreign-keys` as separate object

**New:**
- Recognize FK pattern in column definitions
- Validate FK syntax: `FK parent_table [modifiers]`
- Validate parent table exists
- Parse FK modifiers

### 4. Phase 20 (Flattening) Changes

**Current:**
- Processes `foreign-keys` section separately
- Infers FK columns and adds to columns array
- Creates FK entries in flattened output

**New:**
- Parse FK syntax from column definitions
- Extract parent table name and modifiers from FK string
- Still output to same `foreignKeys` array in flattened schema
- Remove old `foreign-keys` section processing

**Flattened output format stays the same:**
```json
{
  "foreignKeys": [
    {
      "childTable": "transfers",
      "fkName": "account_id_from",
      "parentTable": "accounts",
      "childColumn": "account_id_from",
      "notNull": true,
      "delete": "restrict",
      "autoCreateParent": false
    }
  ]
}
```

## DECISIONS

### Phase 10 (YAML Validation)
**Decision:** genlogic-schema.json does NOT validate the FK string syntax (e.g., "FK accounts not null").

**Rationale:** Regex validation in JSON schema gets messy. String syntax validation happens later in the pipeline.

**Changes needed:**
- Remove `foreign-keys` as a table property from JSON schema
- Allow column definitions to be strings (which can contain FK syntax)
- No parsing or validation of FK strings in Phase 10

### Phase 20 (Flattening)
**Decision:** Phase 20 does NOT parse FK syntax. It only extracts user intent unchanged into a more readable/inspectable IR.

**Rationale:** Phase 20 is purely about flattening the hierarchical YAML structure. Parsing and interpretation happens downstream.

**Changes needed:**
- When flattening columns, if a column definition is a string starting with "FK", store it as-is in the flattened output
- Move the column from `definition` string to the flattened columns array
- **Do NOT parse** "FK accounts not null" into structured data yet
- FK parsing happens in later phases (Phase 30+)

### Backwards Compatibility
**Decision:** NO backwards compatibility. Hard cutover.

**Rationale:** Clean migration, no complex dual-syntax support needed.

### Type Inference
**Decision:** Type inference happens downstream of flattening (Phase 30+). Not a concern for this migration.

**Rationale:** Flattening doesn't need to know types, just structure.

## Implementation Strategy

**Order of implementation:**
1. Update genlogic-schema.json - remove `foreign-keys`, allow string column definitions
2. Update Phase 20 (schema-flattener.ts) - remove `foreign-keys` processing, pass through FK strings as-is
3. Update all test schemas to new syntax
4. Update elite-finance.yaml to new syntax
5. Update assertion files
6. Later phases (30+) will parse the FK strings

## Open Questions

1. **Formula FKs**: Can a formula column also be a FK? What are the semantics?
   - From example: Yes, you can have `definition: FK accounts` with `formula: ...`
   - Semantics TBD in later phases

2. **Auto-create parent**: Where does this modifier go in new syntax?
   - Perhaps: `FK accounts autocreate` or `FK accounts auto-create`?
   - TBD

3. **Flattened output format**: What does Phase 20 output for FK columns?
   - **Decision: Option C** - Store FK string in `definition` field (matches object form)

   **Column entry:**
   ```json
   {
     "tableName": "transfers",
     "columnName": "account_id",
     "definition": "FK accounts not null"
   }
   ```

   **AND extract to foreignKeys array for downstream cycle detection:**
   ```json
   {
     "foreignKeys": [
       {
         "childTable": "transfers",
         "fkName": "account_id",
         "parentTable": "accounts",
         "childColumn": "account_id",
         "definition": "FK accounts not null"
       }
     ]
   }
   ```

   Note: The `foreignKeys` array entries will contain the unparsed `definition` string. Later phases (30+) will parse this into `notNull`, `delete`, etc.
