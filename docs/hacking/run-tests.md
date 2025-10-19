# Running Tests

## Run All Tests

```bash
bun tests/run-cli-tests.ts
```

## Filter Tests

Pass a filter string to run matching tests only:

```bash
bun tests/run-cli-tests.ts 01-cli
bun tests/run-cli-tests.ts 03-database-connection
bun tests/run-cli-tests.ts automations-sync
```

Filters match any part of the test path.
