Previous: [Test Guide](02-test-guide.md) | Next: [Design Documentation](../architecture/design.md)

# Test Coverage Matrix

This document maps source files to their corresponding tests and documentation to ensure comprehensive coverage.

## Coverage Status Legend
- ✅ Full coverage (tests and docs exist)
- ⚠️ Partial coverage (either tests or docs missing)
- ❌ No coverage (both tests and docs missing)

## Source File Coverage

| Source File | Tests | Documentation | Status |
|------------|-------|---------------|--------|
| `src/cli.ts` | ✅ `tests/integration/cli.test.ts` | ✅ `docs/guides/cli-usage.md` | ✅ |
| `src/content-manager.ts` | ⚠️ No unit tests | ✅ `docs/guides/content-manager.md` | ⚠️ |
| `src/database.ts` | ✅ `tests/database/setup.test.ts` | ✅ `docs/architecture/design.md` | ✅ |
| `src/diff-engine.ts` | ✅ `tests/unit/diff-engine.test.ts` | ✅ Covered in design docs | ✅ |
| `src/graph.ts` | ✅ `tests/validation/graph-validation.test.ts` | ✅ `docs/architecture/design.md` | ✅ |
| `src/matching-generator.ts` | ✅ `tests/validation/pattern-matching.test.ts`<br>`tests/database/pattern-matching.test.ts` | ✅ `docs/guides/pattern-matching.md` | ✅ |
| `src/processor.ts` | ✅ `tests/database/setup.test.ts` | ✅ `docs/architecture/design.md` | ✅ |
| `src/resolved-schema-generator.ts` | ❌ None | ⚠️ Partial (in design docs) | ⚠️ |
| `src/schema-processor.ts` | ✅ `tests/validation/inheritance.test.ts` | ✅ Various example docs | ✅ |
| `src/sql-generator.ts` | ✅ `tests/unit/sql-generator.test.ts` | ✅ Covered in design docs | ✅ |
| `src/trigger-generator.ts` | ✅ `tests/database/automation.test.ts` | ✅ `docs/architecture/consolidated-triggers.md`<br>`docs/guides/trigger-generator.md` | ✅ |
| `src/types.ts` | ✅ `tests/validation/type-system.test.ts` | ✅ `docs/examples/basic/type-showcase.md` | ✅ |
| `src/validation.ts` | ✅ `tests/validation/schema-syntax.test.ts`<br>`tests/validation/cross-reference.test.ts` | ✅ `docs/test-guide.md` | ✅ |

## Feature Coverage

| Feature | Source Files | Tests | Documentation | Status |
|---------|-------------|-------|---------------|--------|
| Calculated Columns | `src/schema-processor.ts` | ✅ `tests/validation/calculated-columns.test.ts`<br>`tests/database/calculated-columns.test.ts` | ✅ `docs/guides/calculated-columns.md` | ✅ |
| Pattern Matching | `src/matching-generator.ts` | ✅ `tests/validation/pattern-matching.test.ts`<br>`tests/database/pattern-matching.test.ts` | ✅ `docs/guides/pattern-matching.md` | ✅ |
| Foreign Keys | `src/schema-processor.ts` | ✅ `tests/validation/cross-reference.test.ts` | ✅ `docs/examples/foreign-keys/` | ✅ |
| Automations | `src/trigger-generator.ts` | ✅ `tests/database/automation.test.ts` | ✅ `docs/examples/automations/` | ✅ |
| Inheritance | `src/schema-processor.ts` | ✅ `tests/validation/inheritance.test.ts` | ✅ `docs/examples/inheritance/` | ✅ |
| NULL Handling | Multiple files | ✅ Various tests | ✅ `docs/guides/null-handling-guide.md` | ✅ |
| UI Notes | `src/types.ts` | ⚠️ No specific tests | ✅ `docs/guides/ui-notes-guide.md` | ⚠️ |

## Gaps Identified

### Remaining Gaps (Low Priority)
1. **Content Manager** (`src/content-manager.ts`) - Has documentation, needs unit tests
2. **Resolved Schema Generator** (`src/resolved-schema-generator.ts`) - Needs dedicated tests and documentation
3. **UI Notes** - Has documentation but needs specific test coverage

### Recently Completed
- ✅ CLI - Now has integration tests and usage documentation
- ✅ SQL Generator - Now has comprehensive unit tests
- ✅ Diff Engine - Now has unit tests for schema migration scenarios
- ✅ Pattern Matching - Full coverage with validation, database, and documentation
- ✅ Trigger Generator - Enhanced documentation with deep dive guide
- ✅ Content Manager - Complete documentation added

### Well Covered
- Calculated columns - Well tested and documented
- Foreign keys - Extensive examples and tests
- Automations - Complete coverage
- Validation - Comprehensive test suite
- Graph validation - Full coverage

## Recommendations

### Completed in This Session ✅
1. ✅ Created CLI usage guide in `docs/guides/cli-usage.md`
2. ✅ Added integration tests for CLI in `tests/integration/cli.test.ts`
3. ✅ Documented content manager functionality in `docs/guides/content-manager.md`
4. ✅ Created SQL generator unit tests in `tests/unit/sql-generator.test.ts`
5. ✅ Added trigger-generator deep dive in `docs/guides/trigger-generator.md`
6. ✅ Created diff-engine tests in `tests/unit/diff-engine.test.ts`
7. ✅ Created pattern matching tests (validation and database)
8. ✅ Updated table of contents with all new documentation

### Future Improvements (Optional)
1. **Content Manager** - Add unit tests for $lookup resolution and validation
2. **Resolved Schema Generator** - Create dedicated documentation
3. **UI Notes** - Add specific test coverage
4. **Performance** - Add benchmarks for large schemas
5. **Integration** - Add end-to-end workflow tests

## Test Organization

### Current Structure
```
tests/
├── validation/          # Schema validation tests
│   ├── calculated-columns.test.ts
│   ├── cross-reference.test.ts
│   ├── graph-validation.test.ts
│   ├── inheritance.test.ts
│   ├── pattern-matching.test.ts ✨ NEW
│   ├── schema-syntax.test.ts
│   └── type-system.test.ts
├── database/           # Database operation tests
│   ├── automation.test.ts
│   ├── calculated-columns.test.ts (✨ CONVERTED to Bun)
│   ├── pattern-matching.test.ts ✨ NEW
│   └── setup.test.ts
├── integration/        # End-to-end tests ✨ NEW
│   └── cli.test.ts ✨ NEW
├── unit/              # Unit tests for specific modules ✨ NEW
│   ├── sql-generator.test.ts ✨ NEW
│   └── diff-engine.test.ts ✨ NEW
└── fixtures/           # Test data files
```

### Future Additions (Optional)
```
tests/
├── unit/
│   └── content-manager.test.ts
└── performance/       # Performance benchmarks
    └── large-schema.test.ts
```

---

Previous: [Test Guide](02-test-guide.md) | Next: [Design Documentation](../architecture/design.md)
