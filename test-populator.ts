#!/usr/bin/env bun
/**
 * Standalone test for schema-populator
 * Tests the two-pass processing against elite-finance.yaml
 */

import { loadYamlSchemaWithTracking } from './src/helpers-processor/yaml-loader.js';
import { extractConstants, extractTables, extractForeignKeys, createExtractedSchema } from './src/helpers-processor/schema-extractor.js';
import { populateSchema, writePopulatedSchema } from './src/helpers-processor/schema-populator.js';
import { topologicalSortByLayers } from './src/helpers-processor/topological-sort.js';

const schemaPath = './debug/elite-finance.yaml';

console.log('=== Testing Schema Populator ===\n');
console.log(`Schema: ${schemaPath}\n`);

try {
  // Step 1: Load and expand YAML
  console.log('Step 1: Loading and expanding YAML...');
  const expandedYaml = loadYamlSchemaWithTracking(schemaPath);
  console.log('   ✓ YAML loaded and expanded');

  // Step 2: Extract schema components
  console.log('\nStep 2: Extracting schema components...');
  const extracted = createExtractedSchema(schemaPath);
  extracted.constants = extractConstants(expandedYaml);
  extracted.tables = extractTables(expandedYaml);
  extracted.foreignKeys = extractForeignKeys(expandedYaml, extracted.tables);
  console.log(`   ✓ Extracted ${extracted.constants.size} constants`);
  console.log(`   ✓ Extracted ${extracted.tables.size} tables`);
  console.log(`   ✓ Extracted ${extracted.foreignKeys.length} foreign keys`);

  // Step 3: Detect FK cycles and assign table layers
  console.log('\nStep 3: Detecting FK cycles and assigning table layers...');
  const sortResult = topologicalSortByLayers(
    extracted.tables.keys(),
    extracted.foreignKeys.map((fk: any) => [fk.parentTable, fk.childTable]),
    true
  );

  if (sortResult.cycles.length > 0) {
    console.error('   ✗ FK cycles detected:');
    for (const cycle of sortResult.cycles) {
      console.error(`     ${cycle.join(' → ')}`);
    }
    process.exit(1);
  }

  extracted.tableLayers = sortResult.layers;
  console.log(`   ✓ Assigned ${sortResult.layers.size} table layers`);

  // Step 4: Populate schema (TWO-PASS PROCESSING)
  console.log('\nStep 4: Running two-pass schema population...');
  const populated = populateSchema(extracted);
  console.log('   ✓ Schema population complete!');

  // Step 5: Display summary
  console.log('\n=== Population Summary ===');
  console.log(`Tables: ${populated.tables.size}`);
  console.log(`Foreign Keys: ${populated.foreignKeys.length}`);
  console.log(`Column Edges (dependencies): ${populated.columnEdges.length}`);

  // Show table layers
  console.log('\nTable Layers:');
  const layerEntries = Array.from(populated.tableLayers.entries()).sort(([a], [b]) => a - b);
  for (const [layerNum, tables] of layerEntries) {
    console.log(`  Layer ${layerNum}: ${tables.join(', ')}`);
  }

  // Show column summary for each table
  console.log('\nColumn Summary:');
  const tableEntries = Array.from(populated.tables.entries());
  for (const [tableName, table] of tableEntries) {
    const formulaCount = Array.from(table.columns.values()).filter(c => c.formula).length;
    const automationCount = Array.from(table.columns.values()).filter(c => c.automation).length;
    console.log(`  ${tableName}: ${table.columns.size} columns (${formulaCount} formulas, ${automationCount} automations)`);
  }

  // Step 6: Write output
  console.log('\nStep 6: Writing .populated.json...');
  writePopulatedSchema(populated, './debug');
  console.log('   ✓ Output written');

  console.log('\n=== SUCCESS ===');
  console.log('Schema population completed without errors!');

} catch (error) {
  console.error('\n=== ERROR ===');
  console.error(error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    console.error('\nStack trace:');
    console.error(error.stack);
  }
  process.exit(1);
}
