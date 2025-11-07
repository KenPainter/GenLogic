import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, basename, extname, join } from 'path';
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
import { SchemaFlattener } from './schema-flattener.js';

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
  private schemaFlattener: SchemaFlattener;

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
    this.schemaFlattener = new SchemaFlattener();
  }

  /**
   * Main processing pipeline
   */
  async process(schemaPath: string): Promise<void> {
    console.log('GenLogic - Augmented Normalization Processor');
    console.log(`Schema: ${schemaPath}`);
    console.log(`Database: ${this.config.user}@localhost/${this.config.database}`);
    console.log(`Mode: ${this.config.dryRun ? 'DRY RUN' : 'EXECUTE'}`);
    console.log('');

    try {
      // PHASE 10.1: Load and parse YAML (fail fast on bad files)
      console.log('Loading YAML schema...');
      let schema = this.loadYamlSchema(schemaPath);

      // PHASE 10.2: Substitute constants throughout schema
      if (schema.constants) {
        schema = this.substituteConstants(schema);
      }

      // PHASE 10.3: Syntax validation using JSON Schema (fail fast on bad schemas)
      console.log('Validating schema syntax...');
      const syntaxResult = this.validator.validateSyntax(schema);
      if (!syntaxResult.isValid) {
        throw new Error(`Schema syntax validation failed:\n${syntaxResult.errors.join('\n')}`);
      }

      if (this.config.stopAfter === 'yaml-validate') {
        console.log('\nStopped after: yaml-validate');
        return;
      }

      // PHASE 20: Flatten schema into raw lists 
      console.log('Flattening schema structure...');
      const yamlFlattenedLists = this.schemaFlattener.flatten(schema);
      this.writeFlatSchema(schemaPath, yamlFlattenedLists);
      this.dumpInternal('flattened', yamlFlattenedLists);

      if (this.config.stopAfter === 'flattened') {
        console.log('\nStopped after: flattened');
        return;
      }

      // PHASE 30: Assign table layers from flattened lists (FAIL FAST on cycles)
      console.log('Building dependency graph and assigning layers...');
      const tableLayers = this.graphValidator.assignTableLayers(yamlFlattenedLists);
      console.log(`   Tables organized into ${Math.max(...tableLayers.values()) + 1} layers`);

      // PHASE 6: Process schema layer-by-layer with integrated validation
      //   This phase builds the initial processedSchema.
      //   Once we are ready to connect to the database in Phase 9,
      //   processedSchema will be the COMPLETE schema and it will
      //   be all we need to diff against the database.
      //   But right now, it is NOT THERE YET.
      console.log('Processing schema by layers...');
      const processedSchema = this.schemaProcessor.processSchemaByLayers(
        yamlFlattenedLists,
        tableLayers
      );
      
      // PHASE 6.1: Build reverse FK index (inboundForeignKeys)
      console.log('Building inbound foreign key index...');
      this.schemaProcessor.addInboundForeignKeysToProcessedSchema(processedSchema);
      
      // PHASE 6.2: Copy seed rows to processedSchema
      console.log('Adding seed rows to processed schema...');
      this.schemaProcessor.addSeedRowsToProcessedSchema(yamlFlattenedLists, processedSchema);


      // PHASE 7.1: Add indexes to processedSchema with validation
      console.log('Adding indexes to processed schema...');
      this.schemaProcessor.addIndexesToProcessedSchema(yamlFlattenedLists, processedSchema);

      // PHASE 7.2: Add unique constraints to processedSchema with validation
      console.log('Adding unique constraints to processed schema...');
      this.schemaProcessor.addUniqueConstraintsToProcessedSchema(yamlFlattenedLists, processedSchema);

      // PHASE 7.3: Add CHECK constraints to processedSchema with validation
      console.log('Adding CHECK constraints to processed schema...');
      this.schemaProcessor.addCheckConstraintsToProcessedSchema(yamlFlattenedLists, processedSchema);


      // PHASE 8.1: Validate formulas and detect cycles
      console.log('Validating formula columns and checking for cycles...');
      this.schemaProcessor.validateFormulasAndCycles(processedSchema);

      // PHASE 8.2: Validate automation definitions
      console.log('Validating automation definitions...');
      this.schemaProcessor.validateAutomations(processedSchema);

      // Write processed schema to disk for inspection
      this.writeProcessedSchema(schemaPath, processedSchema);
      this.dumpInternal('processed', processedSchema);

      if (this.config.stopAfter === 'processed') {
        console.log('\n✅ Stopped after: processed');
        return;
      }

      // PHASE 9: Database connection
      //
      //   processedSchema is now COMPLETE AND ENTIRE
      //   for all downstream processing steps
      //
      console.log('Connecting to database...');
      await this.database.connect();
      console.log('Database connection established');


      // PHASE 10: Database introspection
      console.log('Identifying current database elements...');
      const currentSchema = await this.database.analyzeCurrentSchema();

      // Dump current schema for examination
      this.writeCurrentSchema(schemaPath, currentSchema);

      // Phase 11: Generate diff between processedSchema and currentSchema
      console.log('Generating schema diff...');
      const diff = this.diffEngine.generateDiff(processedSchema, currentSchema);

      // Dump diff for examination
      this.writeDiffToFile(diff, schemaPath);

      if (this.config.stopAfter === 'diffed') {
        console.log('\n✅ Stopped after: diffed');
        return;
      }

      // PHASE 12: SQL generation
      console.log('Generating SQL statements...');
      const ddlStatements = this.sqlGenerator.generateSQL(diff, processedSchema);
      const triggerStatements = this.triggerGenerator.generateTriggers(schema, processedSchema);
      const matchingStatements = this.matchingGenerator.generateMatchingSQL(schema, processedSchema);

      // Extract set of new tables for sequence initialization
      const newTables = new Set(diff.tablesToCreate.map(t => t.tableName));

      const contentStatements = this.contentManager.generateContentInserts(schema, processedSchema, newTables);
      const permissionStatements = this.permissionsGenerator.generateAllPermissions(this.config.database, schema, processedSchema);

      // ROBUST LAYER-BY-LAYER EXECUTION ORDER:
      // PHASE 1: Drop all triggers (global operation - drop ALL triggers on tables we own)
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

      // Generate DROP TRIGGER statements for ALL triggers on tables we own
      // (any table defined in our schema)
      const dropAllTriggersSQL: string[] = [];
      for (const tableName of Object.keys(processedSchema.tables)) {
        const currentTable = currentSchema[tableName];
        if (currentTable) {
          for (const trigger of currentTable.triggers) {
            dropAllTriggersSQL.push(
              `DROP TRIGGER IF EXISTS ${trigger.name} ON "${tableName}";`
            );
          }
        }
      }

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
          const layerContent = this.contentManager.generateContentInsertsForTables(schema, processedSchema, tableSet, newTables);

          // Assemble statements in dependency-safe order
          allStatements.push(
            ...layerDDL.createTables,
            ...layerDDL.addColumns,
            ...layerDDL.modifyColumns,
            ...layerContent,                      // Seed data BEFORE FKs and aggregations
            ...layerDDL.cleanupForeignKeys,
            ...layerDDL.modifyForeignKeys,        // Modify existing FKs (DROP + ADD)
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

      // YOLO MARKER: Dump SQL statements to JSON file for inspection
      const debugDir = dirname(schemaPath);
      const baseFileName = basename(schemaPath, extname(schemaPath));
      const sqlDumpPath = join(debugDir, `${baseFileName}-sql.json`);

      writeFileSync(sqlDumpPath, JSON.stringify({
        statementCount: filteredStatements.length,
        statements: filteredStatements
      }, null, 2));

      console.log(`📄 SQL statements dumped to: ${sqlDumpPath}`);
      throw new Error('YOLO MARKER: SQL generation complete, stopping before execution');

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
   * Substitute constants throughout the schema
   * Replaces ${CONSTANT_NAME} with the constant value
   */
  private substituteConstants(schema: GenLogicSchema): GenLogicSchema {
    if (!schema.constants) return schema;

    // Convert constants to string for replacement
    const constantMap = new Map<string, string>();
    for (const [name, value] of Object.entries(schema.constants)) {
      constantMap.set(name, String(value));
    }

    // Deep clone and substitute
    const substituted = JSON.parse(JSON.stringify(schema));

    // Recursive function to substitute in all string values
    const substitute = (obj: any): void => {
      if (typeof obj === 'string') {
        return obj;
      }

      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          if (typeof obj[i] === 'string') {
            obj[i] = this.replaceConstants(obj[i], constantMap);
          } else if (typeof obj[i] === 'object' && obj[i] !== null) {
            substitute(obj[i]);
          }
        }
      } else if (typeof obj === 'object' && obj !== null) {
        for (const key of Object.keys(obj)) {
          if (typeof obj[key] === 'string') {
            obj[key] = this.replaceConstants(obj[key], constantMap);
          } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            substitute(obj[key]);
          }
        }
      }
    };

    substitute(substituted);
    return substituted;
  }

  /**
   * Replace ${CONSTANT_NAME} references in a string
   */
  private replaceConstants(text: string, constants: Map<string, string>): string {
    return text.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (match, constName) => {
      const value = constants.get(constName);
      if (value === undefined) {
        throw new Error(`Undefined constant: ${constName}`);
      }
      return value;
    });
  }

  /**
   * Write flattened schema to JSON file
   */
  private writeFlatSchema(schemaPath: string, normalizedSchema: any): void {
    const outputPath = this.getOutputPath(schemaPath, '.flat.json');

    // Write formatted JSON
    const json = JSON.stringify(normalizedSchema, null, 2);
    writeFileSync(outputPath, json, 'utf-8');

    console.log(`   Flat schema written to: ${outputPath}`);
  }

  private writeProcessedSchema(schemaPath: string, processedSchema: any): void {
    const outputPath = this.getOutputPath(schemaPath, '.processed.json');

    // Write formatted JSON
    const json = JSON.stringify(processedSchema, null, 2);
    writeFileSync(outputPath, json, 'utf-8');

    console.log(`   Processed schema written to: ${outputPath}`);
  }

  private getOutputPath(schemaPath: string, suffix: string): string {
    const baseFileName = basename(schemaPath, extname(schemaPath));

    if (this.config.dumpDir) {
      // Use specified dump directory
      if (!existsSync(this.config.dumpDir)) {
        mkdirSync(this.config.dumpDir, { recursive: true });
      }
      return join(this.config.dumpDir, `${baseFileName}${suffix}`);
    } else {
      // Use schema file's directory (default behavior)
      return schemaPath.replace(/\.(yaml|yml)$/i, suffix);
    }
  }

  private dumpInternal(name: string, data: any): void {
    if (!this.config.dumpInternalDir) return;

    // Create dump directory if it doesn't exist
    if (!existsSync(this.config.dumpInternalDir)) {
      mkdirSync(this.config.dumpInternalDir, { recursive: true });
    }

    const dumpPath = join(this.config.dumpInternalDir, `${name}.json`);
    const json = JSON.stringify(data, null, 2);
    writeFileSync(dumpPath, json, 'utf-8');
  }

  private writeDiffToFile(diff: any, schemaPath: string): void {
    const outputPath = this.getOutputPath(schemaPath, '.diff.json');

    // Write formatted JSON
    const json = JSON.stringify(diff, null, 2);
    writeFileSync(outputPath, json, 'utf-8');

    console.log(`   Diff written to: ${outputPath}`);
  }

  private writeCurrentSchema(schemaPath: string, currentSchema: any): void {
    const outputPath = this.getOutputPath(schemaPath, '.current.json');

    // Write formatted JSON
    const json = JSON.stringify(currentSchema, null, 2);
    writeFileSync(outputPath, json, 'utf-8');

    console.log(`   Current schema written to: ${outputPath}`);
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

      primaryKeysToAdd: diff.primaryKeysToAdd.filter(pk => tableNames.has(pk.tableName)),

      foreignKeysToAdd: diff.foreignKeysToAdd.filter(fk => tableNames.has(fk.tableName)),

      foreignKeysToModify: diff.foreignKeysToModify.filter(fk => tableNames.has(fk.tableName)),

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