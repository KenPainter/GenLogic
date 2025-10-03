import { describe, it, expect } from '@jest/globals';
import { SchemaValidator } from '../../src/validation.js';
import { DataFlowGraphValidator } from '../../src/graph.js';

describe('Calculated Column Validation Tests', () => {
  const validator = new SchemaValidator();
  const graphValidator = new DataFlowGraphValidator();

  describe('Schema Syntax Validation', () => {
    it('should accept valid calculated column', () => {
      const schema = {
        tables: {
          orders: {
            columns: {
              price: { type: 'numeric', size: 10, decimal: 2 },
              quantity: { type: 'integer' },
              total: {
                type: 'numeric',
                size: 10,
                decimal: 2,
                calculated: 'price * quantity'
              }
            }
          }
        }
      };

      const result = validator.validate(schema);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept CASE expression in calculated column', () => {
      const schema = {
        tables: {
          products: {
            columns: {
              price: { type: 'numeric', size: 10, decimal: 2 },
              discount_price: {
                type: 'numeric',
                size: 10,
                decimal: 2,
                calculated: 'case when price > 100 then price * 0.9 else price end'
              }
            }
          }
        }
      };

      const result = validator.validate(schema);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Mutual Exclusion Validation', () => {
    it('should reject column with both calculated and automation', () => {
      const schema = {
        tables: {
          accounts: {
            columns: {
              account_id: { type: 'integer', primary_key: true, sequence: true }
            }
          },
          transactions: {
            foreign_keys: {
              account_fk: { table: 'accounts' }
            },
            columns: {
              amount: { type: 'numeric', size: 10, decimal: 2 },
              doubled: {
                type: 'numeric',
                size: 10,
                decimal: 2,
                calculated: 'amount * 2',
                automation: {
                  type: 'SUM',
                  table: 'transactions',
                  foreign_key: 'account_fk',
                  column: 'amount'
                }
              }
            }
          }
        }
      };

      const result = validator.validate(schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot have both'))).toBe(true);
    });
  });

  describe('Cycle Detection', () => {
    it('should detect simple cycle in calculated columns', () => {
      const schema = {
        tables: {
          test: {
            columns: {
              col_a: { type: 'integer', calculated: 'col_b + 1' },
              col_b: { type: 'integer', calculated: 'col_a + 1' }
            }
          }
        }
      };

      const result = graphValidator.validateDataFlowSafety(schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Calculated Column Cycle'))).toBe(true);
    });

    it('should detect three-way cycle in calculated columns', () => {
      const schema = {
        tables: {
          test: {
            columns: {
              col_a: { type: 'integer', calculated: 'col_b + 1' },
              col_b: { type: 'integer', calculated: 'col_c + 1' },
              col_c: { type: 'integer', calculated: 'col_a + 1' }
            }
          }
        }
      };

      const result = graphValidator.validateDataFlowSafety(schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Calculated Column Cycle'))).toBe(true);
    });

    it('should accept valid dependency chain', () => {
      const schema = {
        tables: {
          orders: {
            columns: {
              price: { type: 'numeric', size: 10, decimal: 2 },
              quantity: { type: 'integer' },
              subtotal: {
                type: 'numeric',
                size: 10,
                decimal: 2,
                calculated: 'price * quantity'
              },
              tax: {
                type: 'numeric',
                size: 10,
                decimal: 2,
                calculated: 'subtotal * 0.1'
              },
              total: {
                type: 'numeric',
                size: 10,
                decimal: 2,
                calculated: 'subtotal + tax'
              }
            }
          }
        }
      };

      const result = graphValidator.validateDataFlowSafety(schema);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Dependency Graph Building', () => {
    it('should correctly build dependency graph', () => {
      const schema = {
        tables: {
          test: {
            columns: {
              a: { type: 'integer' },
              b: { type: 'integer' },
              c: { type: 'integer', calculated: 'a + b' }
            }
          }
        }
      };

      const graphs = graphValidator.buildCalculatedColumnGraphs(schema);
      expect(graphs.has('test')).toBe(true);

      const testGraph = graphs.get('test')!;
      expect(testGraph.nodes.has('a')).toBe(true);
      expect(testGraph.nodes.has('b')).toBe(true);
      expect(testGraph.nodes.has('c')).toBe(true);

      // c depends on a and b, so edges are a→c and b→c
      const aEdges = testGraph.edges.get('a');
      const bEdges = testGraph.edges.get('b');
      expect(aEdges?.has('c')).toBe(true);
      expect(bEdges?.has('c')).toBe(true);
    });

    it('should filter out SQL keywords from dependencies', () => {
      const schema = {
        tables: {
          test: {
            columns: {
              value: { type: 'integer' },
              result: {
                type: 'integer',
                calculated: 'case when value > 0 then value else 0 end'
              }
            }
          }
        }
      };

      const graphs = graphValidator.buildCalculatedColumnGraphs(schema);
      const testGraph = graphs.get('test')!;
      const valueEdges = testGraph.edges.get('value');

      // Should only depend on 'value', not SQL keywords like 'case', 'when', 'then', 'else', 'end'
      // Edge is value→result
      expect(valueEdges?.has('result')).toBe(true);
      expect(testGraph.edges.get('case')).toBeUndefined();
      expect(testGraph.edges.get('when')).toBeUndefined();
      expect(testGraph.edges.get('then')).toBeUndefined();
      expect(testGraph.edges.get('else')).toBeUndefined();
      expect(testGraph.edges.get('end')).toBeUndefined();
    });
  });

  describe('Topological Sort', () => {
    it('should return correct calculation order', () => {
      const schema = {
        tables: {
          test: {
            columns: {
              a: { type: 'integer' },
              b: { type: 'integer', calculated: 'a + 1' },
              c: { type: 'integer', calculated: 'b + 1' }
            }
          }
        }
      };

      const graphs = graphValidator.buildCalculatedColumnGraphs(schema);
      const testGraph = graphs.get('test')!;
      const sorted = graphValidator.topologicalSortCalculatedColumns(testGraph);

      expect(sorted).not.toBeNull();
      expect(sorted).toContain('a');
      expect(sorted).toContain('b');
      expect(sorted).toContain('c');

      // a must come before b, b must come before c
      const aIndex = sorted!.indexOf('a');
      const bIndex = sorted!.indexOf('b');
      const cIndex = sorted!.indexOf('c');

      expect(aIndex).toBeLessThan(bIndex);
      expect(bIndex).toBeLessThan(cIndex);
    });

    it('should return null for cyclic dependencies', () => {
      const schema = {
        tables: {
          test: {
            columns: {
              a: { type: 'integer', calculated: 'b + 1' },
              b: { type: 'integer', calculated: 'a + 1' }
            }
          }
        }
      };

      const graphs = graphValidator.buildCalculatedColumnGraphs(schema);
      const testGraph = graphs.get('test')!;
      const sorted = graphValidator.topologicalSortCalculatedColumns(testGraph);

      expect(sorted).toBeNull();
    });
  });

  describe('Column Reference Extraction', () => {
    it('should extract simple arithmetic references', () => {
      const schema = {
        tables: {
          test: {
            columns: {
              a: { type: 'integer' },
              b: { type: 'integer' },
              c: { type: 'integer' },
              result: { type: 'integer', calculated: 'a + b - c' }
            }
          }
        }
      };

      const graphs = graphValidator.buildCalculatedColumnGraphs(schema);
      const testGraph = graphs.get('test')!;

      // result depends on a, b, c, so edges are a→result, b→result, c→result
      const aEdges = testGraph.edges.get('a');
      const bEdges = testGraph.edges.get('b');
      const cEdges = testGraph.edges.get('c');
      expect(aEdges?.has('result')).toBe(true);
      expect(bEdges?.has('result')).toBe(true);
      expect(cEdges?.has('result')).toBe(true);
    });

    it('should extract references from complex expressions', () => {
      const schema = {
        tables: {
          test: {
            columns: {
              price: { type: 'numeric', size: 10, decimal: 2 },
              quantity: { type: 'integer' },
              discount: { type: 'numeric', size: 10, decimal: 2 },
              total: {
                type: 'numeric',
                size: 10,
                decimal: 2,
                calculated: '(price * quantity) - discount'
              }
            }
          }
        }
      };

      const graphs = graphValidator.buildCalculatedColumnGraphs(schema);
      const testGraph = graphs.get('test')!;

      // total depends on price, quantity, discount, so edges are price→total, quantity→total, discount→total
      const priceEdges = testGraph.edges.get('price');
      const quantityEdges = testGraph.edges.get('quantity');
      const discountEdges = testGraph.edges.get('discount');
      expect(priceEdges?.has('total')).toBe(true);
      expect(quantityEdges?.has('total')).toBe(true);
      expect(discountEdges?.has('total')).toBe(true);
    });
  });
});