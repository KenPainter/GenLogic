import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, basename, extname, join } from 'path';
import type { DatabaseConfig, GenLogicSchema } from './types.js';
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
import { diffSchemas } from './newschema-diff.js';
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

    // Extract reusable columns - normalize them as we add them
    console.log('  Copying reusable columns to new schema...');
    for (const [name, colDef] of Object.entries(parsedYaml.columns ?? {})) {
      newSchema.addReusableColumn(name, colDef);
    }

    // Extract all table PKs
    console.log('  Identifying and copying primary key definitions...');
    this.extractTablePKs(parsedYaml, newSchema);

    // Process all columns
    console.log('  Processing columns...');
    newSchema.processColumns(parsedYaml);

    // Process table-level properties (comment)
    console.log('  Processing table-level properties...');
    newSchema.processTableProperties(parsedYaml);

    // Topological sorting and cycle detection
    console.log('  Detecting cycles and layers in foreign key relationships...');
    const fkResult = topologicalSortByLayers(
      newSchema.fkEdges,
      true  // skipSelfLoops: true for FKs (self-referential FKs are allowed)
    );
    if (fkResult.cycles.length > 0) {
      for (const cycle of fkResult.cycles) {
        newSchema.errors.push({
          location: 'Foreign keys',
          message: `Cycle detected: ${cycle.join(' -> ')}`
        });
      }
    }

    // Apply table layers and fill in missing tables to layer 0
    console.log('  Applying table layers...');
    newSchema.tableLayers = newSchema.applyTableLayers(fkResult.layers);

    console.log('  Detecting cycles and layers in formula column dependencies...');
    for (const [tableName, tableDef] of Object.entries(newSchema.tables)) {
      if (tableDef.columnEdges && tableDef.columnEdges.length > 0) {
        const formulaResult = topologicalSortByLayers(
          tableDef.columnEdges,
          false  // skipSelfLoops: false for formulas (self-referential formulas are cycles)
        );
        if (formulaResult.cycles.length > 0) {
          for (const cycle of formulaResult.cycles) {
            newSchema.errors.push({
              location: `${tableName} formula columns`,
              message: `Cycle detected: ${cycle.join(' -> ')}`
            });
          }
        }
        // Apply column layers to table (only formula columns will be in layers)
        newSchema.applyColumnLayers(tableName, formulaResult.layers);
      }
    }

    console.log('  Detecting cycles in automation dependencies...');
    const automationResult = topologicalSortByLayers(
      newSchema.automationEdges,
      false  // skipSelfLoops: false for automations (self-referential automations are cycles)
    );
    if (automationResult.cycles.length > 0) {
      for (const cycle of automationResult.cycles) {
        newSchema.errors.push({
          location: 'Automation dependencies',
          message: `Cycle detected: ${cycle.join(' -> ')}`
        });
      }
    }

    // New schema is done, write it out and move on to db work
    this.writeNewSchema(schemaPath, newSchema);


    console.log('Connecting to database...');
    await this.database.connect();
    console.log('Database connection established');

    // Database introspection.  Use the same class
    // that we used for the yaml schema, to get
    // easier apples-to-apples comparisons
    console.log('Identifying live database elements...');
    const liveSchema = new NewSchema();
    await this.database.populateLiveSchema(liveSchema);
    // Dump live schema for examination
    this.writeLiveSchema(schemaPath, liveSchema);

    // Generate diff between NewSchema instances (apples-to-apples)
    console.log('Generating schema diff...');
    const diff = diffSchemas(newSchema, liveSchema);

    // Phase 12: Extract DROP operations (GenLogic NEVER auto-executes destructive operations)
    console.log('Extracting DROP operations...');
    const diffDrops = {
      tablesToDrop: diff.tablesToDrop,
      columnsToDrop: diff.columnsToDrop
    };

    // Remove DROP operations from diff, making it safe for automated DDL execution
    delete diff.tablesToDrop;
    delete diff.columnsToDrop;

    // Generate DROP SQL script for manual execution
    this.writeDropScript(diffDrops, schemaPath);
    this.writeDropsToFile(diffDrops, schemaPath);

    // Dump diff for examination
    this.writeDiffToFile(diff, schemaPath);

    // YOLO MARKER - above is rock solid, below will crash
    console.log('YOLO MARKER: Returning before we get to unrefactored code');
    await this.database.disconnect();
    return;

  

    try {



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

  private writeLiveSchema(schemaPath: string, liveSchema: NewSchema): void {
    const path = this.getDebugPath(schemaPath, '.live.json');
    // Dump the full live schema object
    writeFileSync(path, JSON.stringify(liveSchema, null, 2));
    console.log(`  Wrote ${path}`);
  }

  private writeNewSchema(schemaPath: string, desiredSchema: NewSchema): void {
    const path = this.getDebugPath(schemaPath, '.newSchema.json');
    // Dump the full NewSchema object including errors
    writeFileSync(path, JSON.stringify(desiredSchema, null, 2));
    console.log(`  Wrote ${path}`);
  }

  private writeDropsToFile(diffDrops: any, schemaPath: string): void {
    const path = this.getDebugPath(schemaPath, '.drops.json');
    writeFileSync(path, JSON.stringify(diffDrops, null, 2));
    console.log(`  Wrote ${path}`);
  }

  private writeDropScript(diffDrops: any, schemaPath: string): void {
    const path = this.getDebugPath(schemaPath, '.drops.sql');

    const lines: string[] = [];

    // Header comment
    lines.push('-- GenLogic DROP Script');
    lines.push('--');
    lines.push('-- These are tables and columns in the live database that are not referenced');
    lines.push('-- in the YAML schema. GenLogic NEVER issues DROP TABLE or DROP COLUMN DDL.');
    lines.push('--');
    lines.push('-- ⚠️  WARNING: This script will DELETE DATA permanently!');
    lines.push('--');
    lines.push('-- If it is desired to drop these database tables and columns, somebody must');
    lines.push('-- manually review and execute this script.');
    lines.push('--');
    lines.push('');
    lines.push('BEGIN;');
    lines.push('');

    // Generate DROP TABLE statements
    if (diffDrops.tablesToDrop && diffDrops.tablesToDrop.length > 0) {
      lines.push('-- Drop tables');
      for (const tableName of diffDrops.tablesToDrop) {
        lines.push(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`);
      }
      lines.push('');
    }

    // Generate DROP COLUMN statements
    if (diffDrops.columnsToDrop && diffDrops.columnsToDrop.length > 0) {
      lines.push('-- Drop columns');
      for (const col of diffDrops.columnsToDrop) {
        lines.push(`ALTER TABLE "${col.table}" DROP COLUMN IF EXISTS "${col.column}";`);
      }
      lines.push('');
    }

    // If nothing to drop, add a comment
    if ((!diffDrops.tablesToDrop || diffDrops.tablesToDrop.length === 0) &&
        (!diffDrops.columnsToDrop || diffDrops.columnsToDrop.length === 0)) {
      lines.push('-- No tables or columns to drop');
      lines.push('');
    }

    lines.push('COMMIT;');

    writeFileSync(path, lines.join('\n'));
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
    for (const [tableName, yamlTable] of Object.entries(parsedYaml.tables ?? {})) {
      // Find the PK column - look for primary_key: true
      let pkColumn: string | undefined;
      let pkDefinition: string | undefined;

      for (const [colName, colDef] of Object.entries((yamlTable as any).columns ?? {})) {
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

      // Store table with PK info (conforms to TableDef)
      const tableDef: any = {
        pkColumn,
        pkDefinition
      };
      newSchema.tables[tableName] = tableDef;
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