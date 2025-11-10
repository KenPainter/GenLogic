import { parse, toSql } from 'pgsql-ast-parser';

function normalizeConstraintDefinition(def) {
  try {
    const match = def.match(/^CHECK\s+\(\((.+)\)\)$/is);
    if (!match) {
      const simpleMatch = def.match(/^CHECK\s+\((.+)\)$/is);
      if (!simpleMatch) return def;
    }

    const expr = match ? match[1] : def.match(/^CHECK\s+\((.+)\)$/is)[1];
    const sql = `SELECT * FROM dummy WHERE ${expr}`;
    const ast = parse(sql);
    const normalized = toSql.statement(ast[0]);
    const whereMatch = normalized.match(/WHERE\s+(.+)$/is);
    if (!whereMatch) return def;
    return `CHECK ((${whereMatch[1]}))`;
  } catch (error) {
    return def;
  }
}

console.log('=== Problem: pgsql-ast-parser preserves type casts ===\n');

const live = 'CHECK ((total >= (0)::numeric))';
const desired = 'CHECK ((total >= 0))';

console.log('Input 1 (from PostgreSQL live):', live);
console.log('Input 2 (from GenLogic desired):', desired);
console.log('');

const normLive = normalizeConstraintDefinition(live);
const normDesired = normalizeConstraintDefinition(desired);

console.log('Normalized 1:', normLive);
console.log('Normalized 2:', normDesired);
console.log('');

console.log('Are they equal?', normLive === normDesired);
console.log('');

console.log('The problem:');
console.log('- PostgreSQL stores numeric literals with explicit type casts: (0)::numeric');
console.log('- GenLogic writes without type casts: 0');
console.log('- pgsql-ast-parser preserves the type cast in the AST');
console.log('- Re-serialization keeps the type cast');
console.log('- Result: false mismatch, even though constraints are functionally identical');
console.log('');

console.log('Solution options:');
console.log('1. Strip type casts from AST before comparison');
console.log('2. Strip ::type patterns from normalized strings');
console.log('3. Parse both and compare AST nodes directly (ignoring casts)');
