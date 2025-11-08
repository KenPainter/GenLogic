import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, basename, extname, join } from 'path';
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
import { loadYamlSchema } from './helpers-processor/yaml-loader.js';
import { NewSchema } from './new-schema.js';
import {
  extractConstants,
  extractTables,
  extractForeignKeys,
  createExtractedSchema
} from './helpers-processor/schema-extractor.js';
import { topologicalSortByLayers } from './helpers-processor/topological-sort.js';
import { populateSchema, writePopulatedSchema } from './helpers-processor/schema-populator.js';

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

    // Throws occur in the loader.  Do not wrap them
    // because that creates work without adding value.
    //
    console.log('Loading YAML schema...');
    const parsedYaml = loadYamlSchema(schemaPath);
    this.writeParsedYaml(schemaPath, parsedYaml);

    // Build the new schema incrementally
    console.log('Begin Building schema...');
    const newSchema = new NewSchema();

    // Extract constants - YAML prevents duplicates
    console.log('  Copying constants to new schema...');
    for (const [name, value] of Object.entries(parsedYaml.constants ?? {})) {
      newSchema.constants[name] = value;
    }

    // Extract reusable columns - raw templates, processed later
    console.log('  Copying reusable columns to new schema...');
    newSchema.reusableColumns = parsedYaml.columns ?? {};

    // Pass 1: Extract all table PKs
    console.log('  Identifying and copying primary key definitions...');
    this.extractTablePKs(parsedYaml, newSchema);

    // YOLO MARKER - above is rock solid, below will crash
    this.writeNewSchema(schemaPath, newSchema);
    console.log('YOLO MARKER: Returning before we get to unrefactored code');
    return;


    try {


      // PHASE 10.2: Extract constants
      console.log('Extracting constants...');
      const extracted = createExtractedSchema(schemaPath);
      extracted.constants = extractConstants(parsedYaml);

      // PHASE 10.3: Extract tables and columns
      console.log('Extracting tables and columns...');
      extracted.tables = extractTables(parsedYaml);

      // PHASE 10.4: Extract foreign keys
      console.log('Extracting foreign keys...');
      extracted.foreignKeys = extractForeignKeys(parsedYaml, extracted.tables);

      // PHASE 20.1: Cycle detection and layer assignment in foreign keys
      console.log('Detecting cycles and assigning layers in foreign keys...');
      const sortResult = topologicalSortByLayers(
        extracted.tables.keys(),
        extracted.foreignKeys.map((fk: any) => [fk.parentTable, fk.childTable]),
        true  // Skip self-loops
      );
      extracted.tableLayers = sortResult.layers;
      extracted.cycles = sortResult.cycles;

      // Write extracted schema for debugging
      writeSchemaDebugFile(
        { schemaPath, dumpDir: this.config.dumpDir },
        '.extracted.json',
        extracted,
        'Extracted schema'
      );

      if (sortResult.cycles.length > 0) {
        throw new Error(`Foreign key cycles detected:\n${sortResult.cycles.map(cycle => `  ${cycle.join(' → ')}`).join('\n')}`);
      }

      // PHASE 30: Populate schema (two-pass processing)
      console.log('Populating schema (two-pass processing)...');

      // Extract reusable columns from YAML if present
      const reusableColumns = new Map();
      if (parsedYaml.content?.columns && typeof parsedYaml.content.columns === 'object') {
        for (const [colName, colDef] of Object.entries(parsedYaml.content.columns)) {
          if (colName !== '_yamlLine') {
            // Recursively unwrap _value wrappers from YAML tracking
            function unwrapValue(obj: any): any {
              if (obj && typeof obj === 'object') {
                if (obj._value !== undefined) {
                  return unwrapValue(obj._value);
                }
                const result: any = {};
                for (const [key, value] of Object.entries(obj)) {
                  if (key !== '_yamlLine') {
                    result[key] = unwrapValue(value);
                  }
                }
                return result;
              }
              return obj;
            }

            reusableColumns.set(colName, unwrapValue(colDef));
          }
        }
      }

      const populated = populateSchema(extracted, reusableColumns);

      // Write populated schema for debugging
      writePopulatedSchema(populated, this.config.dumpDir);


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

      // Phase 11: Generate diff between populated schema and currentSchema
      console.log('Generating schema diff...');
      const diff = this.diffEngine.generateDiff(populated, currentSchema);

      // Dump diff for examination
      this.writeDiffToFile(diff, schemaPath);





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

  private writeParsedYaml(schemaPath: string, data: any): void {
    const path = this.getDebugPath(schemaPath, '.parsed.json');
    writeFileSync(path, JSON.stringify(data, null, 2));
    console.log(`  Wrote ${path}`);
  }

  private writeFlatSchema(schemaPath: string, data: any): void {
    const path = this.getDebugPath(schemaPath, '.flat.json');
    writeFileSync(path, JSON.stringify(data, null, 2));
    console.log(`  Wrote ${path}`);
  }

  private writeProcessedSchema(schemaPath: string, data: any): void {
    const path = this.getDebugPath(schemaPath, '.processed.json');
    writeFileSync(path, JSON.stringify(data, null, 2));
    console.log(`  Wrote ${path}`);
  }

  private writeDiffToFile(diff: any, schemaPath: string): void {
    const path = this.getDebugPath(schemaPath, '.diff.json');
    writeFileSync(path, JSON.stringify(diff, null, 2));
    console.log(`  Wrote ${path}`);
  }

  private writeCurrentSchema(schemaPath: string, data: any): void {
    const path = this.getDebugPath(schemaPath, '.current.json');
    writeFileSync(path, JSON.stringify(data, null, 2));
    console.log(`  Wrote ${path}`);
  }

  private writeNewSchema(schemaPath: string, data: any): void {
    const path = this.getDebugPath(schemaPath, '.newSchema.json');
    writeFileSync(path, JSON.stringify(data, null, 2));
    console.log(`  Wrote ${path}`);
  }

  private getDebugDir(schemaPath: string): string {
    return this.config.dumpDir || dirname(schemaPath);
  }

  private getDebugPath(schemaPath: string, suffix: string): string {
    const dir = this.getDebugDir(schemaPath);
    const base = basename(schemaPath, extname(schemaPath));
    return join(dir, base + suffix);
  }

  /**
   * Pass 1: Extract primary key info from all tables
   * This allows FK columns to reference parent PKs later
   */
  private extractTablePKs(parsedYaml: any, newSchema: NewSchema): void {
    for (const [tableName, tableDef] of Object.entries(parsedYaml.tables ?? {})) {
      // Find the PK column - look for primary_key: true
      let pkColumn: string | undefined;
      let pkDefinition: string | undefined;

      for (const [colName, colDef] of Object.entries((tableDef as any).columns ?? {})) {
        if (typeof colDef === 'string') {
          // String definition - check if it contains "primary key"
          if (colDef.toLowerCase().includes('primary key')) {
            pkColumn = colName;
            pkDefinition = colDef;
            break;
          }
        } else if (typeof colDef === 'object' && colDef !== null) {
          // Object definition - check for primary_key: true
          if ((colDef as any).primary_key === true) {
            pkColumn = colName;
            pkDefinition = (colDef as any).definition || (colDef as any).type;
            break;
          }
        }
      }

      // Store table with PK info
      newSchema.tables[tableName] = {
        pkColumn,
        pkDefinition
      };
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