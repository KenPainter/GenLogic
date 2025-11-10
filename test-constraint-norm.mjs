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
    console.log('  Parsing SQL:', sql);
    const ast = parse(sql);
    const normalized = toSql.statement(ast[0]);
    console.log('  Normalized SQL:', normalized);
    const whereMatch = normalized.match(/WHERE\s+(.+)$/is);
    if (!whereMatch) return def;
    return `CHECK ((${whereMatch[1]}))`;
  } catch (error) {
    console.log('  ERROR:', error.message);
    return def;
  }
}

const live = 'CHECK ((total >= (0)::numeric))';
const desired = 'CHECK ((total >= 0))';

console.log('Live:    ', live);
console.log('Normalizing live...');
const normLive = normalizeConstraintDefinition(live);
console.log('Result:  ', normLive);
console.log('');

console.log('Desired: ', desired);
console.log('Normalizing desired...');
const normDesired = normalizeConstraintDefinition(desired);
console.log('Result:  ', normDesired);
console.log('');

console.log('Match:', normLive === normDesired);
