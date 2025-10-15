#!/usr/bin/env node

import { Command } from 'commander';
import { GenLogicProcessor } from './processor.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Read version from package.json
const packageJson = JSON.parse(readFileSync(join(import.meta.dir, '../package.json'), 'utf-8'));

const program = new Command();

program
  .name('genlogic')
  .description('GenLogic - Augmented Normalization for PostgreSQL with foreign keys as data pipelines')
  .version(packageJson.version);

program
  .option('-h, --host <host>', 'PostgreSQL host', 'localhost')
  .option('-p, --port <port>', 'PostgreSQL port', '5432')
  .option('-d, --database <database>', 'PostgreSQL database name')
  .option('-u, --user <user>', 'PostgreSQL username')
  .option('-w, --password <password>', 'PostgreSQL password')
  .option('-s, --schema <path>', 'Path to YAML schema file')
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

      if (!options.password) {
        console.error('Error: Password is required (-w, --password)');
        console.error('Note: Bun\'s SQL driver does not support passwordless authentication');
        process.exit(1);
      }

      if (!options.schema) {
        console.error('Error: Schema file path is required (-s, --schema)');
        process.exit(1);
      }

      // Validate schema file exists
      if (!existsSync(options.schema)) {
        console.error(`Error: Schema file not found: ${options.schema}`);
        process.exit(1);
      }

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