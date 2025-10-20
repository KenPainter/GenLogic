Previous: [IDE Support](10-ide-support.md) | Next: [Running Tests](../95-hacking/run-tests.md)

# The Resolved Schema

GenLogic generates a TypeScript file (`schema.ts`) alongside your YAML schema that describes the actual database structure after processing.

## What It Contains

The resolved schema is a reference for application developers showing:

- Every column in the database (including auto-generated FK columns)
- Which columns are controlled by client vs database server
- Nullable and unique constraints
- Formulas for calculated/automated columns
- Usage examples - INSERT/UPDATE patterns with dos and don'ts

## File Location

Generated in the same directory as your source schema:

```
schema.yaml     # Your source schema
schema.ts       # Generated resolved schema
```

## Structure

The file exports a TypeScript constant with this structure:

```typescript
export const schema = {
  _metadata: {
    generated_at: "2025-10-20T12:34:56.789Z",
    source_schema: "./schema.yaml",
    database: "myapp"
  },

  tables: {
    table_name: {
      _table_info: {
        has_triggers: true,
        has_automations: true,
        foreign_keys: 2
      },
      indexes: [
        { columns: ["col1", "col2"] }
      ],
      unique_constraints: [
        { columns: ["col1", "col2"] }
      ],
      columns: {
        column_name: {
          type: "varchar",
          size: 100,
          nullable: boolean,
          unique: boolean,  // if column has UNIQUE constraint
          controlled_by: "client application" | "database server",
          formula: "...",  // for database-controlled columns
          // ... additional metadata
        }
      }
    }
  },

  matching_tables: {
    // Pattern matching table definitions
  },

  _usage_guide: {
    insert_pattern: "...",
    update_pattern: "...",
    query_pattern: "...",
    automation_philosophy: "..."
  }
} as const;
```

## Key Fields

### Controlled By

Every column has a `controlled_by` field:

- `"client application"` - Your code writes this value
- `"database server"` - Database calculates/maintains this value

### Formula

Database-controlled columns include a `formula` field showing how the value is calculated:

- `"SERIAL"` - Auto-increment sequence
- `"SUM(transactions.amount)"` - Aggregation automation
- `"SYNC(accounts.category)"` - Copy from parent table
- SQL expression for calculated columns

### Nullable and Unique

Simple boolean flags:

- `nullable` - Can this column contain NULL values?
- `unique` - Does this column have a UNIQUE constraint?

### Managed By

Automated columns include a `managed_by` object with implementation details:

- Automation type and source
- Trigger names
- Update strategy

## Usage

The resolved schema serves multiple purposes:

1. Application Reference - Developers see exactly what they can/cannot write
2. TypeScript Integration - Import for type-safe database operations
3. Documentation - Self-documenting schema with examples
4. AI Context - LLM tools understand database structure and rules

## Example

For a simple accounts/transactions schema:

```typescript
tables: {
  accounts: {
    columns: {
      id: {
        controlled_by: "client application",
        nullable: false
      },
      name: {
        controlled_by: "client application",
        nullable: true
      },
      balance: {
        controlled_by: "database server",
        formula: "SUM(transactions.amount)",
        nullable: false,
        managed_by: {
          type: "trigger_aggregation",
          automation_type: "SUM",
          source_table: "transactions",
          source_column: "amount"
        }
      }
    }
  }
}
```

Application code should:

- Only write to columns where `controlled_by = "client application"`
- Never write to `balance` column - database maintains it automatically
- Always read current balance from SELECT queries (never cache or recalculate)

## Usage Guide Section

The `_usage_guide` at the end provides:

- INSERT pattern with correct example
- UPDATE pattern with correct example
- Common mistakes to avoid (marked with ❌)
- Query guidance
- GenLogic philosophy summary

This ensures developers immediately understand:
- What to write
- What NOT to write
- How to read data correctly

---

Previous: [IDE Support](10-ide-support.md) | Next: [Running Tests](../95-hacking/run-tests.md)
