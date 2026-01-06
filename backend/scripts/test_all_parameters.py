#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test script to identify problematic parameters
Tests all PM5320 parameters and reports which ones cause issues
"""
import sys
import json
import struct
from pymodbus.client import ModbusTcpClient
from datetime import datetime
import io

# Set UTF-8 encoding for Windows console
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Read mappings from the final mappings file
def load_mappings():
    """Load register mappings from the final mappings file"""
    mappings = []
    try:
        with open('pm5320_register_mappings_final.txt', 'r') as f:
            content = f.read()
            # Parse the TypeScript array format
            import re
            # Extract individual mapping entries
            pattern = r"\{\s*parameter:\s*'([^']+)',\s*address:\s*(\d+),\s*dataType:\s*'([^']+)',\s*description:\s*'([^']*)'\s*\}"
            matches = re.findall(pattern, content)
            for match in matches:
                mappings.append({
                    'parameter': match[0],
                    'address': int(match[1]),
                    'dataType': match[2],
                    'description': match[3]
                })
    except Exception as e:
        print(f"Error loading mappings: {e}", file=sys.stderr)
        sys.exit(1)
    return mappings

def read_regs(client, address, count, device_id=255):
    """Read holding registers from Modbus device"""
    try:
        r = client.read_holding_registers(
            address=address,
            count=count,
            device_id=device_id
        )
        if r.isError():
            return None
        if not hasattr(r, 'registers') or r.registers is None:
            return None
        return r.registers
    except Exception as e:
        return None

def decode_float32(regs):
    """IEEE 754 Float32 (2 registers, Big-Endian)"""
    import math
    if not regs or len(regs) < 2:
        return None
    try:
        raw = struct.pack(">HH", regs[0], regs[1])
        value = struct.unpack(">f", raw)[0]
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    except Exception:
        return None

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
    import math
    if not regs or len(regs) < 2:
        return None
    try:
        raw = struct.pack(">HH", regs[0], regs[1])
        value = struct.unpack(">f", raw)[0]
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    except Exception:
        return None

def decode_utf8(regs):
    """UTF8 string from registers"""
    if not regs:
        return None
    bytes_data = b''
    for reg in regs:
        bytes_data += struct.pack('>H', reg)
    string_value = bytes_data.split(bytes([0]))[0].decode('utf-8', errors='ignore').strip()
    return string_value if string_value else None

def decode_iec870_datetime(words):
    """Decode IEC 870-5-4 (CP56Time2a) 4-word timestamp"""
    from datetime import datetime
    if not words or len(words) < 4:
        return None
    try:
        w1, w2, w3, w4 = words[0], words[1], words[2], words[3]
        year = (w1 & 0x7F) + 2000
        day = w2 & 0x1F
        month = (w2 >> 8) & 0x0F
        minute = w3 & 0x3F
        hour = (w3 >> 8) & 0x1F
        millisecond = w4 & 0xFFFF
        dt = datetime(year, month, day, hour, minute, millisecond // 1000, (millisecond % 1000) * 1000)
        return dt.isoformat()
    except ValueError:
        return None

def read_register(client, address, data_type, device_id=255):
    """Read a single register value"""
    if data_type == 'FLOAT32':
        regs = read_regs(client, address, 2, device_id)
        return decode_float32(regs) if regs else None
    elif data_type == 'INT32U':
        regs = read_regs(client, address, 2, device_id)
        return decode_int32u(regs) if regs else None
    elif data_type == '4Q_FP_PF':
        regs = read_regs(client, address, 2, device_id)
        return decode_4q_fp_pf(regs) if regs else None
    elif data_type == 'INT16U':
        regs = read_regs(client, address, 1, device_id)
        if regs and len(regs) > 0:
            return decode_int16u(regs[0])
        return None
    elif data_type == 'UTF8':
        regs = read_regs(client, address, 20, device_id)
        return decode_utf8(regs) if regs else None
    elif data_type == 'DATETIME' or data_type == 'IEC870_DATETIME':
        regs = read_regs(client, address, 4, device_id)
        return decode_iec870_datetime(regs) if regs else None
    else:
        return None

def main():
    if len(sys.argv) < 2:
        print("Usage: python test_all_parameters.py <ip_address>")
        sys.exit(1)
    
    ip_address = sys.argv[1]
    device_id = 255
    
    print(f"Testing all parameters on {ip_address} (device_id: {device_id})")
    print("=" * 80)
    
    # Load mappings
    mappings = load_mappings()
    print(f"Loaded {len(mappings)} parameter mappings\n")
    
    # Connect to device
    client = ModbusTcpClient(host=ip_address, port=502)
    if not client.connect():
        print(f"ERROR: Failed to connect to {ip_address}:502")
        sys.exit(1)
    
    print("Connected successfully!\n")
    
    # Test all parameters
    results = {
        'successful': [],
        'failed': [],
        'nan_infinity': [],
        'not_available': [],
        'exceptions': []
    }
    
    for i, mapping in enumerate(mappings, 1):
        param = mapping['parameter']
        address = mapping['address']
        data_type = mapping['dataType']
        
        print(f"[{i}/{len(mappings)}] Testing: {param} (addr: {address}, type: {data_type})", end=' ... ')
        
        try:
            value = read_register(client, address, data_type, device_id)
            
            if value is not None:
                # Check for NaN/Infinity
                if isinstance(value, float):
                    import math
                    if math.isnan(value) or math.isinf(value):
                        results['nan_infinity'].append({
                            'parameter': param,
                            'address': address,
                            'dataType': data_type,
                            'value': str(value)
                        })
                        print("NaN/Infinity")
                        continue
                
                results['successful'].append({
                    'parameter': param,
                    'address': address,
                    'dataType': data_type,
                    'value': value
                })
                print(f"OK: {value}")
            else:
                results['not_available'].append({
                    'parameter': param,
                    'address': address,
                    'dataType': data_type
                })
                print("NOT AVAILABLE")
                
        except Exception as e:
            results['exceptions'].append({
                'parameter': param,
                'address': address,
                'dataType': data_type,
                'error': str(e)
            })
            print(f"EXCEPTION: {e}")
    
    client.close()
    
    # Print summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total parameters tested: {len(mappings)}")
    print(f"OK - Successful: {len(results['successful'])}")
    print(f"WARN - Not available: {len(results['not_available'])}")
    print(f"ERROR - NaN/Infinity: {len(results['nan_infinity'])}")
    print(f"ERROR - Exceptions: {len(results['exceptions'])}")
    
    # Print problematic parameters
    if results['nan_infinity']:
        print("\n" + "=" * 80)
        print("PARAMETERS WITH NaN/Infinity VALUES:")
        print("=" * 80)
        for item in results['nan_infinity']:
            print(f"  - {item['parameter']} (addr: {item['address']}, type: {item['dataType']})")
    
    if results['exceptions']:
        print("\n" + "=" * 80)
        print("PARAMETERS WITH EXCEPTIONS:")
        print("=" * 80)
        for item in results['exceptions']:
            print(f"  - {item['parameter']} (addr: {item['address']}, type: {item['dataType']})")
            print(f"    Error: {item['error']}")
    
    if results['not_available']:
        print("\n" + "=" * 80)
        print(f"PARAMETERS NOT AVAILABLE ({len(results['not_available'])} total):")
        print("=" * 80)
        # Show first 20
        for item in results['not_available'][:20]:
            print(f"  - {item['parameter']} (addr: {item['address']}, type: {item['dataType']})")
        if len(results['not_available']) > 20:
            print(f"  ... and {len(results['not_available']) - 20} more")
    
    # Save detailed results to JSON
    output_file = f"test_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nDetailed results saved to: {output_file}")

if __name__ == '__main__':
    main()

