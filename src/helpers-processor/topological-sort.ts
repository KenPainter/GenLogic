/**
 * Generic Topological Sort and Cycle Detection
 *
 * Provides reusable implementations of Kahn's algorithm for:
 * - Table dependency sorting (FK relationships)
 * - Column dependency sorting (formula references)
 * - Automation dependency sorting (data flow)
 * - General graph cycle detection (DFS)
 */

export interface Graph<T extends string> {
  nodes: Set<T>;
  edges: Map<T, Set<T>>;
}

export interface CycleDetectionResult<T extends string> {
  hasCycle: boolean;
  cycles: T[][];
}

export interface TopologicalSortResult<T extends string> {
  layers: Map<number, T[]>;  // Map of layer number -> array of nodes (may be empty if all nodes are in cycles)
  cycles: T[][];  // Array of cycles found (empty if no cycles)
}

/**
 * Build a generic dependency graph from a list of edges
 *
 * @param nodes - Set of node identifiers
 * @param dependencies - List of [from, to] dependency pairs
 * @returns Graph structure
 */
export function buildGraph<T extends string>(
  nodes: Iterable<T>,
  dependencies: Array<[T, T]>
): Graph<T> {
  const nodeSet = new Set(nodes);
  const edges = new Map<T, Set<T>>();

  // Initialize edges for all nodes
  for (const node of nodeSet) {
    edges.set(node, new Set());
  }

  // Add edges
  for (const [from, to] of dependencies) {
    if (nodeSet.has(from) && nodeSet.has(to)) {
      edges.get(from)!.add(to);
    }
  }

  return { nodes: nodeSet, edges };
}

/**
 * Detect cycles using Depth-First Search with recursion stack tracking
 *
 * @param graph - The dependency graph
 * @param skipSelfLoops - If true, ignore self-referential edges (default: true)
 * @returns Object with cycle detection result and list of cycles found
 */
export function detectCycles<T extends string>(
  graph: Graph<T>,
  skipSelfLoops: boolean = true
): CycleDetectionResult<T> {
  const visited = new Set<T>();
  const recursionStack = new Set<T>();
  const cycles: T[][] = [];

  const dfs = (node: T, path: T[]): boolean => {
    visited.add(node);
    recursionStack.add(node);

    const edges = graph.edges.get(node);
    if (edges) {
      for (const neighbor of edges) {
        // Skip self-loops if requested
        if (skipSelfLoops && neighbor === node) {
          continue;
        }

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
          cycles.push(cycle);
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
        break; // Stop on first cycle found
      }
    }
  }

  return {
    hasCycle: cycles.length > 0,
    cycles
  };
}

/**
 * Topological sort using Kahn's algorithm (level-based sorting)
 * Returns layers and detects cycles in a single pass
 *
 * Returns a Map of layer number → array of nodes, where:
 * - Layer 0 = nodes with no dependencies
 * - Layer 1 = nodes that only depend on layer 0 nodes
 * - Layer N = nodes that only depend on layers 0..N-1
 *
 * If cycles are detected, returns null for layers and includes cycle details
 *
 * @param nodes - Set of all node identifiers
 * @param dependencies - Array of [from, to] dependency pairs
 * @param skipSelfLoops - If true, ignore self-referential edges (default: true)
 * @returns Object with layers (Map of layer→nodes or null) and cycles array
 */
export function topologicalSortByLayers<T extends string>(
  nodes: Iterable<T>,
  dependencies: Array<[T, T]>,
  skipSelfLoops: boolean = true
): TopologicalSortResult<T> {
  const layerMap = new Map<number, T[]>();
  const nodeToLayer = new Map<T, number>();
  const inDegree = new Map<T, number>();
  const edges = new Map<T, Set<T>>();

  // Initialize nodes
  const nodeSet = new Set(nodes);
  for (const node of nodeSet) {
    inDegree.set(node, 0);
    edges.set(node, new Set());
  }

  // Build edges from dependencies
  for (const [from, to] of dependencies) {
    if (skipSelfLoops && from === to) {
      continue;
    }
    if (nodeSet.has(from) && nodeSet.has(to)) {
      edges.get(from)!.add(to);
      inDegree.set(to, (inDegree.get(to) || 0) + 1);
    }
  }

  // Process by layers
  let currentLayer = 0;
  let processed = 0;
  const totalNodes = nodeSet.size;

  while (processed < totalNodes) {
    // Find all nodes with in-degree 0
    const currentLayerNodes: T[] = [];
    for (const [node, degree] of inDegree) {
      if (degree === 0 && !nodeToLayer.has(node)) {
        currentLayerNodes.push(node);
      }
    }

    // If no nodes found but we haven't processed all, cycle detected
    if (currentLayerNodes.length === 0) {
      // We have some nodes that were successfully layered, and some stuck in cycles
      // Build a subgraph of only the unprocessed (cyclic) nodes
      const unprocessedNodes = new Set<T>();
      for (const node of nodeSet) {
        if (!nodeToLayer.has(node)) {
          unprocessedNodes.add(node);
        }
      }

      // Build edges map for only the unprocessed nodes
      const cyclicEdges = new Map<T, Set<T>>();
      for (const node of unprocessedNodes) {
        cyclicEdges.set(node, new Set());
      }
      for (const [from, to] of dependencies) {
        if (skipSelfLoops && from === to) continue;
        if (unprocessedNodes.has(from) && unprocessedNodes.has(to)) {
          cyclicEdges.get(from)!.add(to);
        }
      }

      // Detect cycles in the unprocessed subgraph
      const cycleGraph = { nodes: unprocessedNodes, edges: cyclicEdges };
      const cycleResult = detectCycles(cycleGraph, skipSelfLoops);

      // Return the valid layers we DID process, plus the cycles we found
      return {
        layers: layerMap,
        cycles: cycleResult.cycles
      };
    }

    // Store nodes in this layer
    layerMap.set(currentLayer, currentLayerNodes);

    // Assign current layer to these nodes
    for (const node of currentLayerNodes) {
      nodeToLayer.set(node, currentLayer);
      processed++;

      // Decrease in-degree for all nodes that depend on this one
      const dependents = edges.get(node);
      if (dependents) {
        for (const dependent of dependents) {
          inDegree.set(dependent, (inDegree.get(dependent) || 0) - 1);
        }
      }
    }

    currentLayer++;
  }

  return {
    layers: layerMap,
    cycles: []  // No cycles found
  };
}

/**
 * Topological sort returning a single ordered list
 *
 * @param graph - The dependency graph
 * @param skipSelfLoops - If true, ignore self-referential edges (default: true)
 * @returns Sorted list of nodes, or null if cycle detected
 */
export function topologicalSort<T extends string>(
  graph: Graph<T>,
  skipSelfLoops: boolean = true
): T[] | null {
  const inDegree = new Map<T, number>();
  const result: T[] = [];

  // Initialize in-degree for all nodes
  for (const node of graph.nodes) {
    inDegree.set(node, 0);
  }

  // Calculate in-degrees
  for (const [_, targets] of graph.edges) {
    for (const target of targets) {
      inDegree.set(target, (inDegree.get(target) || 0) + 1);
    }
  }

  // Queue all nodes with in-degree 0
  const queue: T[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) {
      queue.push(node);
    }
  }

  // Process queue
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);

    const targets = graph.edges.get(node);
    if (targets) {
      for (const target of targets) {
        if (skipSelfLoops && node === target) {
          continue;
        }
        const newDegree = (inDegree.get(target) || 0) - 1;
        inDegree.set(target, newDegree);
        if (newDegree === 0) {
          queue.push(target);
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
 * Find unprocessed nodes (participants in cycles)
 *
 * @param graph - The dependency graph
 * @param processed - Set of processed nodes
 * @returns Array of unprocessed node names
 */
export function findUnprocessedNodes<T extends string>(
  graph: Graph<T>,
  processed: Set<T>
): T[] {
  const unprocessed: T[] = [];
  for (const node of graph.nodes) {
    if (!processed.has(node)) {
      unprocessed.push(node);
    }
  }
  return unprocessed;
}
