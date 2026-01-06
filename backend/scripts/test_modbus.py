#!/usr/bin/env python3
"""
Standalone test script to verify Modbus register reading
Tests connection and reads sample registers from a device
"""
import sys
import json
import struct
from pymodbus.client import ModbusTcpClient

def read_regs(client, address, count, device_id=255):
    """Read holding registers from Modbus device
    address: register address from Excel (used as-is for pymodbus 3.x)
    """
    try:
        # pymodbus 3.x uses address as-is (1-based addressing)
        print(f"      Reading address {address}, count: {count}")
        r = client.read_holding_registers(
            address=address,
            count=count,
            device_id=device_id
        )
        if r.isError():
            print(f"      ERROR: Modbus read failed: {r}")
            return None
        if not hasattr(r, 'registers') or r.registers is None:
            print(f"      ERROR: No registers returned")
            return None
        print(f"      Raw registers: {r.registers}")
        return r.registers
    except Exception as e:
        print(f"      EXCEPTION: {e}")
        return None

def decode_float32(regs):
    """IEEE 754 Float32 (2 registers, Big-Endian)"""
    if not regs or len(regs) < 2:
        return None
    raw = struct.pack(">HH", regs[0], regs[1])
    return struct.unpack(">f", raw)[0]

def decode_int32u(regs):
    """Unsigned 32-bit integer (2 registers, Big-Endian)"""
    if not regs or len(regs) < 2:
        return None
    return (regs[0] << 16) | regs[1]

def decode_int16u(reg):
    """Unsigned 16-bit integer (1 register)"""
    if reg is None:
        return None
    return reg

def decode_4q_fp_pf(regs):
    """4Q_FP_PF: Read as FLOAT32 (2 registers, Big-Endian)"""
    if not regs or len(regs) < 2:
        return None
    raw = struct.pack(">HH", regs[0], regs[1])
    return struct.unpack(">f", raw)[0]

def decode_utf8(regs):
    """UTF8 string from registers"""
    if not regs:
        return None
    # Convert registers to bytes
    bytes_data = b''
    for reg in regs:
        bytes_data += struct.pack('>H', reg)
    # Remove null bytes and decode
    string_value = bytes_data.split(b'\x00')[0].decode('utf-8', errors='ignore').strip()
    return string_value if string_value else None

def read_register(client, address, data_type, device_id=255):
    """Read a single register value"""
    try:
        # Use address directly as register index
        # Addresses from Excel column C are used as-is (e.g., 2017)
        print(f"  Reading address {address} as {data_type}...")
        
        if data_type == 'FLOAT32':
            regs = read_regs(client, address, 2, device_id)
            if regs is None:
                print(f"    ERROR: Failed to read registers")
                return None
            if len(regs) < 2:
                print(f"    ERROR: Expected 2 registers, got {len(regs)}")
                return None
            print(f"      Raw registers: {regs}")
            value = decode_float32(regs)
            if value is not None:
                print(f"    SUCCESS: {value}")
            else:
                print(f"    ERROR: Failed to decode float32")
            return value
        elif data_type == 'INT32U':
            regs = read_regs(client, address, 2, device_id)
            value = decode_int32u(regs) if regs else None
            if value is not None:
                print(f"    SUCCESS: {value}")
            else:
                print(f"    ERROR: Failed to read/decode")
            return value
        elif data_type == '4Q_FP_PF':
            regs = read_regs(client, address, 1, device_id)
            if regs and len(regs) > 0:
                value = decode_4q_fp_pf(regs[0])
                if value is not None:
                    print(f"    SUCCESS: {value}")
                else:
                    print(f"    ERROR: Failed to decode")
                return value
            print(f"    ERROR: Failed to read registers")
            return None
        elif data_type == 'INT16U':
            regs = read_regs(client, address, 1, device_id)
            if regs and len(regs) > 0:
                value = decode_int16u(regs[0])
                if value is not None:
                    print(f"    SUCCESS: {value}")
                else:
                    print(f"    ERROR: Failed to decode")
                return value
            print(f"    ERROR: Failed to read registers")
            return None
        elif data_type == 'UTF8':
            # UTF8 strings - read 20 registers (40 bytes) for string data
            regs = read_regs(client, address, 20, device_id)
            if regs is None:
                print(f"    ERROR: Failed to read registers")
                return None
            value = decode_utf8(regs)
            if value is not None:
                print(f"    SUCCESS: '{value}'")
            else:
                print(f"    ERROR: Failed to decode UTF8")
            return value
        else:
            print(f"    ERROR: Unknown data type {data_type}")
            return None
    except Exception as e:
        print(f"    EXCEPTION: {e}")
        return None

def test_modbus_connection(ip_address, port=502):
    """Test basic TCP connection to Modbus device"""
    print(f"\n[1] Testing TCP connection to {ip_address}:{port}...")
    try:
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(3)
        result = sock.connect_ex((ip_address, port))
        sock.close()
        if result == 0:
            print(f"    ✓ TCP connection successful")
            return True
        else:
            print(f"    ✗ TCP connection failed (error code: {result})")
            return False
    except Exception as e:
        print(f"    ✗ TCP connection error: {e}")
        return False

def main():
    if len(sys.argv) < 3:
        print("Usage: python test_modbus.py <IP_ADDRESS> <SLAVE_ID> [PORT]")
        print("Example: python test_modbus.py 192.168.1.100 1")
        sys.exit(1)
    
    ip_address = sys.argv[1]
    device_id = int(sys.argv[2])
    port = int(sys.argv[3]) if len(sys.argv) > 3 else 502
    
    print("=" * 60)
    print("Modbus Register Reading Test")
    print("=" * 60)
    print(f"Device IP: {ip_address}")
    print(f"Port: {port}")
    print(f"Device ID: {device_id}")
    
    # Test TCP connection first
    if not test_modbus_connection(ip_address, port):
        print("\n✗ Cannot proceed - TCP connection failed")
        sys.exit(1)
    
    # Test Modbus connection
    print(f"\n[2] Connecting to Modbus device...")
    client = ModbusTcpClient(host=ip_address, port=port)
    if not client.connect():
        print(f"    ✗ Failed to connect to Modbus device")
        sys.exit(1)
    print(f"    ✓ Modbus client connected")
    client.connect()

    regs = client.read_holding_registers(
        address=2020,   # manual - 1
        count=1,
        device_id=255
        ).registers

    device_name = decode_utf8(regs)
    print("Device name:", device_name)

    client.close()
    def read_float32(client, address):
        regs = read_regs(client, address, 2)
        return decode_float32(regs) if regs else None
 
    print(read_float32(client, 2018))
    
    # Test reading sample registers (PM5320 common registers)
    print(f"\n[3] Testing register reads...")
    test_registers = [
        # Some common PM5320 registers from the Excel file
        # Note: addresses are from Excel, will be converted to 0-based (address - 1) in read_regs
        {'parameter': 'Device Name (test)', 'address': 29, 'dataType': 'UTF8'},  # Test with your working address
        {'parameter': 'Nominal Voltage', 'address': 2017, 'dataType': 'FLOAT32'},
        {'parameter': 'Nominal Current', 'address': 2019, 'dataType': 'FLOAT32'},
        {'parameter': 'Number of Phases', 'address': 2013, 'dataType': 'INT16U'},
        {'parameter': 'Number of Wires', 'address': 2014, 'dataType': 'INT16U'},
        {'parameter': 'Current A', 'address': 2999, 'dataType': 'FLOAT32'},
        {'parameter': 'Voltage A-N', 'address': 3027, 'dataType': 'FLOAT32'},
        {'parameter': 'Active Power Total', 'address': 3059, 'dataType': 'FLOAT32'},
        {'parameter': 'Frequency', 'address': 3109, 'dataType': 'FLOAT32'},
        {'parameter': 'Meter Name', 'address': 29, 'dataType': 'UTF8'},
        {'parameter': 'Meter Model', 'address': 49, 'dataType': 'UTF8'},
    ]
    
    results = {}
    success_count = 0
    fail_count = 0
    
    for reg in test_registers:
        print(f"\n  Testing: {reg['parameter']}")
        value = read_register(client, reg['address'], reg['dataType'], device_id)
        if value is not None:
            results[reg['parameter']] = value
            success_count += 1
        else:
            fail_count += 1
    
    client.close()
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    print(f"Successful reads: {success_count}/{len(test_registers)}")
    print(f"Failed reads: {fail_count}/{len(test_registers)}")
    
    if results:
        print("\nSuccessfully read values:")
        for param, value in results.items():
            print(f"  {param}: {value}")
    
    print("\n" + "=" * 60)
    
    if success_count > 0:
        print("✓ Modbus reading is working!")
        sys.exit(0)
    else:
        print("✗ No registers could be read. Check:")
        print("  - Device IP address and port")
        print("  - Slave ID (unit ID)")
        print("  - Network connectivity")
        print("  - Register addresses (device-specific)")
        sys.exit(1)

if __name__ == '__main__':
    main()

