import type { GenLogicSchema, DataFlowGraph, ValidationResult } from './types.js';

/**
 * Data Flow Graph Builder and Cycle Detection
 *
 * GENLOGIC CORE SAFETY: This is the critical component that ensures "no fear of unintended consequences"
 * by detecting cycles in foreign key relationships and automation dependencies before any database operations.
 */
export class DataFlowGraphValidator {

  /**
   * Build foreign key relationship graph
   * Each edge represents a foreign key from child table to parent table
   */
  buildForeignKeyGraph(schema: GenLogicSchema): DataFlowGraph {
    const nodes = new Set<string>();
    const edges = new Map<string, Set<string>>();

    if (!schema.tables) return { nodes, edges };

    // Add all table names as nodes
    for (const tableName of Object.keys(schema.tables)) {
      nodes.add(tableName);
      edges.set(tableName, new Set());
    }

    // Add edges for foreign key relationships
    for (const [tableName, table] of Object.entries(schema.tables)) {
      if (table.foreign_keys) {
        for (const [_fkName, fk] of Object.entries(table.foreign_keys)) {
          // Edge from child table to parent table
          const childEdges = edges.get(tableName);
          if (childEdges) {
            childEdges.add(fk.table);
          }
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Build automation dependency graph
   * Each edge represents an automation dependency from source table to target table
   */
  buildAutomationGraph(schema: GenLogicSchema): DataFlowGraph {
    const nodes = new Set<string>();
    const edges = new Map<string, Set<string>>();

    if (!schema.tables) return { nodes, edges };

    // Add all table names as nodes
    for (const tableName of Object.keys(schema.tables)) {
      nodes.add(tableName);
      edges.set(tableName, new Set());
    }

    // Add edges for automation dependencies
    for (const [tableName, table] of Object.entries(schema.tables)) {
      if (table.columns) {
        for (const [_columnName, column] of Object.entries(table.columns)) {
          // Check for automation in all column definition types
          let automation: any = null;

          if (column && typeof column === 'object' && 'automation' in column) {
            automation = (column as any).automation;
          }

          if (automation) {
            // Edge from source table to target table (automation dependency)
            const sourceEdges = edges.get(automation.table);
            if (sourceEdges) {
              sourceEdges.add(tableName);
            }
          }
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Detect cycles using Depth-First Search with recursion stack tracking
   * Returns true if cycle is detected
   */
  detectCycles(graph: DataFlowGraph): ValidationResult {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const errors: string[] = [];

    const dfs = (node: string, path: string[]): boolean => {
      visited.add(node);
      recursionStack.add(node);

      const edges = graph.edges.get(node);
      if (edges) {
        for (const neighbor of edges) {
          if (!visited.has(neighbor)) {
            const newPath = [...path, neighbor];
            if (dfs(neighbor, newPath)) {
              return true;
            }
          } else if (recursionStack.has(neighbor)) {
            // Cycle detected - construct cycle path
            const cycleStart = path.indexOf(neighbor);
            const cycle = cycleStart >= 0 ? path.slice(cycleStart) : path;
            cycle.push(neighbor);
            errors.push(`Cycle detected: ${cycle.join(' → ')}`);
            return true;
          }
        }
      }

      recursionStack.delete(node);
      return false;
    };

    // Check all nodes to catch disconnected components
    for (const node of graph.nodes) {
      if (!visited.has(node)) {
        if (dfs(node, [node])) {
          break; // Stop on first cycle found for cleaner error reporting
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  /**
   * Validate that automation pathways are reachable via foreign keys
   * Ensures automations follow valid data flow paths
   */
  validateAutomationPaths(schema: GenLogicSchema, fkGraph: DataFlowGraph): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!schema.tables) {
      return { isValid: true, errors, warnings };
    }

    for (const [tableName, table] of Object.entries(schema.tables)) {
      if (table.columns) {
        for (const [columnName, column] of Object.entries(table.columns)) {
          let automation: any = null;

          if (column && typeof column === 'object' && 'automation' in column) {
            automation = (column as any).automation;
          }

          if (automation) {
            const sourceTable = automation.table;
            const targetTable = tableName;

            // For aggregation automations (SUM, COUNT, etc.), verify path from source to target
            if (['SUM', 'COUNT', 'MAX', 'MIN', 'LATEST'].includes(automation.type)) {
              if (!this.isPathReachable(fkGraph, sourceTable, targetTable)) {
                errors.push(
                  `Automation '${automation.type}' in table '${targetTable}', column '${columnName}': ` +
                  `No foreign key path from source table '${sourceTable}' to target table '${targetTable}'`
                );
              }
            }

            // For cascade automations (FETCH, FETCH_UPDATES), verify path from target to source
            if (['FETCH', 'FETCH_UPDATES'].includes(automation.type)) {
              if (!this.isPathReachable(fkGraph, targetTable, sourceTable)) {
                errors.push(
                  `Automation '${automation.type}' in table '${targetTable}', column '${columnName}': ` +
                  `No foreign key path from target table '${targetTable}' to source table '${sourceTable}'`
                );
              }
            }
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check if there's a path from source to target in the graph using BFS
   */
  private isPathReachable(graph: DataFlowGraph, source: string, target: string): boolean {
    if (source === target) return true;

    const visited = new Set<string>();
    const queue = [source];
    visited.add(source);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const edges = graph.edges.get(current);

      if (edges) {
        for (const neighbor of edges) {
          if (neighbor === target) {
            return true;
          }

          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }

    return false;
  }

  /**
   * Perform complete data flow validation
   * This is the main safety check before any database operations
   */
  validateDataFlowSafety(schema: GenLogicSchema): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Build graphs
    const fkGraph = this.buildForeignKeyGraph(schema);
    const automationGraph = this.buildAutomationGraph(schema);

    // Check for cycles in foreign key relationships
    const fkCycleResult = this.detectCycles(fkGraph);
    if (!fkCycleResult.isValid) {
      errors.push(...fkCycleResult.errors.map(e => `Foreign Key Cycle: ${e}`));
    }

    // Check for cycles in automation dependencies
    const automationCycleResult = this.detectCycles(automationGraph);
    if (!automationCycleResult.isValid) {
      errors.push(...automationCycleResult.errors.map(e => `Automation Cycle: ${e}`));
    }

    // Validate automation pathways
    const pathResult = this.validateAutomationPaths(schema, fkGraph);
    if (!pathResult.isValid) {
      errors.push(...pathResult.errors);
    }
    warnings.push(...pathResult.warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}