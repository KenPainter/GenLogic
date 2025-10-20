Previous: [Auto-Creating Parent Rows](10-auto-create-parent.md) | Next: [Syncing Parent to Children](30-sync-to-children.md)

# Spreading Parent to Multiple Children

GenLogic can automatically generate multiple child rows from a single parent
row based on date ranges and intervals.

This feature allows the app to create recurring events, time-series data,
or scheduled tasks directly in the database using triggers.

## Use Cases

- Recurring events (daily meetings, weekly reports, monthly billing)
- Time-series data generation (sensor readings, scheduled tasks)
- Calendar generation from date ranges
- Template expansion (project templates creating multiple tasks)
- Subscription billing periods from start/end dates

## Basic Example

```yaml
tables:
  events:
    columns:
      event_id: serial primary key
      event_name: varchar(100)
      start_date: date
      end_date: date
      interval: varchar(20)

  event_occurrences:
    foreign_keys:
      event_id:
        table: events
        auto_create:
          on: [insert]
          spread:
            start: start_date
            end: end_date
            interval: interval
            generated_column: occurrence_date

    columns:
      occurrence_id: serial primary key
      occurrence_date: date
      status: varchar(20) default 'pending'
```

## What Happens

When the app inserts an event:

```sql
INSERT INTO events (event_name, start_date, end_date, interval)
VALUES ('Daily Standup', '2025-01-01', '2025-01-05', '1 day');
```

GenLogic automatically:
1. Triggers AFTER INSERT on the events table
2. Loops from start_date to end_date using the interval
3. Creates one child row for each date in the range
4. Populates the foreign key and generated_column
5. Applies any copy_columns or literals

Result: 5 rows created in event_occurrences:
- occurrence_date: 2025-01-01, 2025-01-02, 2025-01-03, 2025-01-04, 2025-01-05
- event_id: 1 (foreign key to parent)
- status: 'pending' (from default value)

## Syntax

Add auto_create with spread configuration to the foreign key:

```yaml
foreign_keys:
  parent_fk:
    table: parent_table
    auto_create:
      on: [insert, update, delete]
      spread:
        start: start_column_name
        end: end_column_name
        interval: interval_column_name
        generated_column: child_date_column
```

Required properties:
- start - Column name in parent table containing start date
- end - Column name in parent table containing end date
- interval - Column name in parent table containing interval (PostgreSQL INTERVAL type)
- generated_column - Column name in child table to populate with generated dates

Optional properties:
- on - Which operations trigger spreading (default: [insert])
- copy_columns - Copy values from parent to child
- literals - Set constant values in child rows
- filter - SQL condition to apply spreading conditionally

## Parent Table Requirements

The parent table must have:
- A primary key (used for foreign key reference)
- Columns for start date, end date, and interval
- Date columns can be DATE or TIMESTAMP types
- Interval column should contain PostgreSQL INTERVAL syntax (e.g., '1 day', '2 weeks', '3 months')

## Child Table Requirements

The child table must have:
- A foreign key column (created automatically by GenLogic)
- A column to receive generated dates (specified in generated_column)
- The generated_column should be DATE or TIMESTAMP type

## Copying Values from Parent

Use copy_columns to copy additional values from parent to child:

```yaml
tables:
  projects:
    columns:
      project_id: serial primary key
      project_name: varchar(100)
      start_date: date
      end_date: date
      interval: varchar(20)
      default_assignee: varchar(50)

  tasks:
    foreign_keys:
      project_id:
        table: projects
        auto_create:
          on: [insert]
          spread:
            start: start_date
            end: end_date
            interval: interval
            generated_column: due_date
          copy_columns:
            default_assignee: assignee
            project_name: task_prefix

    columns:
      task_id: serial primary key
      due_date: date
      assignee: varchar(50)
      task_prefix: varchar(100)
```

## Setting Constant Values

Use literals to set constant values in generated child rows:

```yaml
foreign_keys:
  project_id:
    table: projects
    auto_create:
      on: [insert]
      spread:
        start: start_date
        end: end_date
        interval: interval
        generated_column: due_date
      literals:
        status: "'pending'"
        priority: "'normal'"
```

Note: Literal values must be valid SQL expressions (strings need single quotes).

## Conditional Spreading

Use filter to apply spreading only when certain conditions are met:

```yaml
foreign_keys:
  project_id:
    table: projects
    auto_create:
      on: [insert]
      spread:
        start: start_date
        end: end_date
        interval: interval
        generated_column: due_date
      filter: "NEW.recurring = true"
```

## Operations

Spreading supports three operations:

INSERT - Creates child rows when parent is created:
```yaml
on: [insert]
```

UPDATE - Regenerates child rows if date range or interval changes:
```yaml
on: [update]
```
- Deletes existing child rows for this parent
- Regenerates based on new date range
- Only regenerates if start, end, or interval changed

DELETE - Removes child rows when parent is deleted:
```yaml
on: [delete]
```

Specify multiple operations:
```yaml
on: [insert, update, delete]
```

## Interval Types

The interval column can use any PostgreSQL INTERVAL syntax:
- '1 day' - Daily
- '1 week' - Weekly
- '1 month' - Monthly
- '1 year' - Yearly
- '2 hours' - Every 2 hours
- '15 minutes' - Every 15 minutes

## Restrictions

### Required Columns Must Exist

The spread configuration requires specific columns to exist:

```yaml
# INVALID - start column doesn't exist in parent
tables:
  events:
    columns:
      event_id: serial primary key
      # Missing: start_date

  occurrences:
    foreign_keys:
      event_id:
        table: events
        auto_create:
          spread:
            start: start_date  # Error: column doesn't exist
```

### Generated Column Must Exist

The child table must have the generated_column:

```yaml
# INVALID - occurrence_date doesn't exist
tables:
  events:
    columns:
      event_id: serial primary key
      start_date: date
      end_date: date
      interval: varchar(20)

  occurrences:
    foreign_keys:
      event_id:
        table: events
        auto_create:
          spread:
            start: start_date
            end: end_date
            interval: interval
            generated_column: occurrence_date  # Error: column doesn't exist
    columns:
      occurrence_id: serial primary key
      # Missing: occurrence_date
```

### Copy Columns Must Exist

Both parent and child columns in copy_columns must exist:

```yaml
# INVALID - assignee doesn't exist in child
auto_create:
  spread:
    start: start_date
    end: end_date
    interval: interval
    generated_column: due_date
  copy_columns:
    default_assignee: assignee  # Error: child column doesn't exist
```

### Literal Columns Must Exist

Child columns in literals must exist:

```yaml
# INVALID - status doesn't exist in child
auto_create:
  spread:
    start: start_date
    end: end_date
    interval: interval
    generated_column: due_date
  literals:
    status: "'pending'"  # Error: child column doesn't exist
```

## Complete Example

```yaml
tables:
  # Parent table with date range and interval
  recurring_events:
    columns:
      event_id: serial primary key
      event_name: varchar(100)
      category: varchar(50)
      start_date: date
      end_date: date
      frequency: varchar(20)
      default_status: varchar(20)

  # Child table with auto-generated occurrences
  event_instances:
    foreign_keys:
      event_id:
        table: recurring_events
        auto_create:
          on: [insert, update, delete]
          spread:
            start: start_date
            end: end_date
            interval: frequency
            generated_column: instance_date
          copy_columns:
            category: event_category
            default_status: status

    columns:
      instance_id: serial primary key
      instance_date: date
      event_category: varchar(50)
      status: varchar(20)
```

Usage:

```sql
-- Create recurring event
INSERT INTO recurring_events (event_name, category, start_date, end_date, frequency, default_status)
VALUES ('Team Standup', 'Meetings', '2025-01-01', '2025-01-05', '1 day', 'scheduled');

-- Automatically creates 5 rows in event_instances
-- instance_date: 2025-01-01, 2025-01-02, 2025-01-03, 2025-01-04, 2025-01-05
-- event_category: 'Meetings' (copied from parent)
-- status: 'scheduled' (copied from parent)

-- Update the date range
UPDATE recurring_events SET end_date = '2025-01-07' WHERE event_id = 1;
-- Automatically regenerates: deletes old instances, creates 7 new ones

-- Delete the event
DELETE FROM recurring_events WHERE event_id = 1;
-- Automatically deletes all 7 event_instances
```

## Test Coverage

This section lists tests that verify spread features work correctly.

### Validation (Runtime)

Tests that verify GenLogic catches invalid spread configurations:

- [x] [Bad start column](../../tests/04-validation/auto-create-spread-bad-start) - Error when start column doesn't exist in parent
- [x] [Bad end column](../../tests/04-validation/auto-create-spread-bad-end) - Error when end column doesn't exist in parent
- [x] [Bad copy_columns parent](../../tests/04-validation/auto-create-copy-bad-parent) - Error when copy_columns references non-existent parent column
- [x] [Bad copy_columns child](../../tests/04-validation/auto-create-copy-bad-child) - Error when copy_columns references non-existent child column
- [x] [Bad literals column](../../tests/04-validation/auto-create-literals-bad-column) - Error when literals references non-existent child column

### Behavior (End-to-End Tests)

Tests that verify spread behavior with actual data:

- [x] [Spread basic](../../tests/06-behavior/automations-spread) - Generates multiple child rows from date range on INSERT
- [x] [Spread update regenerate](../../tests/06-behavior/spread-update-regenerate) - Regenerates child rows when date range or interval changes on UPDATE
- [x] [Spread delete](../../tests/06-behavior/spread-delete) - Deletes all child rows when parent is deleted
- [x] [Spread copy columns](../../tests/06-behavior/spread-copy-columns) - Copies parent values to all generated child rows
- [x] [Spread literals](../../tests/06-behavior/spread-literals) - Sets literal values in all generated child rows
- [x] [Spread filter](../../tests/06-behavior/spread-filter) - Conditionally spreads based on filter condition
- [x] [Spread weekly monthly](../../tests/06-behavior/spread-weekly-monthly) - Tests different interval types (week, month)
- [x] [Spread update no change](../../tests/06-behavior/spread-update-no-change) - Verifies no regeneration when dates unchanged

---

Previous: [Auto-Creating Parent Rows](10-auto-create-parent.md) | Next: [Syncing Parent to Children](30-sync-to-children.md)
