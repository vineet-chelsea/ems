"""
Generate TypeScript config from PM5320 mappings JSON
Converts register offsets to Modbus addresses (40001+)
"""
import json
import os

# Read the JSON file
json_file = 'pm5320_mappings.json'
if not os.path.exists(json_file):
    print(f"Error: {json_file} not found")
    exit(1)

with open(json_file, 'r') as f:
    mappings = json.load(f)

# Use addresses as-is from Excel (no conversion)
# The Excel file contains actual Modbus addresses

# Generate TypeScript format
print("// PM5320 Register Mappings (from PM5320_modbus_used.xlsx)")
print("registerMappings: [")
for mapping in mappings:
    param = mapping['parameter'].replace("'", "\\'")
    desc = mapping['description'].replace("'", "\\'") if mapping['description'] else ''
    print(f"  {{ parameter: '{param}', address: {mapping['address']}, dataType: '{mapping['dataType']}', description: '{desc}' }},")
print("]")

# Also save as JSON with converted addresses
output_file = 'pm5320_mappings_converted.json'
with open(output_file, 'w') as f:
    json.dump(mappings, f, indent=2)
print(f"\nConverted mappings saved to {output_file}")

