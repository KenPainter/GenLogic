Previous: [Build Process](../15-genlogic-builds/15-genlogic-builds.md) | Next: [Tables and Columns](10-tables-and-columns.md)

# Introduction to GenLogic YAML syntax

This documentation assumes knowledge of basic Relational/SQL
concepts such as tables, columns, primary keys, foreign keys,
indexes, unique constraints and check constraints.

This guide shows how to express those elements in the
declarative YAML syntax of GenLogic.

GenLogic uses the DRY principle to alter how some SQL
elements are defined.  Most notable is the foreign key, which
is expressed without type information, because that information
should be inferred from the parent table's primary key:

```yaml
tables:
  customers:
    columns:
      customer_id: serial primary key
      name: varchar(100)

  orders:
    columns:
      order_id: serial primary key

      # customer_id becomes an integer (serial creates integer)
      customer_id: FK customers

      order_date: date
```

In this section we will see how to describe a normalized
SQL database.  This is the "normalization" portion of GenLogic's
"Augmented Normalization".  Later sections will demonstrate
the "Augmented" portion through automations and formulas.

---

Previous: [Build Process](../15-genlogic-builds/15-genlogic-builds.md) | Next: [Tables and Columns](10-tables-and-columns.md)
