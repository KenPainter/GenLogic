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

    let withoutCasts = whereMatch[1].replace(/::\w+/g, '');
    withoutCasts = withoutCasts.replace(/\s+/g, ' ').trim();

    return `CHECK ((${withoutCasts}))`;
  } catch (error) {
    return def;
  }
}

const live = 'CHECK ((total >= (0)::numeric))';
const desired = 'CHECK ((total >= 0))';

console.log('Live:    ', live);
const normLive = normalizeConstraintDefinition(live);
console.log('Result:  ', normLive);
console.log('');

console.log('Desired: ', desired);
const normDesired = normalizeConstraintDefinition(desired);
console.log('Result:  ', normDesired);
console.log('');

console.log('Match:', normLive === normDesired);
console.log('');

if (normLive === normDesired) {
  console.log('✓ Fix successful!');
} else {
  console.log('✗ Still not matching.');
  console.log('Live:   ', JSON.stringify(normLive));
  console.log('Desired:', JSON.stringify(normDesired));
}
