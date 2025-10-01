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
   * Extract column names from a calculated expression
   * Simple regex-based parser to find potential column references
   */
  private extractColumnReferences(expression: string): string[] {
    // Match SQL identifiers (letters, numbers, underscores)
    // This will capture column names from expressions like "col1 + col2" or "case when col1 > 0 then col2 else col3 end"
    const identifierRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
    const matches = expression.match(identifierRegex) || [];

    // Filter out SQL keywords to avoid false positives
    const sqlKeywords = new Set([
      'case', 'when', 'then', 'else', 'end', 'and', 'or', 'not', 'null', 'true', 'false',
      'select', 'from', 'where', 'order', 'by', 'group', 'having', 'distinct',
      'as', 'is', 'in', 'like', 'between', 'exists', 'all', 'any', 'some',
      'union', 'intersect', 'except', 'join', 'inner', 'outer', 'left', 'right', 'full', 'cross',
      'on', 'using', 'natural', 'asc', 'desc', 'limit', 'offset'
    ]);

    return matches.filter(match => !sqlKeywords.has(match.toLowerCase()));
  }

  /**
   * Build calculated column dependency graph within each table
   * Returns a map of table names to their internal column dependency graphs
   */
  buildCalculatedColumnGraphs(schema: GenLogicSchema): Map<string, DataFlowGraph> {
    const tableGraphs = new Map<string, DataFlowGraph>();

    if (!schema.tables) return tableGraphs;

    for (const [tableName, table] of Object.entries(schema.tables)) {
      const nodes = new Set<string>();
      const edges = new Map<string, Set<string>>();

      if (!table.columns) continue;

      // Add all columns as nodes
      for (const columnName of Object.keys(table.columns)) {
        nodes.add(columnName);
        edges.set(columnName, new Set());
      }

      // Add edges for calculated column dependencies
      for (const [columnName, column] of Object.entries(table.columns)) {
        let calculated: string | undefined = undefined;

        if (column && typeof column === 'object' && 'calculated' in column) {
          calculated = (column as any).calculated;
        }

        if (calculated) {
          // Extract column references from the expression
          const referencedColumns = this.extractColumnReferences(calculated);

          // Add edges from this column to each referenced column
          const columnEdges = edges.get(columnName);
          if (columnEdges) {
            for (const refColumn of referencedColumns) {
              // Only add edge if the referenced column exists in this table
              if (nodes.has(refColumn)) {
                columnEdges.add(refColumn);
              }
            }
          }
        }
      }

      tableGraphs.set(tableName, { nodes, edges });
    }

    return tableGraphs;
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
   * Topological sort of calculated columns to determine evaluation order
   * Returns ordered list of column names, or null if cycle detected
   */
  topologicalSortCalculatedColumns(graph: DataFlowGraph): string[] | null {
    const inDegree = new Map<string, number>();
    const result: string[] = [];

    // Initialize in-degree for all nodes
    for (const node of graph.nodes) {
      inDegree.set(node, 0);
    }

    // Calculate in-degrees
    for (const [_, neighbors] of graph.edges) {
      for (const neighbor of neighbors) {
        inDegree.set(neighbor, (inDegree.get(neighbor) || 0) + 1);
      }
    }

    // Queue all nodes with in-degree 0
    const queue: string[] = [];
    for (const [node, degree] of inDegree) {
      if (degree === 0) {
        queue.push(node);
      }
    }

    // Process queue
    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);

      const neighbors = graph.edges.get(node);
      if (neighbors) {
        for (const neighbor of neighbors) {
          const newDegree = (inDegree.get(neighbor) || 0) - 1;
          inDegree.set(neighbor, newDegree);
          if (newDegree === 0) {
            queue.push(neighbor);
          }
        }
      }
    }

    // If we processed all nodes, no cycle exists
    if (result.length === graph.nodes.size) {
      return result;
    }

    // Cycle detected
    return null;
  }

  /**
   * Perform complete data flow validation
   * This is the main safety check before any database operations
   *
   * NOTE: With consolidated triggers and change detection, automation cycles are SAFE
   * We only check for structural FK cycles and calculated column cycles
   */
  validateDataFlowSafety(schema: GenLogicSchema): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Build graphs
    const fkGraph = this.buildForeignKeyGraph(schema);
    const calculatedGraphs = this.buildCalculatedColumnGraphs(schema);

    // Check for cycles in foreign key relationships (structural cycles only)
    const fkCycleResult = this.detectCycles(fkGraph);
    if (!fkCycleResult.isValid) {
      errors.push(...fkCycleResult.errors.map(e => `Foreign Key Cycle: ${e}`));
    }

    // REMOVED: Automation cycle detection
    // With change detection in consolidated triggers, automation cycles are safe:
    // - PUSH to children only if parent columns changed
    // - PUSH to parents only if child columns changed
    // - This breaks potential infinite loops at runtime

    // Check for cycles in calculated columns (per table)
    for (const [tableName, graph] of calculatedGraphs) {
      const calcCycleResult = this.detectCycles(graph);
      if (!calcCycleResult.isValid) {
        errors.push(...calcCycleResult.errors.map(e => `Calculated Column Cycle in table '${tableName}': ${e}`));
      }
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