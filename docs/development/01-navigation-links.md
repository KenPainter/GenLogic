Previous: [Seed Data](../building-database/02-seed-data.md) | Next: [Test Guide](02-test-guide.md)

# Documentation Navigation Links

The `add-navigation.mjs` script adds Previous/Next navigation links to all documentation files listed in `docs/toc.md`.

## When to Run

Run this script:
- After adding new documentation files to toc.md
- After moving or renaming documentation files
- After reorganizing the documentation structure
- Before submitting a pull request that modifies documentation

## Usage

```bash
cd docs
bun add-navigation.mjs
```

## What It Does

1. Reads `docs/toc.md` to get the ordered list of documentation files
2. Finds the actual location of each file (handles moved files)
3. Updates `toc.md` with corrected paths if files have moved
4. Removes existing navigation links from all files
5. Adds new navigation links at the top and bottom of each file

## Navigation Format

The script adds navigation in this format:

```markdown
# Document Title

Content goes here...

---

Previous: [Seed Data](../building-database/02-seed-data.md) | Next: [Test Guide](02-test-guide.md)
