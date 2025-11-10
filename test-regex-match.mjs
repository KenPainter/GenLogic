const whereClause = '(total >= ((0)::numeric ))';

console.log('Input:', whereClause);
console.log('');

// Try to match ((0))::numeric
const pattern1 = /\(\(([^()]+)\)\)::\w+/g;
const matches1 = whereClause.matchAll(pattern1);
console.log('Pattern 1: /\\(\\(([^()]+)\\)\\)::\\w+/g');
for (const match of matches1) {
  console.log(' Found:', match[0], '-> Replace with: (' + match[1] + ')');
}
console.log('');

// Try a simpler approach: just strip ::typename and trailing space
const pattern2 = /::\w+\s*/g;
console.log('Pattern 2: /::\\w+\\s*/g');
const result2 = whereClause.replace(pattern2, '');
console.log(' Result:', result2);
console.log('');

// The real issue: we need to also collapse ((0)) to (0)
console.log('After strip, need to collapse double parens around simple values...');
const pattern3 = /\(\((\d+)\)\)/g;
const result3 = result2.replace(pattern3, '($1)');
console.log(' Pattern: /\\(\\((\\d+)\\)\\)/g');
console.log(' Result:', result3);
