# Coding Schemas with AI Assistants

## Recommended Approach

AI assistants (Claude, ChatGPT, etc.) can write GenLogic schemas effectively when given the right context.

Provide the AI with the technical reference documents from section 70:

- `docs/70-reference/10-tables-and-columns-reference.md` - Table and column syntax
- `docs/70-reference/30-column-automations-reference.md` - SYNC, SNAPSHOT, formulas, aggregations
- `docs/70-reference/40-row-automations-reference.md` - Auto-create parent
- `docs/70-reference/50-seed-data-reference.md` - Seed data syntax
- `docs/70-reference/error-messages.md` - schema validation error conditions and remediation

These documents contain complete syntax specifications without explanatory text, making them efficient context for AI models.

## Workflow

1. Describe your data model and business logic requirements
2. Provide the AI with the section 70 reference documents
3. Ask the AI to generate the YAML schema
4. Run GenLogic to validate the schema
5. If validation fails, share error messages with the AI for correction

## Example Prompt

```
I need a GenLogic schema for an e-commerce system with:
- Products with prices
- Orders that reference products
- Order total calculated as sum of line items
- Customer order count tracked automatically

Use the syntax from the attached GenLogic reference documents.
[Attach docs/70-reference/*.md files]
```

## Schema Validation

GenLogic validates schemas at build time and reports all errors with precise locations.

Error messages reference the exact location in your YAML:
```
Location: customers.order_count
Message: SUM automation requires a numeric type, got: character varying
```

See `docs/70-reference/error-messages.md` for all validation errors.

## Iterative Development

GenLogic builds are non-destructive and idempotent.

This means you can:
1. Start with a basic schema
2. Run GenLogic to build the database
3. Add columns, tables, or automations
4. Rerun GenLogic to apply changes
5. Test with real data
6. Iterate

Existing data is preserved. Calculated columns update automatically when their dependencies change.

## Advanced Patterns

For complex business logic patterns, see section 60 (Advanced):
- Intra-table column dependency chains via FK
- Multiple round trips through parent-child pairs with termination

These patterns show how to structure complex calculations that GenLogic guarantees will terminate.
