# Accessing the Database

Applications should always connect to the database without the
admin role, to protect non-subvertibility.

## Non-Subvertibility

Non-Subvertibility works by two mechanisms:
- INSERT: triggers write correct defaults and formula values, even
  if subverting values are provided, they will be overwritten.
- UPDATE: non-admin users have no UPDATE permissions on formula or
  automation columns.

If the application connects as the admin role, then **by either accident or malice**,
UPDATE statements can corrupt formula or aggregation columns.

The `<database_name>_genlogic_admin` role owns all GenLogic-managed tables and functions. This role:
- Can UPDATE any column, including automated columns
- Bypasses column-level permission restrictions
- Should only be used for schema migrations and GenLogic builds

