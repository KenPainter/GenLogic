# Test: Non-Object YAML Schema

This test verifies that the processor detects and rejects YAML files that don't contain an object at the root level.

## Expected Error

```
Schema must be a YAML object
```

## Input Schema

```yaml
hello world!
```

## Notes

This test validates:
- The schema must be a YAML object (mapping), not a scalar value
- Other non-object types (arrays) would also be rejected
- The parser ensures the root structure is valid before processing
