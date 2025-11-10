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

    console.log('  Before strip:', JSON.stringify(whereMatch[1]));
    const withoutCasts = whereMatch[1].replace(/::\w+/g, '');
    console.log('  After strip: ', JSON.stringify(withoutCasts));

    return `CHECK ((${withoutCasts}))`;
  } catch (error) {
    return def;
  }
}

const live = 'CHECK ((total >= (0)::numeric))';
const desired = 'CHECK ((total >= 0))';

console.log('=== Live ===');
const normLive = normalizeConstraintDefinition(live);
console.log('Final:', JSON.stringify(normLive));
console.log('');

console.log('=== Desired ===');
const normDesired = normalizeConstraintDefinition(desired);
console.log('Final:', JSON.stringify(normDesired));
console.log('');

console.log('Match:', normLive === normDesired);
console.log('');
console.log('Char-by-char comparison:');
for (let i = 0; i < Math.max(normLive.length, normDesired.length); i++) {
  if (normLive[i] !== normDesired[i]) {
    console.log(`  Position ${i}: live='${normLive[i]}' (${normLive.charCodeAt(i)}) vs desired='${normDesired[i]}' (${normDesired.charCodeAt(i)})`);
  }
}
