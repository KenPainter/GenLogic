# Contributing to GenLogic

## Use of AI Assistants

Use of AI assistants is neither encouraged nor discouraged,
but it is sorta-kinda expected.  We try to keep GenLogic optimized for
AI assistants when developing it and when using it.

Because LLM models vary greatly in quality, consider the quality
of your model before making the investment.  Poor quality models
will load up the codebase with ad-hockery
that will be rejected.  

## Pull Requests

There are really only two requirements for a PR:
- if it was worth doing, it is worth documenting
- if it was worth doing, it is worth testing

The precise method of work is in 
the [Test Coverage](./tests/TEST-COVERAGE.md) register.


## Documentation

This section, sadly, is written for AI assistants that
tend to fill the docs with **exciting bolded items**
and breathless declarations of amazing-ness.  Tell your
AI assistant that these instructions are **critical**
and **super-important** and **must not be ignored**.

All documentation should be written in a neutral tone that
provides facts and instructions.  In particular:
- Avoid qualitative descriptions such as "...a high quality
  solution for...".
- Avoid even single adjectives like "powerful", "intelligent".
  Stick to the neutral tone and provide facts and instructions.
- Avoid statements that assert fit-for-purpose, such as
  "production-ready", "enterprise scale" and so forth.
- Avoid **bold items** entirely.  They are annoying to
  human readers who are just reading the markdown text.
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
list every other file in the [./docs](./docs) foler.

The utility [./docs/add-navigation.mjs](./docs/add-navigation.mjs) will put
previous/next links onto all documents that are linked in
the table of contents.