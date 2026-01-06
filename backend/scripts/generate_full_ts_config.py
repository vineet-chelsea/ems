"""
Generate full TypeScript config for PM5320 with all 298 parameters
"""
import json
import os

json_file = 'pm5320_mappings_converted.json'
with open(json_file, 'r') as f:
    mappings = json.load(f)

# Generate TypeScript array
ts_lines = []
for mapping in mappings:
    param = mapping['parameter'].replace("'", "\\'").replace('\n', ' ')
    desc = mapping['description'].replace("'", "\\'").replace('\n', ' ') if mapping['description'] else ''
    ts_lines.append(f"          {{ parameter: '{param}', address: {mapping['address']}, dataType: '{mapping['dataType']}', description: '{desc}' }},")

# Write to file
output_file = 'pm5320_register_mappings_ts.txt'
with open(output_file, 'w', encoding='utf-8') as f:
    f.write('\n'.join(ts_lines))

print(f"Generated {len(ts_lines)} mappings to {output_file}")
print(f"First 5 lines:")
for line in ts_lines[:5]:
    print(f"  {line}")

