Previous: [MAX/MIN Automation](max-min-automation.md) | Next: [Multiple Automations](multiple-automations.md)

# LAST_VALUE Automation Example

## Overview

The LAST_VALUE automation tracks the most recently added or updated value from child records. Unlike MAX/MIN which find extreme numeric values, LAST_VALUE captures the actual value from the chronologically newest record. This is perfect for status tracking, last-known values, and maintaining current state.

## YAML Configuration

```yaml
# LAST_VALUE Automation Example
# Automatically copies the most recently inserted/updated value from child records

columns:
  id:
    type: serial primary key
    comment: Auto-incrementing primary key

  status:
    type: varchar(50)
    comment: Status field

  reading:
    type: numeric(8,2)
    comment: Sensor reading

tables:
  devices:
    columns:
      device_id:
        $ref: id

      device_name: varchar(100)

      # Always contains the most recent status from device_logs
      current_status:
        $ref: status
        automation: LAST_VALUE device_logs.status

      # Always contains the most recent sensor reading
      last_reading:
        $ref: reading
        automation: LAST_VALUE sensor_readings.value

  orders:
    columns:
      order_id:
        $ref: id

      # Tracks the latest status update for this order
      latest_status:
        $ref: status
        automation: LAST_VALUE order_status_history.status

  device_logs:
    foreign_keys:
      device_fk: devices

    columns:
      log_id:
        $ref: id

      status: null

      logged_at: timestamp

  sensor_readings:
    foreign_keys:
      device_fk: devices

    columns:
      reading_id:
        $ref: id

      value:
        $ref: reading

      recorded_at: timestamp

  order_status_history:
    foreign_keys:
      order_fk: orders

    columns:
      history_id:
        $ref: id

      status: null

      updated_at: timestamp

# How LAST_VALUE works:
# 1. INSERT new device_log with status="online" for device_id=1
#    → devices.current_status for device 1 immediately updates to "online"
# 2. INSERT another device_log with status="maintenance" for device_id=1
#    → devices.current_status for device 1 immediately updates to "maintenance"
# 3. UPDATE existing device_log status from "online" to "offline"
#    → devices.current_status updates to "offline" (NEW value always wins)
# 4. DELETE the most recent device_log
#    → Trigger finds the previous most recent log and updates devices.current_status
#
# LAST_VALUE automation behavior:
# - INSERT: Always updates parent with the new value
# - UPDATE: Always updates parent with the NEW value
# - DELETE: Falls back to the previous most recent value (if any)
#
# LAST_VALUE is suitable for status tracking, last known values, and audit trails
```

## Generated SQL

GenLogic generates triggers that capture the most recent value:

```sql
CREATE OR REPLACE FUNCTION device_logs_update_devices_latest_genlogic()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE devices
    SET current_status = NEW.status,
        last_reading = (SELECT value FROM sensor_readings
                        WHERE device_fk = NEW.device_fk
                        ORDER BY reading_id DESC LIMIT 1)
    WHERE device_id = NEW.device_fk;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE devices
    SET current_status = (SELECT status FROM device_logs
                          WHERE device_fk = OLD.device_fk
                          AND log_id != OLD.log_id
                          ORDER BY log_id DESC LIMIT 1)
    WHERE device_id = OLD.device_fk;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER device_logs_latest_automation
  AFTER INSERT OR UPDATE OR DELETE ON device_logs
  FOR EACH ROW EXECUTE FUNCTION device_logs_update_devices_latest_genlogic();
```

## Usage Examples

```sql
-- Create a device
INSERT INTO devices (device_name, current_status, last_reading)
VALUES ('Sensor-001', NULL, NULL);

-- Add status logs
INSERT INTO device_logs (device_fk, status, logged_at)
VALUES (1, 'online', '2024-01-15 10:00:00');
-- devices.current_status = 'online'

INSERT INTO device_logs (device_fk, status, logged_at)
VALUES (1, 'maintenance', '2024-01-15 14:30:00');
-- devices.current_status = 'maintenance'

INSERT INTO device_logs (device_fk, status, logged_at)
VALUES (1, 'online', '2024-01-15 16:00:00');
-- devices.current_status = 'online'

-- Add sensor readings
INSERT INTO sensor_readings (device_fk, value, recorded_at)
VALUES (1, 23.5, '2024-01-15 10:05:00');
-- devices.last_reading = 23.5

INSERT INTO sensor_readings (device_fk, value, recorded_at)
VALUES (1, 24.1, '2024-01-15 10:10:00');
-- devices.last_reading = 24.1

-- Check current state
SELECT device_name, current_status, last_reading
FROM devices WHERE device_id = 1;
-- Sensor-001 | online | 24.1

-- Delete most recent log
DELETE FROM device_logs WHERE status = 'online' AND logged_at = '2024-01-15 16:00:00';
-- devices.current_status falls back to 'maintenance'

-- Order status tracking
INSERT INTO orders (order_id, latest_status) VALUES (1, NULL);
INSERT INTO order_status_history (order_fk, status, updated_at)
VALUES (1, 'pending', NOW());
-- orders.latest_status = 'pending'

INSERT INTO order_status_history (order_fk, status, updated_at)
VALUES (1, 'shipped', NOW());
-- orders.latest_status = 'shipped'

INSERT INTO order_status_history (order_fk, status, updated_at)
VALUES (1, 'delivered', NOW());
-- orders.latest_status = 'delivered'
```

---

Previous: [MAX/MIN Automation](max-min-automation.md) | Next: [Multiple Automations](multiple-automations.md)
