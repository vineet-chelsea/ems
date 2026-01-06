# Data Collection Setup

## Overview

The backend now includes an automatic data collection service that polls Modbus devices and stores data in the database.

## How It Works

1. **Automatic Polling**: The service polls all online devices every 5 seconds (configurable via `DATA_COLLECTION_INTERVAL` environment variable)
2. **Modbus Reading**: Uses Python with `pymodbus` to read register values from devices
3. **Data Storage**: Inserts collected data into device-specific tables in the database
4. **Status Updates**: Automatically updates device status to "online" when data is successfully collected, and "offline" when connection fails

## Requirements

### Python Dependencies

The data collector requires Python 3.x with `pymodbus` installed:

```bash
pip install pymodbus
```

Or use the requirements file:
```bash
pip install -r requirements_modbus.txt
```

### Environment Variables

You can configure the collection interval in your `.env` file:

```env
DATA_COLLECTION_INTERVAL=5  # Collection interval in seconds (default: 5)
```

## Manual Data Collection

Admins can manually trigger data collection via API:

```bash
POST /api/data/collect
Authorization: Bearer <admin_token>
```

## Device Status

- Devices are automatically set to **"online"** when data is successfully collected
- Devices are automatically set to **"offline"** when connection fails
- Only devices with status **"online"** are polled

## Troubleshooting

### No Data Being Collected

1. **Check Python Installation**:
   ```bash
   python --version
   ```

2. **Check pymodbus Installation**:
   ```bash
   python -c "import pymodbus; print(pymodbus.__version__)"
   ```

3. **Check Device Status**:
   - Devices must have status "online" to be polled
   - You can manually set device status via the API or UI

4. **Check Backend Logs**:
   - Look for messages like:
     - `✓ Collected data from device...` (success)
     - `✗ Failed to collect data from device...` (failure)

5. **Check Device Connection**:
   - Ensure device IP address is correct
   - Ensure Modbus TCP port (502) is accessible
   - Test connection via UI or API endpoint `/api/devices/test-connection`

### Python Script Errors

If you see errors about Python script execution:
- Ensure Python is in your system PATH
- On Windows, you may need to use `python` or `py` command
- Check that the temp directory is writable

## Testing

1. **Set Device Status to Online**:
   ```bash
   PATCH /api/devices/{deviceId}/status
   {
     "status": "online"
   }
   ```

2. **Manually Trigger Collection**:
   ```bash
   POST /api/data/collect
   ```

3. **Check Collected Data**:
   ```bash
   GET /api/data/{deviceId}/latest
   ```

## Configuration

The data collector uses device configurations from `/api/device-configs/{deviceType}` to determine:
- Which registers to read
- Data types for each register
- Parameter names

Currently supported device types:
- **PM5320**: Full register mapping with all parameters

## Notes

- The service starts automatically when the backend starts
- Collection runs in the background and doesn't block API requests
- Failed collections are logged but don't stop the service
- The service gracefully shuts down on SIGTERM/SIGINT

