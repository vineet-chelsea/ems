import json
import struct

def encode_float32(value):
    """Encode a float32 value into two 16-bit registers (big-endian)"""
    packed = struct.pack('>f', value)
    reg1 = struct.unpack('>H', packed[0:2])[0]
    reg2 = struct.unpack('>H', packed[2:4])[0]
    return [reg1, reg2]

def encode_int32u(value):
    """Encode a 32-bit unsigned integer into two 16-bit registers"""
    reg1 = (value >> 16) & 0xFFFF
    reg2 = value & 0xFFFF
    return [reg1, reg2]

def encode_utf8(value, max_registers=20):
    """Encode UTF-8 string into 16-bit registers (2 bytes per register)
    Strings are null-terminated (decoder splits on null bytes)"""
    encoded = value.encode('utf-8')
    # Add null terminator
    encoded += b'\x00'
    # Pad to even length (2 bytes per register)
    if len(encoded) % 2:
        encoded += b'\x00'
    registers = []
    for i in range(0, min(len(encoded), max_registers * 2), 2):
        if i + 1 < len(encoded):
            reg = (encoded[i] << 8) | encoded[i + 1]
        else:
            reg = encoded[i] << 8
        registers.append(reg)
    return registers

def get_sample_value(parameter, data_type):
    """Get appropriate sample value based on parameter name and data type"""
    param_lower = parameter.lower()
    
    if data_type == "FLOAT32":
        if "frequency" in param_lower:
            return encode_float32(50.0)
        elif "voltage" in param_lower:
            if "nominal" in param_lower:
                return encode_float32(230.0)
            else:
                return encode_float32(220.5)
        elif "current" in param_lower:
            return encode_float32(10.5)
        elif "power" in param_lower:
            if "active" in param_lower:
                return encode_float32(2500.0)
            elif "reactive" in param_lower:
                return encode_float32(1500.0)
            elif "apparent" in param_lower:
                return encode_float32(3000.0)
        elif "energy" in param_lower:
            return encode_float32(10000.0)
        elif "demand" in param_lower:
            return encode_float32(500.0)
        elif "thd" in param_lower or "distortion" in param_lower:
            return encode_float32(2.5)
        elif "unbalance" in param_lower:
            return encode_float32(1.2)
        elif "power factor" in param_lower or "pf" in param_lower:
            return encode_float32(0.95)
        else:
            return encode_float32(100.0)
    
    elif data_type == "INT32U":
        if "energy" in param_lower:
            return encode_int32u(1000000)
        else:
            return encode_int32u(50000)
    
    elif data_type == "INT16U":
        if "phases" in param_lower:
            return [3]
        elif "wires" in param_lower:
            return [4]
        elif "frequency" in param_lower:
            return [50]
        elif "configuration" in param_lower:
            return [1]
        elif "rotation" in param_lower:
            return [1]
        else:
            return [100]
    
    elif data_type == "4Q_FP_PF":
        return encode_float32(0.95)
    
    elif data_type == "UTF8":
        if "name" in param_lower:
            return encode_utf8("PM5320 Meter")
        elif "model" in param_lower:
            return encode_utf8("PM5320")
        elif "manufacturer" in param_lower:
            return encode_utf8("Schneider Electric")
        else:
            return encode_utf8("Sample")
    
    elif data_type == "DATETIME":
        return encode_int32u(1704067200)
    
    return [0]

# Read the JSON file
with open('backend/src/config/pm5320_mappings.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Open output file for writing
output_file = 'pm5320_sample_values.txt'
with open(output_file, 'w', encoding='utf-8') as f:
    # Process and write each entry - only hr_block line
    for entry in data:
        parameter = entry.get('parameter', '')
        data_type = entry.get('dataType', '')
        address = entry.get('address', 0)
        
        # Get sample values
        sample_registers = get_sample_value(parameter, data_type)
        
        # Calculate the register address
        # For UTF8 strings, use the actual address (they read multiple registers starting from base)
        # For other types, increment by 1 from base
        if data_type == "UTF8":
            sample_address = address
        else:
            sample_address = address + 1
        
        # Write only the hr_block line
        f.write(f"hr_block.setValues({sample_address}, {sample_registers})\n")

print(f"Successfully generated sample values in {output_file}")
print(f"Total entries: {len(data)}")
