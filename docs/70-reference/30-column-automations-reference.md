Previous: [Reference: Tables and Columns](10-tables-and-columns-reference.md) | Next: [Reference: Row Automations](40-row-automations-reference.md)

# Column Automations Technical Reference

## Automation Property

Column automations use the `automation` property in object form.

Automation types:
- SYNC - pull and maintain current parent value
- SNAPSHOT - capture parent value at insert/FK change
- SUM - aggregate sum from child rows
- COUNT - count child rows
- MAX - maximum value from child rows
- MIN - minimum value from child rows

## SYNC Automation

```yaml
tables:
  parent_table:
    columns:
      parent_id: serial primary key
      parent_value: numeric(10,2)

  child_table:
    columns:
      child_id: serial primary key
      parent_id: FK parent_table

      synced_value:
        definition: numeric(10,2)
        automation: SYNC parent_table.parent_value
```

SYNC updates when:
- Child row inserted
- Child FK updated to different parent
- Parent value changes

## SNAPSHOT Automation

```yaml
tables:
  parent_table:
    columns:
      parent_id: serial primary key
      parent_value: numeric(10,2)

  child_table:
    columns:
      child_id: serial primary key
      parent_id: FK parent_table

      captured_value:
        definition: numeric(10,2)
        automation: SNAPSHOT parent_table.parent_value
```

SNAPSHOT updates when:
- Child row inserted
- Child FK updated to different parent

SNAPSHOT does not update when parent value changes.

## Aggregation Syntax

Aggregations are placed on parent tables, aggregate from child tables.

```yaml
tables:
  parent_table:
    columns:
      parent_id: serial primary key

      total:
        definition: numeric(10,2)
        automation: SUM child_table.amount

      count:
        definition: integer
        automation: COUNT child_table.child_id

      highest:
        definition: integer
        automation: MAX child_table.rating

      lowest:
        definition: integer
        automation: MIN child_table.rating

  child_table:
    columns:
      child_id: serial primary key
      parent_id: FK parent_table
      amount: numeric(10,2)
      rating: integer
```

## Multiple Foreign Keys

When child has multiple FKs to same parent, specify which FK:

```yaml
tables:
  accounts:
    columns:
      account_id: serial primary key

      total_sent:
        definition: numeric(10,2)
        automation: SUM(from_account_id) transfers.amount

      total_received:
        definition: numeric(10,2)
        automation: SUM(to_account_id) transfers.amount

  transfers:
    columns:
      transfer_id: serial primary key
      from_account_id: FK accounts
      to_account_id: FK accounts
      amount: numeric(10,2)
```

## Formula Columns

Formula columns use the `formula` property.

```yaml
tables:
  products:
    columns:
      product_id: serial primary key
      base_price: numeric(10,2)
      tax_rate: numeric(5,4)

      final_price:
        definition: numeric(10,2)
        formula: "base_price * (1 + tax_rate)"
```

Formulas:
- Reference columns in same row
- Use PostgreSQL SQL expression syntax
- Calculate on insert and update
- Can reference other formula columns (calculated in dependency order)
- Can reference SYNC columns

---

Previous: [Reference: Tables and Columns](10-tables-and-columns-reference.md) | Next: [Reference: Row Automations](40-row-automations-reference.md)
