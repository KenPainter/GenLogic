#!/usr/bin/env node

import { Command } from 'commander';
import { GenLogicProcessor } from './processor.js';

const program = new Command();

program
  .name('genlogic')
  .description('GenLogic - Augmented Normalization for PostgreSQL with foreign keys as data pipelines')
  .version('1.0.0');

program
  .option('-h, --host <host>', 'PostgreSQL host', 'localhost')
  .option('-p, --port <port>', 'PostgreSQL port', '5432')
  .option('-d, --database <database>', 'PostgreSQL database name')
  .option('-u, --user <user>', 'PostgreSQL username')
  .option('-w, --password <password>', 'PostgreSQL password')
  .option('-s, --schema <path>', 'Path to YAML schema file(s)', './schema.yaml')
  .option('--dry-run', 'Show planned changes without executing them', false)
  .action(async (options) => {
    try {
      // Validate required options
      if (!options.database) {
        console.error('Error: Database name is required (-d, --database)');
        process.exit(1);
      }

      if (!options.user) {
        console.error('Error: Username is required (-u, --user)');
        process.exit(1);
      }

      // GENLOGIC CORE PRINCIPLE: Foreign keys are DATA PIPELINES, not just constraints
      // This processor validates the data flow graph before any database operations
      const processor = new GenLogicProcessor({
        host: options.host || 'localhost',
        port: parseInt(options.port || '5432'),
        database: options.database || 'test',
        user: options.user || 'test',
        password: options.password,
        dryRun: options.dryRun
      });

      await processor.process(options.schema);

    } catch (error) {
      console.error('GenLogic Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();