Next: [Consolidated Triggers](consolidated-triggers.md)

# GenLogic Design Documentation

GenLogic creates a data flow system within PostgreSQL databases that you can access with normal table reads and writes without the need for an ORM.

GenLogic processes YAML files containing database schemas with automations. It diffs the schema against a live database to determine changes to make. GenLogic adds new tables, columns, indexes and constraints. GenLogic never deletes columns or tables.

## Core Philosophy: Foreign Keys as Data Pipelines

**Traditional Approach:** Foreign keys are constraints
**GenLogic Approach:** Foreign keys are the backbone of the data flow system

Foreign keys in GenLogic serve three purposes:
1. **Column structure** (automatic foreign key column creation)
2. **Data relationships** (standard constraints)
3. **Automation pathways** (SUM/COUNT/MAX/LATEST flow along these edges)

Using cycle detection and validation, GenLogic ensures that only valid data flows are built, enabling trigger-based automation without fear of conflicts, cycles, or unintended consequences.

The result is the most efficient application of business logic with reduced complexity in middleware and user interfaces.

## Augmented Normalization

We call a GenLogic schema "Augmented Normalization" - a normalized base structure enhanced with computed derived values.

For this to work effectively:
- Externally supplied values should be normalized (serving as the basis for calculations)
- Foreign keys become the primary concept for schema design
- Automation follows the foreign key graph
- Validation prevents cycles in the dependency graph

## Technical Architecture

### Tech Stack
- CLI utility written in TypeScript
- Compatible with Node.js 18+
- PostgreSQL driver (`pg`)
- YAML parsing and JSON Schema validation

### Command Line Interface
```bash
genlogic --host localhost --port 5432 --database mydb --user postgres --password secret --schema ./schema.yaml [--dry-run] [--test-mode]
```

### Schema Structure

YAML files may contain:
- Reusable column definitions - shared column specifications
- Table definitions with:
  - Foreign keys with delete restrict/cascade options
  - Primary keys and indexes
  - Unique constraints
- Column definitions within tables:
  - Explicitly typed (NUMERIC, VARCHAR, etc.)
  - Inherited from reusable columns (null, string, $ref patterns)
  - Automated calculations using automation

## Automation Types

### Aggregations (Child → Parent)
- SUM - Total of child values
- COUNT - Number of child records
- MAX/MIN - Extreme values from children
- LATEST - Most recent value from most recently updated child

### Cascades (Parent → Child)
- FETCH - Copy value once on row INSERT
- FETCH_UPDATES - Copy from parent to child on parent UPDATE

### Extensions (Within Row)
- Any supported PostgreSQL expression

See [calculated-columns.md](../guides/calculated-columns.md) for detailed documentation on calculated columns, including dependency ordering, cycle detection, and best practices

### Multi-row Automations
- DOMINANT - Allow only one row to have a particular value
- QUEUEPOS - Preserve order when values change

## Implementation Principles

### Safety-First Design
- Cycle Detection: Bulletproof algorithms prevent infinite loops in FK relationships and automation dependencies
- Validation-First: Comprehensive schema validation before any database operations
- Add-Only: Never delete existing columns or tables
- Transaction Safety: All operations wrapped in atomic transactions with rollback

### Performance Optimization
- Consolidated Triggers: Group multiple instances of automation by foreign key path for efficiency
- Incremental Updates: Use OLD/NEW values for O(1) performance instead of table scans
- Dependency Ordering: Ensure automation executes in correct sequence

See [consolidated-triggers.md](consolidated-triggers.md) for complete details on the consolidated trigger architecture, including the four-step execution order and infinite loop prevention

### Schema Evolution
- Diff Engine: Compare desired vs current state to determine minimal changes
- Safe Additions: Add new schema elements without breaking existing data
- Trigger Management: Drop and recreate triggers with proper naming conventions

## Core Features

- YAML Schema Validation - JSON Schema + cross-reference validation
- Cycle Prevention - Detection in foreign keys and automation dependencies
- Schema Diffing - Compare against current database state
- DDL Generation - Create tables, columns, indexes, constraints
- Trigger Generation - Implement automation with efficient PostgreSQL triggers
- Dry Run Mode - Preview changes without executing

## Data Flow Graph Validation

The heart of GenLogic's safety system:

1. **Build Graph:** Construct directed graph of foreign key relationships and automation dependencies
2. **Cycle Detection:** Use DFS algorithms to detect any cycles
3. **Path Validation:** Ensure automation paths are reachable via valid foreign key connections
4. **Dependency Ordering:** Sequence operations to respect dependencies

This validation makes trigger-based automation safe and predictable, differentiating GenLogic from dangerous ad-hoc trigger approaches.

## Philosophy Implications

Foreign keys become the schema backbone - everything else depends on them:
- Column creation follows foreign key declarations
- Automation references foreign key names, not table names
- Validation checks cycles in the foreign key graph
- Triggers are generated per foreign key path, not per instance of automation

This approach transforms database design from table-centric to relationship-centric thinking, where data flows naturally along well-defined pathways.

---

Next: [Consolidated Triggers](consolidated-triggers.md)
