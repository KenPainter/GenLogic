// Test the sequence bug directly
const definition = {
  type: 'integer',
  sequence: true,
  primary_key: true
};

// Simulate what generateColumnDefinition does
let sql = `"account_id" ${definition.type.toUpperCase()}`;
console.log('Before sequence handling:', sql);

if (definition.sequence) {
  if (definition.type.toLowerCase().includes('int')) {
    sql = sql.replace(definition.type, 'SERIAL');
    console.log('After replace(definition.type, SERIAL):', sql);
    console.log('Tried to replace:', definition.type, '(lowercase)');
    console.log('But sql contains:', definition.type.toUpperCase(), '(uppercase)');
  }
}

console.log('\nFinal SQL:', sql);
console.log('\nExpected: "account_id" SERIAL');
console.log('Got:', sql);
console.log('Match:', sql === '"account_id" SERIAL');