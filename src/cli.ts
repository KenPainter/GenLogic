#!/usr/bin/env bun

import { Command } from 'commander';
import { GenLogicProcessor } from './processor.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Read version from package.json
// If file does not exist, we get a hard crash, which is fine
// No package.json would mean we've got other problems
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
  .option('--dump-dir <dir>', 'Directory for all output files (.flat.json, .processed.json, etc)')
  .action(async (options) => {
    // NO TRY/CATCH at this level.  At this level
    // we just dump errors to console and use process.exit(1)

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

    const processor = new GenLogicProcessor({
      database: options.database,
      user: user,
      dryRun: options.dryRun,
      dumpDir: options.dumpDir,
    });

    // No try/catch here, we want "natural" errors
    // with stack traces so we can investigate
    // them.  Our own validation errors will be dumped
    // as text before process.exit(1)
    await processor.process(options.schema);

  });

program.parse();