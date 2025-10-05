/**
 * Pre-create all test databases
 * Run this before the test suite
 */

import { SQL } from 'bun';

const TEST_DB_CONFIG = {
  host: '127.0.0.1',
  port: 5432,
  user: 'ken',
  password: 'password123',
};

const TEST_DATABASES = [
  'genlogic_test_calc',
  'genlogic_test_matching',
  'genlogic_test_setup',
  'genlogic_test_automation',
];

async function ensureTestDatabases() {
  // Connect to postgres database to create our test databases
  const adminDb = new SQL({
    hostname: TEST_DB_CONFIG.host,
    port: TEST_DB_CONFIG.port,
    database: 'postgres',
    username: TEST_DB_CONFIG.user,
    password: TEST_DB_CONFIG.password,
  });

  for (const dbName of TEST_DATABASES) {
    try {
      // Check if database exists
      const result = await adminDb`
        SELECT 1 FROM pg_database WHERE datname = ${dbName}
      `;

      if (result.length === 0) {
        // Database doesn't exist, create it
        await adminDb.unsafe(`CREATE DATABASE "${dbName}"`);
        console.log(`Created database: ${dbName}`);
      } else {
        console.log(`Database already exists: ${dbName}`);
      }
    } catch (error) {
      console.error(`Error creating database ${dbName}:`, error);
    }
  }

  process.exit(0);
}

ensureTestDatabases();
