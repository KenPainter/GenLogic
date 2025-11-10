import { parse, toSql } from 'pgsql-ast-parser';

const liveExpr = 'total >= (0)::numeric';
const desiredExpr = 'total >= 0';

console.log('=== Live Expression (from PostgreSQL) ===');
console.log('Input:', liveExpr);
const liveSql = `SELECT * FROM dummy WHERE ${liveExpr}`;
const liveAst = parse(liveSql);
const liveNormalized = toSql.statement(liveAst[0]);
console.log('Output:', liveNormalized);
const liveWhere = liveNormalized.match(/WHERE\s+(.+)$/is)[1];
console.log('WHERE part:', liveWhere);
console.log('');

console.log('=== Desired Expression (from YAML) ===');
console.log('Input:', desiredExpr);
const desiredSql = `SELECT * FROM dummy WHERE ${desiredExpr}`;
const desiredAst = parse(desiredSql);
const desiredNormalized = toSql.statement(desiredAst[0]);
console.log('Output:', desiredNormalized);
const desiredWhere = desiredNormalized.match(/WHERE\s+(.+)$/is)[1];
console.log('WHERE part:', desiredWhere);
console.log('');

console.log('=== The Problem ===');
console.log('PostgreSQL wraps the cast target in parens: (0)::numeric becomes ((0))');
console.log('When we strip ::numeric, we get ((0)) which still has extra parens');
console.log('');
console.log('Solution: Need to strip the entire cast pattern including the outer parens');
