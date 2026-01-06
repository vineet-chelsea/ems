# Modbus Register Reading Test Scripts

These scripts help you test if the application can read Modbus registers from your devices.

## Prerequisites

- Python 3.x with `pymodbus` library installed
- Node.js/TypeScript (for TypeScript test script)
- Network access to your Modbus device

## Installation

```bash
# Install Python dependencies
pip install pymodbus

# Or if using pip3
pip3 install pymodbus
```

## Usage

### Option 1: Python Test Script (Recommended)

Simple standalone Python script that tests Modbus reading:

```bash
cd backend/scripts
python test_modbus.py <IP_ADDRESS> <SLAVE_ID> [PORT]
```

**Example:**
```bash
python test_modbus.py 192.168.1.100 1
python test_modbus.py 192.168.1.100 1 502
```

**What it tests:**
- TCP connection to the device
- Modbus client connection
- Reading sample registers:
  - Nominal Voltage (address 2017)
  - Nominal Current (address 2019)
  - Number of Phases (address 2013)
  - Current A (address 2999)
  - Voltage A-N (address 3027)
  - Active Power Total (address 3059)
  - Frequency (address 3109)
  - Meter Name (address 29, UTF8)
  - Meter Model (address 49, UTF8)

**Output:**
- Shows connection status
- Lists each register read attempt with success/failure
- Displays read values
- Provides summary of successful vs failed reads

### Option 2: TypeScript Test Script

Uses the same logic as the application's dataCollector service:

```bash
cd backend
npx ts-node scripts/test-modbus-registers.ts <IP_ADDRESS> <SLAVE_ID>
```

**Example:**
```bash
npx ts-node scripts/test-modbus-registers.ts 192.168.1.100 1
```

## Troubleshooting

### "Failed to connect to Modbus device"
- Check if device IP address is correct
- Verify device is powered on and connected to network
- Check if port 502 is accessible (firewall rules)
- Try pinging the device: `ping <IP_ADDRESS>`

### "No registers could be read"
- Verify Slave ID (Unit ID) is correct (usually 1)
- Check if register addresses match your device model
- Some devices may use different address ranges
- Verify device supports Modbus TCP (not just RTU)

### "TCP connection failed"
- Check network connectivity
- Verify device is on the same network
- Check firewall settings
- Try telnet: `telnet <IP_ADDRESS> 502`

### "ModuleNotFoundError: No module named 'pymodbus'"
```bash
pip install pymodbus
# or
pip3 install pymodbus
```

## Getting Device Information

To find your device's IP address and Slave ID:
1. Check device configuration/display
2. Check router DHCP client list
3. Use network scanner tools
4. Check device documentation

## Next Steps

If the test script successfully reads registers:
- The application should be able to read from the device
- Check backend logs for any errors during data collection
- Verify device is added to the database with correct IP and Slave ID

If the test script fails:
- Fix the connection/configuration issues first
- Then retry the application's data collection

