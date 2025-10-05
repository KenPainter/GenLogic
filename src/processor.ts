import { readFileSync, writeFileSync } from 'fs';
import { parse, stringify } from 'yaml';
import type { DatabaseConfig, GenLogicSchema } from './types.js';
import { SchemaValidator } from './validation.js';
import { DataFlowGraphValidator } from './graph.js';
import { SchemaProcessor } from './schema-processor.js';
import { DatabaseManager } from './database.js';
import { DiffEngine } from './diff-engine.js';
import { SQLGenerator } from './sql-generator.js';
import { TriggerGenerator } from './trigger-generator.js';
import { MatchingGenerator } from './matching-generator.js';
import { ContentManager } from './content-manager.js';
import { ResolvedSchemaGenerator } from './resolved-schema-generator.js';

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
  }

  /**
   * Main processing pipeline - implements the phases from IMPLEMENTATION_PLAN.md
   */
  async process(schemaPath: string): Promise<void> {
    console.log('🚀 GenLogic - Augmented Normalization Processor');
    console.log(`📁 Schema: ${schemaPath}`);
    console.log(`🗄️  Database: ${this.config.user}@${this.config.host}:${this.config.port}/${this.config.database}`);
    console.log(`🔄 Mode: ${this.config.dryRun ? 'DRY RUN' : 'EXECUTE'}`);
    console.log('');

    try {
      // PHASE 1: Load and parse YAML
      console.log('📄 Loading YAML schema...');
      const schema = this.loadYamlSchema(schemaPath);

      // PHASE 2: Syntax validation using JSON Schema
      console.log('✅ Validating schema syntax...');
      const syntaxResult = this.validator.validateSyntax(schema);
      if (!syntaxResult.isValid) {
        throw new Error(`Schema syntax validation failed:\\n${syntaxResult.errors.join('\\n')}`);
      }

      // PHASE 3: Cross-reference validation
      console.log('🔗 Validating cross-references...');
      const crossRefResult = this.validator.validateCrossReferences(schema);
      if (!crossRefResult.isValid) {
        throw new Error(`Cross-reference validation failed:\\n${crossRefResult.errors.join('\\n')}`);
      }

      // PHASE 4: Data flow graph validation (CRITICAL SAFETY)
      console.log('🌐 Building data flow graph...');
      const graphResult = this.graphValidator.validateDataFlowSafety(schema);
      if (!graphResult.isValid) {
        throw new Error(`Data flow validation failed:\\n${graphResult.errors.join('\\n')}`);
      }
      if (graphResult.warnings.length > 0) {
        console.log('⚠️  Warnings:', graphResult.warnings.join(', '));
      }

      // PHASE 5: Schema processing and inheritance resolution
      console.log('🔄 Processing schema inheritance...');
      const processedSchema = this.schemaProcessor.processSchema(schema);

      // PHASE 5.5: Validate sync definitions (must happen AFTER FK expansion)
      console.log('🔄 Validating sync definitions...');
      const syncResult = this.validator.validateSyncDefinitions(schema, processedSchema);
      if (!syncResult.isValid) {
        throw new Error(`Sync validation failed:\n${syncResult.errors.join('\n')}`);
      }

      // PHASE 5.6: Validate content sections
      console.log('📦 Validating content sections...');
      const contentResult = this.contentManager.validateContent(schema, processedSchema);
      if (!contentResult.isValid) {
        throw new Error(`Content validation failed:\n${contentResult.errors.join('\n')}`);
      }

      // PHASE 6: Database introspection and diffing
      console.log('🔍 Analyzing current database state...');
      await this.database.connect();
      try {
        // PHASE 6.5: Drop ALL GenLogic triggers first for clean slate
        console.log('🧹 Dropping all existing GenLogic triggers...');
        const dropAllTriggersSQL = await this.database.generateDropAllGenLogicTriggersSQL();

        const currentSchema = await this.database.analyzeCurrentSchema();
        const diff = this.diffEngine.generateDiff(processedSchema, currentSchema);

        // PHASE 7: SQL generation
        console.log('📝 Generating SQL statements...');
        const ddlStatements = this.sqlGenerator.generateSQL(diff);
        const triggerStatements = this.triggerGenerator.generateTriggers(schema, processedSchema);
        const matchingStatements = this.matchingGenerator.generateMatchingSQL(schema, processedSchema);
        const contentStatements = this.contentManager.generateContentInserts(schema, processedSchema);

        // ROBUST EXECUTION ORDER:
        // 1. Drop ALL GenLogic triggers (clean slate)
        // 2. Run all DDL (tables, columns, constraints)
        // 3. Add comments (table and column descriptions)
        // 4. Create ALL triggers (fresh from schema)
        // 5. Create matching functions (pattern matching utilities)
        // 6. Insert content (with complete schema and active triggers)
        const allStatements = [
          ...dropAllTriggersSQL,
          ...ddlStatements.createTables,
          ...ddlStatements.addColumns,
          ...ddlStatements.addForeignKeys,
          ...ddlStatements.createIndexes,
          ...ddlStatements.addComments,
          ...triggerStatements,
          ...matchingStatements,
          ...contentStatements
        ].filter(sql => sql.trim().length > 0 && !sql.startsWith('--'));

        // PHASE 8: Execution or dry-run reporting
        if (this.config.dryRun) {
          console.log('📋 DRY RUN - Planned changes:');
          this.reportPlannedChanges(diff, allStatements);
        } else {
          console.log('⚡ Executing database changes...');
          if (allStatements.length > 0) {
            await this.database.executeInTransaction(allStatements);
            console.log(`✅ Successfully executed ${allStatements.length} SQL statements`);
          } else {
            console.log('✅ No changes needed - schema is up to date');
          }
        }

      } finally {
        await this.database.disconnect();
      }

      // PHASE 9: Generate resolved schema documentation
      console.log('📝 Generating resolved schema documentation...');
      this.writeResolvedSchema(schemaPath, schema, processedSchema);

      console.log('');
      console.log('✨ GenLogic processing completed successfully!');

    } catch (error) {
      console.error('');
      console.error('❌ GenLogic processing failed:');
      throw error;
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
   * Get database manager for direct access
   * Used by test helper for database operations
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

      const outputPath = `${schemaPath}.resolved.yaml`;
      const yamlContent = stringify(resolvedSchema, {
        lineWidth: 0,  // Prevent line wrapping
        indent: 2
      });

      writeFileSync(outputPath, yamlContent, 'utf-8');
      console.log(`✅ Resolved schema written to: ${outputPath}`);
    } catch (error) {
      console.warn(`⚠️  Warning: Could not write resolved schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Don't fail the entire process if this fails
    }
  }
}