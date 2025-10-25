Previous: [Seed Data](../50-other-schema/20-seed-data.md) | Next: [Schema Validation](../70-integrity-features/10-schema-validation.md)

# Introduction to GenLogic Schema Syntax

A GenLogic database schema is written in a single
YAML file.

The syntax follows a couple of rules:
- Use SQL terminology when we are exactly implementing
  a SQL feature.  So the syntax specifies columns and tables
  and primary keys and so forth.
- Avoid SQL or Postgres terms for GenLogic features.
  So we define "calculated" columns instead of the
  Postgres term "generated" because we are not using
  the Postgres formula column feature.

GenLogic schema syntax also favors "magic" or shortcuts
in many places, but does not require the use of shortcuts.
Using shortcuts allows a more terse file that is easier to
scan and easier to type.  Because the
dimensionality of SQL and GenLogic are relatively low, there
are only a few shortcuts to learn and, hopefully, they
are natural to the structure and should readily make sense.

---

Previous: [Seed Data](../50-other-schema/20-seed-data.md) | Next: [Schema Validation](../70-integrity-features/10-schema-validation.md)
