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
Previous: [Title](../path/to/previous.md) | Next: [Title](path/to/next.md)

# Document Title

Content goes here...

---

Previous: [Title](../path/to/previous.md) | Next: [Title](path/to/next.md)
```

## Path Handling

The script automatically:
- Calculates relative paths between files
- Handles files in different subdirectories
- Searches the entire docs tree to find moved files
- Updates toc.md if files are found in different locations

## File Detection

Files are matched by basename, so these are considered the same file:
- `guides/cli-usage.md`
- `building-database/01-cli-usage.md`

The script will update toc.md to point to the actual location.

## Output

The script reports:
- Number of files found in toc.md
- Any path corrections made to toc.md
- Each file updated with navigation links
- Warnings for files listed in toc.md but not found

## Example Output

```
Step 1: Extracting file list from toc.md...
Found 18 files in toc.md

Step 2: Updating toc.md with corrected paths...
Updated toc.md: guides/cli-usage.md -> building-database/01-cli-usage.md
toc.md updated with corrected paths

Step 3: Adding navigation to files...
Updated: schema-syntax/01-single-table.md
Updated: schema-syntax/02-reusable-columns.md
Updated: schema-syntax/03-foreign-keys.md
...

Done!
```

## Pull Request Requirements

Before submitting a documentation pull request:

1. Ensure all new files are listed in `docs/toc.md`
2. Run `node add-navigation.mjs` from the docs directory
3. Commit the navigation changes along with your documentation

This ensures consistent navigation throughout the documentation.
