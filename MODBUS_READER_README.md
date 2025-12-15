# Modbus TCP Register Reader

A Python library for reading Modbus TCP holding registers with support for multiple data types, designed for use in Jupyter notebooks.

## Features

- ✅ Read INT16 (16-bit integers, signed/unsigned)
- ✅ Read INT32 (32-bit integers)
- ✅ Read FLOAT32 (32-bit floating point)
- ✅ Read FLOAT64 (64-bit floating point/double)
- ✅ Read BITMAP (bit fields)
- ✅ Batch reading with register maps
- ✅ Returns pandas DataFrames for easy analysis
- ✅ Support for big-endian and little-endian byte order
- ✅ Error handling and connection management

## Installation

```bash
pip install pymodbus pandas
```

Or install from requirements file:
```bash
pip install -r requirements_modbus.txt
```

## Quick Start

### Basic Usage

```python
from modbus_reader import ModbusReader

# Create reader instance
reader = ModbusReader(
    ip_address="192.168.0.5",
    port=502,
    slave_id=255
)

# Connect
reader.connect()

# Read INT16 at address 0
value = reader.read_int16(0)
print(f"Value: {value}")

# Read FLOAT32 at address 10
voltage = reader.read_float32(10)
print(f"Voltage: {voltage}V")

# Disconnect
reader.disconnect()
```

### Reading Different Data Types

```python
# INT16 (16-bit integer)
int16_value = reader.read_int16(address=0, count=1, signed=True)

# INT32 (32-bit integer) - uses 2 registers
int32_value = reader.read_int32(address=10, count=1, byte_order="big")

# FLOAT32 (32-bit float) - uses 2 registers
float32_value = reader.read_float32(address=20, count=1, byte_order="big")

# FLOAT64 (64-bit float) - uses 4 registers
float64_value = reader.read_float64(address=30, count=1, byte_order="big")

# BITMAP (16 bits from 1 register)
bits = reader.read_bitmap(address=40, count=1)
```

### Using Register Map

```python
# Define register map
register_map = [
    {
        'name': 'Voltage_R',
        'address': 0,
        'data_type': 'FLOAT32',
        'count': 1,
        'unit': 'V',
        'description': 'Phase R Voltage',
        'options': {'byte_order': 'big'}
    },
    {
        'name': 'Current_R',
        'address': 10,
        'data_type': 'FLOAT32',
        'count': 1,
        'unit': 'A',
        'description': 'Phase R Current',
        'options': {'byte_order': 'big'}
    },
    {
        'name': 'Status',
        'address': 20,
        'data_type': 'INT16',
        'count': 1,
        'unit': '',
        'description': 'Device Status',
        'options': {'signed': True}
    }
]

# Read all registers and get DataFrame
df = reader.read_multiple(register_map)
print(df)
```

## Data Type Details

### INT16
- **Registers:** 1 register per value
- **Range:** -32,768 to 32,767 (signed) or 0 to 65,535 (unsigned)
- **Example:** `reader.read_int16(0, count=1, signed=True)`

### INT32
- **Registers:** 2 registers per value
- **Range:** -2,147,483,648 to 2,147,483,647
- **Byte Order:** "big" (high word first, Modbus standard) or "little" (low word first)
- **Example:** `reader.read_int32(10, count=1, byte_order="big")`

### FLOAT32
- **Registers:** 2 registers per value
- **Range:** IEEE 754 single precision float
- **Byte Order:** "big" or "little"
- **Example:** `reader.read_float32(20, count=1, byte_order="big")`

### FLOAT64
- **Registers:** 4 registers per value
- **Range:** IEEE 754 double precision float
- **Byte Order:** "big" or "little"
- **Example:** `reader.read_float64(30, count=1, byte_order="big")`

### BITMAP
- **Registers:** 1 register per value (16 bits)
- **Returns:** List of 16 boolean values (bits 0-15)
- **Example:** `reader.read_bitmap(40, count=1)`

## Register Address Calculation

When reading multi-register data types, be aware of register usage:

- **INT16:** Address N uses register N
- **INT32:** Address N uses registers N and N+1
- **FLOAT32:** Address N uses registers N and N+1
- **FLOAT64:** Address N uses registers N, N+1, N+2, and N+3

**Example:**
- If you read INT32 at address 10, it uses registers 10 and 11
- Next INT32 should start at address 12 (not 11)

## Byte Order

Modbus typically uses **big-endian** (high word first), but some devices use **little-endian**:

- **Big-endian (default):** High register first
  - Register 10 (high) + Register 11 (low) = Value
- **Little-endian:** Low register first
  - Register 10 (low) + Register 11 (high) = Value

## Error Handling

The library handles errors gracefully:
- Connection failures return `False` from `connect()`
- Read failures return `None`
- Error messages are printed to console

## Jupyter Notebook

See `modbus_reader_examples.ipynb` for complete examples including:
- Basic reading
- Multiple data types
- Register maps
- Continuous polling
- Data logging

## API Reference

### ModbusReader Class

#### `__init__(ip_address, port=502, slave_id=255)`
Initialize Modbus reader.

#### `connect() -> bool`
Connect to Modbus device. Returns `True` if successful.

#### `disconnect()`
Close connection to Modbus device.

#### `read_int16(address, count=1, signed=True) -> int | List[int]`
Read INT16 values.

#### `read_int32(address, count=1, byte_order="big") -> int | List[int]`
Read INT32 values.

#### `read_float32(address, count=1, byte_order="big") -> float | List[float]`
Read FLOAT32 values.

#### `read_float64(address, count=1, byte_order="big") -> float | List[float]`
Read FLOAT64 values.

#### `read_bitmap(address, count=1) -> List[bool] | List[List[bool]]`
Read bitmap values.

#### `read_custom(address, data_type, count=1, **kwargs) -> any`
Read with specified data type string.

#### `read_multiple(register_map) -> pd.DataFrame`
Read multiple registers and return as DataFrame.

## Troubleshooting

### Connection Issues
- Verify IP address and port (default: 502)
- Check firewall settings
- Ensure Modbus device is accessible on network
- Verify slave ID is correct

### Wrong Values
- Check byte order (try "little" if values seem incorrect)
- Verify register addresses match device documentation
- Check if device uses 0-based or 1-based addressing

### Timeout Errors
- Increase timeout in pymodbus client (modify code if needed)
- Check network latency
- Verify device is responding

## License

Free to use for your Energy Monitoring System project.


