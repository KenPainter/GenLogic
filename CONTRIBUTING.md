# Contributing to GenLogic

This file is intended to be useful to people and AI assistants
who are making changes to this project.  As such it contains instructions
that may seem obvious, but need to be stated clearly so that the
more capable AI LLM Models stay within the guardrails.


## Documentation

All documentation should be written in a neutral tone that
provides facts and instructions.  In particular
- avoid qualitative descriptions such as "...a high quality
  solution for..."
- avoid statements that assert fit-for-purpose, such as
  "production-ready", "enterprise scale" and so forth.
- avoid **bold items** in bullet lists.
- Do not use icons anywhere in the documentation
- Simulated checkboxes like "[ ] - not complete" and
  "[x] - complete" must be used for task lists.

### Allowed Top Level Markdown Files

The top level directory may have 

- README.md 
- LICENSE.md
- CONTRIBUTING.md 

All other markdown files are assumed to be documentation
and belong in the [./docs](./docs/) folder.

### Docs Directory

The top level file [./docs/toc.md](./docs/toc.md) must always
list each file in [./docs/examples](./docs/examples/)

The utility [./docs/](./docs/add-navigation.mjs) will put
previous/next links onto all documents that are linked in
the table of contents.

## Development Practices

### Debug Files

Debug files and scripts created during development must be placed in the `./debug` directory, not in the project root. This directory is ignored by git.

Examples of debug files:
- Test scripts for manual verification
- SQL output dumps
- Schema validation debugging
- Any temporary files created while troubleshooting

To use:
```bash
# Create debug directory if needed
mkdir -p debug

# Place debug files there
node debug/my-test.js
```
