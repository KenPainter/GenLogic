# Database Connections

GenLogic only supports Postgres trusted connections on localhost.

GenLogic creates the requested database if it does not exist.

## Two-User Model

GenLogic uses a two-user model to provide database-level integrity
guarantees.

### Setup User (Privileged)

GenLogic must run as a privileged user with CREATEROLE privilege.
This user performs schema migrations and sets up the security model.

The setup user:
- Creates the `<database_name>_genlogic_admin` role
- Creates tables owned by the admin role
- Generates SECURITY DEFINER triggers owned by the admin role
- Configures column-level permissions for application users
- Is typically the postgres superuser or a dedicated migration user

GenLogic fails immediately if the user lacks CREATEROLE privilege.

### Application User (Normal)

After GenLogic runs, application code connects as a normal unprivileged
user. This user has restricted permissions that enforce integrity.

Application users:
- Have SELECT, INSERT, DELETE permissions on all tables
- Have UPDATE permission only on non-automated columns
- Cannot modify automated or generated columns (permission denied)
- Cannot bypass triggers (do not own tables)

This separation ensures calculated values cannot be corrupted by
application code or malicious clients.

