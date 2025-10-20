Previous: [Additive Changes Only](../70-integrity-features/40-additive-changes.md) | Next: [Resolved Schema](20-resolved-schema.md)

# IDE Support for GenLogic Schemas

GenLogic schema files can be validated in real-time by your IDE or text editor using JSON Schema validation.

## What IDE Validation Checks

IDE validation catches syntax and structure errors only. It does NOT validate:
- References to non-existent columns or tables (e.g., $ref: typo_column_name)
- Circular dependencies in automations or formulas
- Foreign key relationships between tables
- Whether automation patterns reference valid tables/columns

These runtime validations require GenLogic to process the schema and are documented in [Schema Validation](../50-integrity-features/10-schema-validation.md).

## VS Code

Add this to the top of your schema file:

```yaml
# yaml-language-server: $schema=../src/genlogic-schema.json
```

Adjust the path to point to your genlogic-schema.json file. VS Code will:
- Validate schema structure as you type
- Show errors inline with red squiggles
- Provide autocomplete for valid properties
- Show documentation on hover

## Other IDEs

Most modern IDEs with YAML support can use JSON Schema for validation:

IntelliJ IDEA - Supports JSON Schema validation natively. Configure the schema path in Settings → Languages & Frameworks → Schemas and DTDs → JSON Schema Mappings.

Sublime Text - Install the "LSP-yaml" package via Package Control. Configure the schema path in the LSP-yaml settings.

Vim/Neovim - Use ALE or coc.nvim with yaml-language-server. Add the schema mapping to your yaml-language-server configuration.

## Command-Line Validation

You can validate schemas without running GenLogic by using a JSON Schema validator:

```bash
npm install -g ajv-cli
ajv validate -s src/genlogic-schema.json -d your-schema.yaml
```

This is useful for:
- CI/CD pipelines
- Pre-commit hooks
- Batch validation of multiple schema files
- Testing schema changes before deployment

---

Previous: [Additive Changes Only](../70-integrity-features/40-additive-changes.md) | Next: [Resolved Schema](20-resolved-schema.md)
