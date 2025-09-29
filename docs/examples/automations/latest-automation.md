# LATEST Automation Example

Automatically copies the most recently inserted/updated value from child records.

```yaml
# LATEST Automation Example
# Automatically copies the most recently inserted/updated value from child records

columns:
  id:
    type: integer
    sequence: true
    primary_key: true

  status:
    type: varchar
    size: 50

  reading:
    type: numeric
    size: 8
    decimal: 2

tables:
  devices:
    columns:
      device_id:
        $ref: id

      device_name:
        type: varchar
        size: 100

      # Always contains the most recent status from device_logs
      current_status:
        $ref: status
        automation:
          type: LATEST
          table: device_logs
          foreign_key: device_fk
          column: status

      # Always contains the most recent sensor reading
      last_reading:
        $ref: reading
        automation:
          type: LATEST
          table: sensor_readings
          foreign_key: device_fk
          column: value

  orders:
    columns:
      order_id:
        $ref: id

      # Tracks the latest status update for this order
      latest_status:
        $ref: status
        automation:
          type: LATEST
          table: order_status_history
          foreign_key: order_fk
          column: status

  device_logs:
    foreign_keys:
      device_fk:
        table: devices

    columns:
      log_id:
        $ref: id

      status: null

      logged_at:
        type: timestamp

  sensor_readings:
    foreign_keys:
      device_fk:
        table: devices

    columns:
      reading_id:
        $ref: id

      value:
        $ref: reading

      recorded_at:
        type: timestamp

  order_status_history:
    foreign_keys:
      order_fk:
        table: orders

    columns:
      history_id:
        $ref: id

      status: null

      updated_at:
        type: timestamp

# How LATEST works:
# 1. INSERT new device_log with status="online" for device_id=1
#    → devices.current_status for device 1 immediately updates to "online"
# 2. INSERT another device_log with status="maintenance" for device_id=1
#    → devices.current_status for device 1 immediately updates to "maintenance"
# 3. UPDATE existing device_log status from "online" to "offline"
#    → devices.current_status updates to "offline" (NEW value always wins)
# 4. DELETE the most recent device_log
#    → Trigger finds the previous most recent log and updates devices.current_status
#
# LATEST automation behavior:
# - INSERT: Always updates parent with the new value
# - UPDATE: Always updates parent with the NEW value
# - DELETE: Falls back to the previous most recent value (if any)
#
# LATEST is perfect for status tracking, last known values, and audit trails
```