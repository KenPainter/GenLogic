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
  .option('-d, --database <database>', 'PostgreSQL database name')
  .option('-s, --schema <path>', 'Path to YAML schema file')
  .option('--dry-run', 'Show planned changes without executing them', false)
  .option('--dump-internal <dir>', 'Dump internal state to directory for testing')
  .option('--dump-dir <dir>', 'Directory for all output files (.flat.json, .processed.json, etc)')
  .option('--stop-after <phase>', 'Stop after specified phase: yaml-validate, flattened, processed, diffed')
  .action(async (options) => {
    try {
      // Validate required options
      if (!options.database) {
        console.error('Error: Database name is required (-d, --database)');
        process.exit(1);
      }

      if (!options.schema) {
        console.error('Error: Schema file path is required (-s, --schema)');
        process.exit(1);
      }

      // Auto-detect current user from environment
      const user = process.env.USER;
      if (!user) {
        console.error('Error: Cannot determine current user (USER environment variable not set)');
        process.exit(1);
      }

      // Validate schema file exists
      if (!existsSync(options.schema)) {
        console.error(`Error: Schema file not found: ${options.schema}`);
        process.exit(1);
      }

      // Validate --stop-after option if provided
      const validStopAfter = ['yaml-validate', 'flattened', 'processed', 'diffed'];
      if (options.stopAfter && !validStopAfter.includes(options.stopAfter)) {
        console.error(`Error: Invalid --stop-after value: ${options.stopAfter}`);
        console.error(`Valid values: ${validStopAfter.join(', ')}`);
        process.exit(1);
      }

      const processor = new GenLogicProcessor({
        database: options.database,
        user: user,
        dryRun: options.dryRun,
        dumpInternalDir: options.dumpInternal,
        dumpDir: options.dumpDir,
        stopAfter: options.stopAfter
      });

      await processor.process(options.schema);

    } catch (error) {
      console.error('GenLogic Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();