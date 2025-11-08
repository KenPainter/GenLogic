#!/usr/bin/env bun

/**
 * Test file to explore pgsql-ast-parser capabilities:
 * 1. Can we parse SQL expression fragments?
 * 2. Can we get a simple boolean valid/invalid?
 * 3. Can we extract dependent column names?
 */

import { parse, astVisitor } from 'pgsql-ast-parser';

interface ParseResult {
  valid: boolean;
  error?: string;
  columns?: string[];
}

/**
 * Parse a SQL expression and extract referenced columns
 */
function parseExpression(expr: string): ParseResult {
  try {
    // Try to parse as a SELECT with the expression
    // This is a trick to parse expressions in isolation
    const sql = `SELECT ${expr}`;
    const ast = parse(sql);

    const columns = new Set<string>();

    // Walk the AST to find column references
    const visitor = astVisitor(() => ({
      ref: (ref) => {
        // ref nodes represent column references
        if (ref.name) {
          columns.add(ref.name);
        }
      },
      // Also catch table.column references
      tableRef: (tableRef) => {
        if (tableRef.name) {
          columns.add(tableRef.name);
        }
      }
    }));

    visitor.statement(ast[0]);

    return {
      valid: true,
      columns: Array.from(columns).sort()
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Parse a WHERE clause fragment
 */
function parseWhereClause(whereExpr: string): ParseResult {
  try {
    // Wrap in a SELECT to parse the WHERE clause
    const sql = `SELECT * FROM dummy WHERE ${whereExpr}`;
    const ast = parse(sql);

    const columns = new Set<string>();

    const visitor = astVisitor(() => ({
      ref: (ref) => {
        if (ref.name) {
          columns.add(ref.name);
        }
      }
    }));

    visitor.statement(ast[0]);

    // Filter out 'dummy' which is our fake table name
    const columnList = Array.from(columns).filter(c => c !== 'dummy').sort();

    return {
      valid: true,
      columns: columnList
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Test cases
console.log('=== Testing Expression Parser ===\n');

const tests = [
  {
    name: 'Simple arithmetic',
    expr: 'debits - credits',
    parser: parseExpression
  },
  {
    name: 'WHERE clause with comparison',
    expr: 'column_name <> 1',
    parser: parseWhereClause
  },
  {
    name: 'CASE expression with IN operator',
    expr: "CASE WHEN column1 IN ('debit', 'credit') THEN column1 ELSE column2 END",
    parser: parseExpression
  },
  {
    name: 'Complex arithmetic',
    expr: '(amount * quantity) / 100.0',
    parser: parseExpression
  },
  {
    name: 'WHERE with AND/OR',
    expr: 'status = \'active\' AND balance > 0',
    parser: parseWhereClause
  },
  {
    name: 'Function call',
    expr: 'COALESCE(amount, 0)',
    parser: parseExpression
  },
  {
    name: 'Invalid syntax',
    expr: 'this is not valid sql',
    parser: parseExpression
  },
  {
    name: 'Table.column reference',
    expr: 'users.name || \' \' || users.email',
    parser: parseExpression
  }
];

tests.forEach(test => {
  console.log(`Test: ${test.name}`);
  console.log(`Expression: ${test.expr}`);

  const result = test.parser(test.expr);

  console.log(`Valid: ${result.valid}`);
  if (result.valid) {
    console.log(`Columns: [${result.columns?.join(', ')}]`);
  } else {
    console.log(`Error: ${result.error}`);
  }
  console.log('');
});

// Answer the user's questions
console.log('=== Answers to Questions ===\n');
console.log('Q: Is it simple to get a boolean valid/invalid?');
console.log('A: YES - Just wrap in try/catch. If parse() succeeds, it\'s valid.\n');

console.log('Q: Is it simple to extract dependent columns?');
console.log('A: YES - Use astVisitor to walk the AST and collect "ref" nodes.');
console.log('   See the parseExpression() function above.\n');

console.log('Q: Does it handle fragments?');
console.log('A: YES - By wrapping fragments in SELECT statements, we can parse');
console.log('   expressions and WHERE clauses. See examples above.\n');
