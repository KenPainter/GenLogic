#!/usr/bin/env bun
/**
 * GenLogic Column Automations Test Runner
 *
 * Tests column automation features (Groups 2, 3, 4: SYNC, SNAPSHOT, Aggregations, Formulas)
 * Following the go-right-framework.md design:
 * - Markdown files contain sequences of YAML builds, SQL statements, and JSON assertions
 * - Each test gets a fresh database (DROP all tables for isolation)
 * - Tests run against real PostgreSQL to verify DDL, triggers, and constraints
 */

import { createGoRightTestSuite } from './go-right-runner.js';
import { join } from 'path';

createGoRightTestSuite({
  schemasDir: join(import.meta.dir, 'column-automations'),
  dumpDir: join(import.meta.dir, 'go-right-out'),
  suiteName: 'Column Automations'
});
