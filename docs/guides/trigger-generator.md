Previous: [NULL Handling](../architecture/null-handling.md) | Next: [Minimal Schema](../examples/basic/minimal-schema.md)

# Trigger Generator Deep Dive

The Trigger Generator is a core component of GenLogic that creates PostgreSQL triggers to implement data automation patterns. It uses a consolidated approach where one trigger per table handles all automations efficiently.

## Core Concept

GenLogic treats foreign keys as data pipelines, not just constraints. The trigger generator creates BEFORE triggers that:
- Execute in deterministic order
- Prevent infinite loops through change detection
- Handle multiple automation types in a single pass
- Maintain data consistency across related tables

## Automation Types

### 1. SYNC - Bidirectional Synchronization

Keeps related tables in sync by propagating changes:

```yaml
tables:
  transactions:
    foreign_keys:
      account:
        table: accounts
        auto_create:
          sync:
            ledger:  # Sync to ledger table
              operations: [insert, update, delete]
              match: { transaction_id: source_id }
              copy_columns: { amount: debit, description: memo }
```

**Generated Behavior:**
- INSERT: Creates corresponding ledger entry
- UPDATE: Updates matching ledger entry
- DELETE: Removes corresponding ledger entry

### 2. SPREAD - Date Range Expansion

Generates multiple child rows based on date ranges and intervals:

```yaml
tables:
  payment_plans:
    columns:
      start_date: { type: date }
      end_date: { type: date }
      payment_interval: { type: interval }
      amount: { type: numeric }
    foreign_keys:
      customer:
        table: customers

  scheduled_payments:
    foreign_keys:
      plan:
        table: payment_plans
        auto_create:
          on: [insert, update]
          spread:
            start: start_date
            end: end_date
            interval: payment_interval
            generated_column: due_date
          copy_columns: { amount: payment_amount }
```

**Generated Behavior:**
- Creates scheduled_payments rows for each interval between start and end dates
- Updates regenerate all payments when plan changes
- Deletes remove all associated payments

### 3. FETCH - Pull Data from Parents

Automatically copies data from parent tables when foreign key is set:

```yaml
columns:
  customer_name:
    type: varchar
    automation:
      type: FOLLOW
      table: customers
      foreign_key: customer_fk
      column: name
```

**Generated Behavior:**
- When customer_fk is set/changed, fetches customer name
- Updates when parent data changes (if FETCH_UPDATES enabled)

### 4. PUSH - Cascade Updates to Children

Propagates changes from parent to child tables:

```yaml
tables:
  products:
    columns:
      price: { type: numeric }

  order_items:
    columns:
      unit_price:
        type: numeric
        automation:
          type: FOLLOW
          table: products
          foreign_key: product_fk
          column: price
```

**Generated Behavior:**
- When product price changes, updates all order_items with that product

### 5. Aggregations - Roll Up to Parents

Maintains aggregate values in parent tables:

```yaml
columns:
  total_amount:
    type: numeric
    automation:
      type: SUM
      table: order_items
      foreign_key: order_fk
      column: amount
```

**Supported Aggregation Types:**
- **SUM** - Total of child values
- **COUNT** - Number of child records
- **MAX/MIN** - Extreme values
- **LATEST** - Most recent value
- **DOMINANT** - Most frequent value
- **QUEUEPOS** - Position in queue

## Trigger Architecture

### Consolidated Trigger Structure

Each table gets one BEFORE trigger that:

```sql
CREATE OR REPLACE FUNCTION genlogic_trigger_[table]()
RETURNS TRIGGER AS $$
BEGIN
  -- Phase 1: Calculate computed columns
  -- Phase 2: Fetch from parents (PULL)
  -- Phase 3: Execute SYNC operations
  -- Phase 4: Execute SPREAD operations
  -- Phase 5: Push to parents (aggregations)

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Execution Order

1. **Calculated Columns** - Computed first as other automations may depend on them
2. **Pull from Parents** - Fetch latest parent data
3. **Sync Operations** - Maintain sibling table consistency
4. **Spread Operations** - Generate child rows
5. **Push to Parents** - Update aggregate values

### Change Detection

Prevents infinite loops by detecting actual changes:

```sql
-- Only update if value actually changed
IF OLD.column IS DISTINCT FROM NEW.column THEN
  -- Execute automation
END IF;
```

### Error Handling

Triggers use defensive programming:
- Check for NULL foreign keys
- Validate data types
- Use COALESCE for NULL handling
- Graceful degradation on errors

## Performance Optimizations

### 1. Consolidated Triggers
- One trigger per table instead of multiple
- Reduces overhead and improves predictability
- Easier to debug and maintain

### 2. Smart Updates
- Only updates changed values
- Batch operations where possible
- Uses efficient CTEs for complex logic

### 3. Index Support
- Automatically considers indexes for FK lookups
- Optimizes aggregate queries
- Leverages PostgreSQL query planner

## Advanced Features

### Conditional Automation

Apply automation only when conditions are met:

```yaml
auto_create:
  filter: "status = 'active'"
  copy_columns: { amount: charge_amount }
```

### Literal Values

Set constant values during automation:

```yaml
auto_create:
  literals:
    created_by: 'system'
    automation_type: 'scheduled'
```

### Multiple Foreign Keys

Handle complex relationships:

```yaml
foreign_keys:
  customer:
    table: customers
  product:
    table: products
  # Both FKs can have different automations
```

## Debugging Triggers

### View Generated SQL

Use dry-run mode to see generated triggers:

```bash
bun run src/cli.ts -s schema.yaml --dry-run | grep TRIGGER
```

### Enable Debug Output

```bash
DEBUG_SQL=1 bun run src/cli.ts -s schema.yaml
```

### PostgreSQL Logging

Enable trigger logging in PostgreSQL:

```sql
SET log_statement = 'all';
SET log_duration = on;
```

### Common Issues

1. **Infinite Loops** - Check for circular automations
2. **Performance** - Review aggregate queries with EXPLAIN
3. **NULL Handling** - Verify COALESCE usage
4. **Race Conditions** - Use appropriate transaction isolation

## Best Practices

### 1. Design Principles
- Keep automations simple and focused
- Avoid circular dependencies
- Use appropriate aggregation types
- Consider NULL handling explicitly

### 2. Performance
- Limit cascade depth
- Index foreign key columns
- Monitor trigger execution time
- Batch bulk operations when possible

### 3. Maintenance
- Document automation intent
- Test with edge cases
- Version control schema files
- Monitor production behavior

## Integration Examples

### E-commerce Order System

```yaml
tables:
  orders:
    columns:
      total: { type: numeric, automation: { type: SUM, table: order_items, foreign_key: order_fk, column: amount }}
      status: { type: varchar }

  order_items:
    columns:
      amount: { calculated: "quantity * unit_price" }
      product_name: { automation: { type: FOLLOW, table: products, foreign_key: product_fk, column: name }}
    foreign_keys:
      order_fk: { table: orders }
      product_fk: { table: products }
```

### Subscription Billing

```yaml
tables:
  subscriptions:
    columns:
      next_bill_date: { type: date }
      billing_interval: { type: interval }

  invoices:
    foreign_keys:
      subscription:
        table: subscriptions
        auto_create:
          spread:
            start: next_bill_date
            end: end_date
            interval: billing_interval
            generated_column: invoice_date
```

## Troubleshooting

### Trigger Not Firing
1. Check trigger exists: `\df genlogic_trigger_*`
2. Verify trigger enabled: `SELECT * FROM pg_trigger`
3. Check for errors in PostgreSQL logs
4. Test with simple INSERT/UPDATE

### Unexpected Results
1. Enable DEBUG_SQL to see actual SQL
2. Check automation conditions
3. Verify foreign key relationships
4. Review NULL handling logic

### Performance Issues
1. Analyze with EXPLAIN ANALYZE
2. Check for missing indexes
3. Review automation complexity
4. Consider async processing for heavy operations

---

Previous: [NULL Handling](../architecture/null-handling.md) | Next: [Minimal Schema](../examples/basic/minimal-schema.md)
