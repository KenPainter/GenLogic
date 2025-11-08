# Test: Invalid YAML Syntax

This test verifies that the processor properly detects and reports malformed YAML files.

## Expected Error

```
Tabs are not allowed as indentation
```

## Input Schema

```yaml
tables:
	users:
		id: integer
```

## Notes

The YAML uses tab characters for indentation, which is forbidden in YAML.
