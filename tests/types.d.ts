// Custom Jest matcher declarations for TypeScript
declare namespace jest {
  interface Matchers<R> {
    toBeValidGenLogicSchema(): R;
    toHaveValidationError(expectedError: string): R;
  }
}