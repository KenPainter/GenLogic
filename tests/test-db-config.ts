/**
 * Test Database Configuration
 *
 * Centralized database config for all database tests.
 * Add this file to .gitignore to avoid committing credentials.
 *
 * NOTE: Run `bun tests/ensure-test-dbs.ts` before running database tests
 * to create the required test databases.
 */

export const TEST_DB_CONFIG = {
  host: '127.0.0.1',  // TCP connection (use password auth)
  port: 5432,
  user: 'ken',
  password: 'password123',
  dryRun: false
};

export function getTestDbConfig(database: string) {
  return {
    ...TEST_DB_CONFIG,
    database
  };
}
