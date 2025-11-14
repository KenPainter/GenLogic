import { writeFileSync } from 'fs';
import { dirname, basename, extname, join } from 'path';
import type { DatabaseConfig } from './types.js';
import { DatabaseManager } from './database.js';
import { PermissionsGenerator } from './permissions-generator.js';
import { loadYamlSchema } from './helpers-processor/yaml-loader.js';
import { validateConstantCycles } from './helpers-processor/constant-resolver.js';
import { NewSchema } from './new-schema.js';
import { diffSchemas } from './newschema-diff.js';
import { topologicalSortByLayers } from './helpers-processor/topological-sort.js';
import { generateCreateTableDDL } from './helpers-ddl/create-table.js';
import { generateAddColumnDDL } from './helpers-ddl/add-column.js';
import { generateAggregationRepair } from './helpers-ddl/repair-aggregations.js';
import { generateSequenceRepairDDL } from './helpers-ddl/repair-sequences.js';
import { generateResolvedSchema } from './helpers-ddl/resolved-schema.js';
import { generateModifyColumnDDL } from './helpers-ddl/modify-column.js';
import { generateDropPrimaryKeyDDL, generateAddPrimaryKeyDDL } from './helpers-ddl/primary-key.js';
import { generateDropForeignKeyDDL, generateAddForeignKeyDDL } from './helpers-ddl/foreign-key.js';
import { generateCheckConstraintDDL } from './helpers-ddl/check-constraint.js';
import { generateUniqueConstraintDDL } from './helpers-ddl/unique-constraint.js';
import { generateIndexDDL } from './helpers-ddl/indexes.js';
import { generateSeedDataDML } from './helpers-ddl/seed-data.js';
import { generateTriggersDDL } from './helpers-ddl/triggers.js';
import { generatePermissionsDDL } from './helpers-ddl/permissions.js';

/**
 * GenLogic Core Processor
 *
 * GENLOGIC PRINCIPLE: Foreign keys are DATA PIPELINES that create columns AND automation pathways
 * This processor implements the safety-first approach with bulletproof validation before any database operations
 */
export class GenLogicProcessor {
  private config: DatabaseConfig;
  private database: DatabaseManager;
  private permissionsGenerator: PermissionsGenerator;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.database = new DatabaseManager(config);
    this.permissionsGenerator = new PermissionsGenerator();
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

    // Validate constants for cycles IMMEDIATELY - before anything uses them
    console.log('  Validating constants for cycles...');
    validateConstantCycles(newSchema);

    // EARLY EXIT if constant validation failed
    if (newSchema.errors.length > 0) {
      // Write newSchema for test verification before exiting
      this.writeNewSchema(schemaPath, newSchema);

      console.error('\n❌ Constant validation failed:\n');
      for (const error of newSchema.errors) {
        console.error(`  ${error.location}: ${error.message}`);
      }
      const errorSummary = newSchema.errors
        .map(e => `${e.location}: ${e.message}`)
        .join('\n');
      throw new Error(`Constant validation failed:\n${errorSummary}`);
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

    console.log('  Detecting cycles and layers in formula and automation dependencies...');
    const automationResult = topologicalSortByLayers(
      newSchema.automationEdges,
      false  // skipSelfLoops: false for formulas and automations (self-referential dependencies are cycles)
    );
    if (automationResult.cycles.length > 0) {
      for (const cycle of automationResult.cycles) {
        newSchema.errors.push({
          location: 'Automation dependencies',
          message: `Cycle detected: ${cycle.join(' -> ')}`
        });
      }
    }

    // Extract per-table column layers from unified automation result
    for (const tableName of Object.keys(newSchema.tables)) {
      newSchema.applyColumnLayers(tableName, automationResult.layers);
    }

    // New schema is done, write it out and move on to db work
    this.writeNewSchema(schemaPath, newSchema);

    // Check for schema errors and abort if any found
    console.log(`Schema validation: ${newSchema.errors.length} error(s)`);
    if (newSchema.errors.length > 0) {
      console.error('\n❌ Schema validation failed with the following errors:\n');
      for (const error of newSchema.errors) {
        console.error(`  ${error.location}: ${error.message}`);
      }
      console.error('\nAborting due to schema errors.');

      // Throw error instead of process.exit for testability
      const errorSummary = newSchema.errors
        .map(e => `${e.location}: ${e.message}`)
        .join('\n');
      throw new Error(`Schema validation failed:\n${errorSummary}`);
    }

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

    // Attach layer information from desired schema for SQL ordering
    console.log('Attaching layer information to diff...');
    diff.tableLayers = newSchema.tableLayers;
    diff.columnLayers = this.extractColumnLayers(newSchema);

    // Extract DROP operations (GenLogic NEVER auto-executes destructive operations)
    console.log('Extracting DROP operations...');
    const diffDrops = {
      tablesToDrop: diff.tablesToDrop,
      columnsToDrop: diff.columnsToDrop
    };

    // Dump diff for examination (includes drops before they're removed)
    this.writeDiffToFile(diff, schemaPath);

    // Remove DROP operations from diff, making it safe for automated DDL execution
    delete diff.tablesToDrop;
    delete diff.columnsToDrop;

    // Generate DROP SQL script for manual execution
    this.writeDropScript(diffDrops, schemaPath);
    this.writeDropsToFile(diffDrops, schemaPath);

    //
    // --- DIFF IS COMPLETE ---
    //
    // --- WRITE SOME DDL ---
    //

    // SQL Generation and Execution
    console.log('Generating SQL statements...');

    // PHASE 1: Drop all triggers on managed tables (prevents automation during migration)
    console.log('Phase 1: Generate Drop triggers DDL...');
    const tableNames = Object.keys(newSchema.tables);
    const dropTriggerSQL = await this.database.generateDropAllTriggersSQL(tableNames);

    // PHASE 2: Build complete schema structure in layer order
    console.log('Phase 2: Generate schema structure DDL...');
    const schemaSQL: string[] = [];

    // Process each FK dependency layer (0, 1, 2, ...) in order
    const tableLayers = diff.tableLayers || {};
    const layerNumbers = Object.keys(tableLayers).map(Number).sort((a, b) => a - b);

    for (const layerNum of layerNumbers) {
      const tablesInLayer = tableLayers[layerNum];
      console.log(`  Layer ${layerNum}: ${tablesInLayer.join(', ')}`);

      // Generate DDL for this layer (order matters!)
      schemaSQL.push(...generateCreateTableDDL(diff, newSchema, tablesInLayer));
      schemaSQL.push(...generateDropPrimaryKeyDDL(diff, tablesInLayer));  // Drop PK before column changes
      schemaSQL.push(...generateDropForeignKeyDDL(diff, tablesInLayer));  // Drop old/removed FKs
      schemaSQL.push(...generateAddColumnDDL(diff, tablesInLayer));
      schemaSQL.push(...generateModifyColumnDDL(diff, tablesInLayer));
      schemaSQL.push(...generateAddPrimaryKeyDDL(diff, tablesInLayer));   // Add PK after column changes
      schemaSQL.push(...generateAddForeignKeyDDL(diff, tablesInLayer));   // Add new/modified FKs
      schemaSQL.push(...generateCheckConstraintDDL(diff, tablesInLayer));  // CHECK constraints (drop then add)
      schemaSQL.push(...generateUniqueConstraintDDL(diff, tablesInLayer));  // UNIQUE constraints (drop then add)
      schemaSQL.push(...generateIndexDDL(diff, tablesInLayer));  // Indexes (drop then add)
      schemaSQL.push(...generateTriggersDDL(newSchema, tablesInLayer));  // Triggers (CREATE OR REPLACE for automation)
    }

    // PHASE 2.4: Repair sequences if they're out of sync with table data
    console.log('Phase 2.4: Check and repair sequences...');
    const sequenceRepairSQL = generateSequenceRepairDDL(liveSchema);
    if (sequenceRepairSQL.length > 0) {
      console.log(`  Found ${sequenceRepairSQL.filter(s => s.includes('setval')).length} sequences needing repair`);
      schemaSQL.push(...sequenceRepairSQL);
    } else {
      console.log('  All sequences are in sync');
    }

    // PHASE 2.5: Seed data in layer order (after schema + triggers complete)
    console.log('Phase 2.5: Generate seed data DML...');
    const seedSQL: string[] = [];

    for (const layerNum of layerNumbers) {
      const tablesInLayer = tableLayers[layerNum];
      console.log(`  Seeding layer ${layerNum}: ${tablesInLayer.join(', ')}`);

      // Generate INSERT statements for seed rows
      // With a fully built database, these are just like end-user inserts
      seedSQL.push(...generateSeedDataDML(newSchema, tablesInLayer));
    }

    // PHASE 3: Set permissions (global operation after all tables/triggers exist)
    console.log('Phase 3: Generate permission grants...');
    const dbName = this.config.database || 'unknown';
    console.log(`  Creating admin role: ${dbName}_genlogic_admin`);
    console.log(`  Creating unprivileged application user: ${dbName}_app_user`);
    console.log(`  Transferring table ownership to admin role`);
    console.log(`  Setting column-level UPDATE permissions (blocking automated columns)`);

    const permissionSQL: string[] = generatePermissionsDDL(
      dbName,
      parsedYaml,
      newSchema
    );

    // Assemble final SQL statement list
    const allStatements: string[] = [
      ...dropTriggerSQL,
      ...schemaSQL,
      ...permissionSQL,
      ...seedSQL
    ];

    // Filter out empty statements
    const filteredStatements = allStatements.filter(sql => sql.trim().length > 0 && !sql.startsWith('--'));

    console.log(`Generated ${filteredStatements.length} SQL statements`);

    // Dump SQL for inspection
    this.writeSQLToFile(filteredStatements, schemaPath);

    // Generate aggregation repair script
    const repairSQL = generateAggregationRepair(newSchema);
    this.writeRepairScriptToFile(repairSQL, schemaPath);

    // Generate resolved schema documentation
    const resolvedSchema = generateResolvedSchema(newSchema, schemaPath, this.config.database || 'unknown');
    this.writeResolvedSchemaToFile(resolvedSchema, schemaPath);

    // TODO: Execute SQL statements in transaction
    if (!this.config.dryRun) {
       await this.database.executeInTransaction(filteredStatements);
    }

    await this.database.disconnect();
    console.log('✨ GenLogic processing completed successfully!');
    return;

  }

  //
  // -- HELPER METHODS --
  //
  private writeParsedYaml(schemaPath: string, data: any): void {
    const path = this.getDebugPath(schemaPath, '.parsed.json');
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

  private writeSQLToFile(statements: string[], schemaPath: string): void {
    // Write JSON format for programmatic inspection
    const jsonPath = this.getDebugPath(schemaPath, '.sql.json');
    writeFileSync(jsonPath, JSON.stringify({
      statementCount: statements.length,
      statements: statements
    }, null, 2));
    console.log(`  Wrote ${jsonPath}`);

    // Write SQL script for human readability / manual execution
    const sqlPath = this.getDebugPath(schemaPath, '.sql');
    const lines: string[] = [];

    lines.push('-- GenLogic Generated DDL');
    lines.push('-- Auto-generated schema migration script');
    lines.push('--');
    lines.push(`-- Statement count: ${statements.length}`);
    lines.push('--');
    lines.push('');
    lines.push('BEGIN;');
    lines.push('');

    for (let i = 0; i < statements.length; i++) {
      lines.push(`-- Statement ${i + 1}`);
      lines.push(statements[i]);
      lines.push('');
    }

    lines.push('COMMIT;');

    writeFileSync(sqlPath, lines.join('\n'));
    console.log(`  Wrote ${sqlPath}`);
  }

  private writeRepairScriptToFile(repairStatements: string[], schemaPath: string): void {
    // Write repair SQL script for manual execution or verification
    const repairPath = this.getDebugPath(schemaPath, '.repair.sql');

    writeFileSync(repairPath, repairStatements.join('\n'));
    console.log(`  Wrote ${repairPath}`);
  }

  private writeResolvedSchemaToFile(resolvedSchema: string, schemaPath: string): void {
    // Write resolved schema documentation as TypeScript
    const resolvedPath = this.getDebugPath(schemaPath, '.resolved.ts');

    writeFileSync(resolvedPath, resolvedSchema);
    console.log(`  Wrote ${resolvedPath}`);
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
          // String definition - might be a SQL definition or a reusable column reference
          let defToCheck = colDef;

          // If this references a reusable column, get that column's definition
          if (colDef in newSchema.reusableColumns) {
            const reusableCol = newSchema.reusableColumns[colDef];
            defToCheck = reusableCol.definition || colDef;
          }

          // Check if the actual definition contains "primary key"
          if (defToCheck.toLowerCase().includes('primary key')) {
            pkColumn = colName;
            pkDefinition = defToCheck;
            break;
          }
        } else if (typeof colDef === 'object' && colDef !== null) {
          // Object definition - check for primary_key: true or base reference
          if ((colDef as any).primary_key === true) {
            pkColumn = colName;
            pkDefinition = (colDef as any).definition || (colDef as any).type;
            break;
          }

          // Check if using definition that references a reusable column
          if ((colDef as any).definition && (colDef as any).definition in newSchema.reusableColumns) {
            const reusableCol = newSchema.reusableColumns[(colDef as any).definition];
            const baseDefinition = reusableCol.definition || '';
            if (baseDefinition.toLowerCase().includes('primary key')) {
              pkColumn = colName;
              pkDefinition = baseDefinition;
              break;
            }
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
   * Extract column layers from all tables into a single structure
   * Only includes tables that have formula columns with layer dependencies
   */
  private extractColumnLayers(schema: NewSchema): Record<string, Record<number, string[]>> {
    const result: Record<string, Record<number, string[]>> = {};

    for (const [tableName, tableDef] of Object.entries(schema.tables)) {
      if (tableDef.columnLayers) {
        result[tableName] = tableDef.columnLayers;
      }
    }

    return result;
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

}