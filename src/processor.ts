import { readFileSync, writeFileSync } from 'fs';
import { parse, stringify } from 'yaml';
import type { DatabaseConfig, GenLogicSchema } from './types.js';
import { SchemaValidator } from './validation.js';
import { DataFlowGraphValidator } from './graph.js';
import { SchemaProcessor } from './schema-processor.js';
import { DatabaseManager } from './database.js';
import { DiffEngine, type SchemaDiff } from './diff-engine.js';
import { SQLGenerator, type SQLStatements } from './sql-generator.js';
import { TriggerGenerator } from './trigger-generator.js';
import { MatchingGenerator } from './matching-generator.js';
import { ContentManager } from './content-manager.js';
import { ResolvedSchemaGenerator } from './resolved-schema-generator.js';
import { PermissionsGenerator } from './permissions-generator.js';

/**
 * GenLogic Core Processor
 *
 * GENLOGIC PRINCIPLE: Foreign keys are DATA PIPELINES that create columns AND automation pathways
 * This processor implements the safety-first approach with bulletproof validation before any database operations
 */
export class GenLogicProcessor {
  private config: DatabaseConfig;
  private validator: SchemaValidator;
  private graphValidator: DataFlowGraphValidator;
  private schemaProcessor: SchemaProcessor;
  private database: DatabaseManager;
  private diffEngine: DiffEngine;
  private sqlGenerator: SQLGenerator;
  private triggerGenerator: TriggerGenerator;
  private matchingGenerator: MatchingGenerator;
  private contentManager: ContentManager;
  private resolvedSchemaGenerator: ResolvedSchemaGenerator;
  private permissionsGenerator: PermissionsGenerator;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.validator = new SchemaValidator();
    this.graphValidator = new DataFlowGraphValidator();
    this.schemaProcessor = new SchemaProcessor();
    this.database = new DatabaseManager(config);
    this.diffEngine = new DiffEngine();
    this.sqlGenerator = new SQLGenerator();
    this.triggerGenerator = new TriggerGenerator();
    this.matchingGenerator = new MatchingGenerator();
    this.contentManager = new ContentManager();
    this.resolvedSchemaGenerator = new ResolvedSchemaGenerator();
    this.permissionsGenerator = new PermissionsGenerator();
  }

  /**
   * Main processing pipeline
   */
  async process(schemaPath: string): Promise<void> {
    console.log('🚀 GenLogic - Augmented Normalization Processor');
    console.log(`📁 Schema: ${schemaPath}`);
    console.log(`🗄️  Database: ${this.config.user}@localhost/${this.config.database}`);
    console.log(`🔄 Mode: ${this.config.dryRun ? 'DRY RUN' : 'EXECUTE'}`);
    console.log('');

    try {
      // PHASE 2: Load and parse YAML (fail fast on bad files)
      console.log('📄 Loading YAML schema...');
      const schema = this.loadYamlSchema(schemaPath);

      // PHASE 3: Syntax validation using JSON Schema (fail fast on bad schemas)
      console.log('✅ Validating schema syntax...');
      const syntaxResult = this.validator.validateSyntax(schema);
      if (!syntaxResult.isValid) {
        throw new Error(`Schema syntax validation failed:\n${syntaxResult.errors.join('\n')}`);
      }

      // PHASE 4: Database connection (only after schema is valid)
      console.log('🔌 Connecting to database...');
      await this.database.connect();
      console.log('✅ Database connection established');

      // PHASE 5: Build reusable columns store
      console.log('📦 Building reusable columns...');
      const reusableColumns = this.schemaProcessor.buildReusableColumnsStore(schema);

      // PHASE 6: Build FK graph and assign layers (FAIL FAST on cycles)
      console.log('🌐 Building dependency graph...');
      const fkGraph = this.graphValidator.buildForeignKeyGraph(schema);
      const cycleResult = this.graphValidator.detectCycles(fkGraph);
      if (!cycleResult.isValid) {
        throw new Error(`Foreign key cycles detected:\n${cycleResult.errors.join('\n')}`);
      }
      const tableLayers = this.graphValidator.assignTableLayers(fkGraph);
      console.log(`   Tables organized into ${Math.max(...tableLayers.values()) + 1} layers`);

      // PHASE 7: Process schema layer-by-layer with integrated validation
      console.log('🔄 Processing schema by layers...');
      const processedSchema = this.schemaProcessor.processSchemaByLayers(
        schema,
        tableLayers,
        reusableColumns
      );

      // PHASE 7.4: Validate automation foreign key inference
      console.log('🔍 Validating automation definitions...');
      const automationResult = this.validator.validateAutomationInference(schema);
      if (!automationResult.isValid) {
        throw new Error(`Automation validation failed:\n${automationResult.errors.join('\n')}`);
      }

      // PHASE 7.6: Validate content sections
      console.log('📦 Validating content sections...');
      const contentResult = this.contentManager.validateContent(schema, processedSchema);
      if (!contentResult.isValid) {
        throw new Error(`Content validation failed:\n${contentResult.errors.join('\n')}`);
      }

      // PHASE 8: Database introspection and diffing
      console.log('🔍 Analyzing current database state...');

      // PHASE 8.5: Drop ALL GenLogic triggers first for clean slate
      console.log('🧹 Dropping all existing GenLogic triggers...');
      const dropAllTriggersSQL = await this.database.generateDropAllGenLogicTriggersSQL();

      const currentSchema = await this.database.analyzeCurrentSchema();
      const diff = this.diffEngine.generateDiff(processedSchema, currentSchema, schema);

      // PHASE 9: SQL generation
      console.log('📝 Generating SQL statements...');
      const ddlStatements = this.sqlGenerator.generateSQL(diff, processedSchema);
      const triggerStatements = this.triggerGenerator.generateTriggers(schema, processedSchema);
      const matchingStatements = this.matchingGenerator.generateMatchingSQL(schema, processedSchema);
      const contentStatements = this.contentManager.generateContentInserts(schema, processedSchema);
      const permissionStatements = this.permissionsGenerator.generateAllPermissions(this.config.database, schema, processedSchema);

      // ROBUST LAYER-BY-LAYER EXECUTION ORDER:
      // PHASE 1: Drop all triggers (global operation)
      // PHASE 2: For each layer (0, 1, 2, ...):
      //   1. Create tables in this layer
      //   2. Add columns to tables in this layer
      //   3. Modify columns in this layer
      //   4. Seed data for this layer (parents seeded before children reference them)
      //   5. Cleanup FK values for this layer (skip new columns)
      //   6. Add FK constraints for this layer
      //   7. Add CHECK constraints for this layer
      //   8. Backfill aggregations where CHILD is in this layer (child data exists, update parents)
      //   9. Create indexes for this layer
      //  10. Add comments for this layer
      // PHASE 3: Global operations after all layers:
      //   - Create ALL triggers
      //   - Create matching functions
      //   - Set permissions

      const allStatements: string[] = [
        ...dropAllTriggersSQL
      ];

      // Convert tableLayers Map to array of layers
      const layerArray = this.convertToLayerArray(tableLayers);

      // Process each layer in topological order
      for (let layerNum = 0; layerNum < layerArray.length; layerNum++) {
        const tablesInLayer = layerArray[layerNum];
        const tableSet = new Set(tablesInLayer);

        if (tablesInLayer.length > 0) {
          console.log(`   Processing layer ${layerNum}: ${tablesInLayer.join(', ')}`);

          // Filter diff and content to this layer
          const layerDiff = this.filterDiffForLayer(diff, tableSet);
          const layerDDL = this.sqlGenerator.generateSQL(layerDiff, processedSchema);
          const layerContent = this.contentManager.generateContentInsertsForTables(schema, processedSchema, tableSet);

          // Assemble statements in dependency-safe order
          allStatements.push(
            ...layerDDL.createTables,
            ...layerDDL.addColumns,
            ...layerDDL.modifyColumns,
            ...layerContent,                      // Seed data BEFORE FKs and aggregations
            ...layerDDL.cleanupForeignKeys,
            ...layerDDL.addForeignKeys,
            ...layerDDL.addCheckConstraints,
            ...layerDDL.backfillAggregations,     // Child data exists, backfill to parents
            ...layerDDL.createIndexes,
            ...layerDDL.addComments
          );
        }
      }

      // Global operations after all layers
      allStatements.push(
        ...triggerStatements,
        ...matchingStatements,
        ...permissionStatements
      );

      // Filter out empty statements
      const filteredStatements = allStatements.filter(sql => sql.trim().length > 0 && !sql.startsWith('--'));

      // PHASE 10: Execution or dry-run reporting
      if (this.config.dryRun) {
        console.log('📋 DRY RUN - Planned changes:');
        this.reportPlannedChanges(diff, filteredStatements);
      } else {
        console.log('⚡ Executing database changes...');
        if (filteredStatements.length > 0) {
          await this.database.executeInTransaction(filteredStatements);
          console.log(`✅ Successfully executed ${filteredStatements.length} SQL statements`);
        } else {
          console.log('✅ No changes needed - schema is up to date');
        }
      }

      // PHASE 11: Generate resolved schema documentation
      console.log('📝 Generating resolved schema documentation...');
      this.writeResolvedSchema(schemaPath, schema, processedSchema);

      console.log('');
      console.log('✨ GenLogic processing completed successfully!');

    } catch (error) {
      console.error('');
      console.error('❌ GenLogic processing failed:');
      throw error;
    } finally {
      // Always disconnect from database, even if processing failed
      await this.database.disconnect();
    }
  }

  /**
   * Load and parse YAML file(s)
   * Supports both single files and glob patterns for multiple files
   */
  private loadYamlSchema(schemaPath: string): GenLogicSchema {
    try {
      const yamlContent = readFileSync(schemaPath, 'utf-8');
      const parsed = parse(yamlContent);

      // Ensure we have a valid schema structure
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Schema must be a YAML object');
      }

      return parsed as GenLogicSchema;

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load YAML schema: ${error.message}`);
      }
      throw new Error('Failed to load YAML schema: Unknown error');
    }
  }

  /**
   * @internal
   * Get database manager - for test infrastructure only
   * DO NOT use in production code or tests directly
   * Use TestHelper from tests/test-helper.ts instead
   */
  getDatabase() {
    return this.database;
  }

  /**
   * Report planned changes in dry-run mode
   */
  private reportPlannedChanges(diff: any, sqlStatements: string[]): void {
    console.log('');
    console.log('📋 PLANNED CHANGES:');
    console.log('==================');

    if (diff.tablesToCreate.length > 0) {
      console.log(`\\n🆕 Tables to create: ${diff.tablesToCreate.length}`);
      for (const table of diff.tablesToCreate) {
        console.log(`   - ${table.tableName} (${table.columns.length} columns)`);
      }
    }

    if (diff.columnsToAdd.length > 0) {
      console.log(`\\n➕ Columns to add: ${diff.columnsToAdd.length}`);
      for (const column of diff.columnsToAdd) {
        console.log(`   - ${column.tableName}.${column.columnName}`);
      }
    }

    if (diff.columnsToModify.length > 0) {
      console.log(`\\n🔄 Columns to modify: ${diff.columnsToModify.length}`);
      for (const column of diff.columnsToModify) {
        console.log(`   - ${column.tableName}.${column.columnName}: ${column.reason}`);
      }
    }

    if (diff.aggregationsToBackfill && diff.aggregationsToBackfill.length > 0) {
      console.log(`\\n🔢 Aggregations to backfill: ${diff.aggregationsToBackfill.length}`);
      for (const backfill of diff.aggregationsToBackfill) {
        console.log(`   - ${backfill.parentTable}.${backfill.aggregationColumn} (${backfill.aggregationType} from ${backfill.childTable}.${backfill.childColumn})`);
      }
    }

    if (diff.foreignKeysToAdd.length > 0) {
      console.log(`\\n🔗 Foreign keys to add: ${diff.foreignKeysToAdd.length}`);
      for (const fk of diff.foreignKeysToAdd) {
        console.log(`   - ${fk.tableName}.${fk.foreignKeyName}`);
      }
    }

    if (diff.triggersToRecreate.length > 0) {
      console.log(`\\n⚡ Tables with triggers to recreate: ${diff.triggersToRecreate.length}`);
      for (const tableName of diff.triggersToRecreate) {
        console.log(`   - ${tableName}`);
      }
    }

    console.log(`\\n📝 Total SQL statements: ${sqlStatements.length}`);

    if (this.config.dryRun || process.env.DEBUG_SQL) {
      console.log('\\n🔍 SQL STATEMENTS:');
      console.log('===================');
      for (let i = 0; i < sqlStatements.length; i++) {
        console.log(`\\n-- Statement ${i + 1}:`);
        console.log(sqlStatements[i]);
      }
    }
  }

  /**
   * Convert tableLayers Map to array of layers
   * Each layer is an array of table names at that layer
   *
   * Example: Map { a: 0, b: 0, c: 1, d: 1, e: 2 } => [['a', 'b'], ['c', 'd'], ['e']]
   */
  private convertToLayerArray(tableLayers: Map<string, number>): string[][] {
    // Find max layer number
    const maxLayer = Math.max(...tableLayers.values());

    // Initialize array with empty arrays for each layer
    const layers: string[][] = [];
    for (let i = 0; i <= maxLayer; i++) {
      layers.push([]);
    }

    // Populate layers with table names
    for (const [tableName, layerNum] of tableLayers.entries()) {
      layers[layerNum].push(tableName);
    }

    return layers;
  }

  /**
   * Filter a SchemaDiff to include only operations on tables in the given set
   *
   * Key insight: aggregationsToBackfill filters by CHILD table (not parent)
   * because we backfill when the child's data is ready, updating parent tables
   */
  private filterDiffForLayer(diff: SchemaDiff, tableNames: Set<string>): SchemaDiff {
    return {
      tablesToCreate: diff.tablesToCreate.filter(t => tableNames.has(t.tableName)),

      columnsToAdd: diff.columnsToAdd.filter(c => tableNames.has(c.tableName)),

      columnsToModify: diff.columnsToModify.filter(c => tableNames.has(c.tableName)),

      foreignKeysToAdd: diff.foreignKeysToAdd.filter(fk => tableNames.has(fk.tableName)),

      checkConstraintsToAdd: diff.checkConstraintsToAdd.filter(c => tableNames.has(c.tableName)),

      aggregationsToBackfill: diff.aggregationsToBackfill.filter(a =>
        tableNames.has(a.childTable)  // Filter by CHILD table, not parent!
      ),

      indexesToCreate: diff.indexesToCreate.filter(i => tableNames.has(i.tableName)),

      triggersToRecreate: diff.triggersToRecreate.filter(t => tableNames.has(t))
    };
  }

  /**
   * Write resolved schema documentation file
   */
  private writeResolvedSchema(schemaPath: string, schema: GenLogicSchema, processedSchema: any): void {
    try {
      const resolvedSchema = this.resolvedSchemaGenerator.generateResolvedSchema(
        schema,
        processedSchema,
        schemaPath,
        this.config.database
      );

      // Generate TypeScript file instead of YAML
      const outputPath = schemaPath.replace(/\.yaml$/, '.ts');
      const jsonString = JSON.stringify(resolvedSchema, null, 2);

      const tsContent = `// Generated by GenLogic - DO NOT EDIT
// This file describes the actual database structure after GenLogic processing
// Source: ${schemaPath}
// Database: ${this.config.database}
// Generated: ${new Date().toISOString()}

export const schema = ${jsonString} as const;
`;

      writeFileSync(outputPath, tsContent, 'utf-8');
      console.log(`✅ Resolved schema written to: ${outputPath}`);
    } catch (error) {
      console.warn(`⚠️  Warning: Could not write resolved schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Don't fail the entire process if this fails
    }
  }
}