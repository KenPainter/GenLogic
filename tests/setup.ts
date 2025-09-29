/**
 * Jest Test Setup
 * Configures global test environment for GenLogic testing
 */

// Extend Jest matchers for better assertions
expect.extend({
  toBeValidGenLogicSchema(received: any) {
    // Custom matcher for validating GenLogic schemas
    const pass = typeof received === 'object' &&
                 received !== null &&
                 (received.columns || received.tables);

    if (pass) {
      return {
        message: () => `Expected schema to be invalid, but it was valid`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected valid GenLogic schema, but got: ${JSON.stringify(received)}`,
        pass: false,
      };
    }
  },

  toHaveValidationError(received: any, expectedError: string) {
    const pass = received.errors &&
                 received.errors.some((error: string) => error.includes(expectedError));

    if (pass) {
      return {
        message: () => `Expected validation to not have error "${expectedError}"`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected validation error "${expectedError}", but got: ${JSON.stringify(received.errors)}`,
        pass: false,
      };
    }
  },
});

// Set longer timeout for database tests
jest.setTimeout(30000);