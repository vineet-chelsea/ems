"""
Generate exact replacement code for registerMappings with addresses as-is
"""
import json

# Read the mappings
with open('pm5320_mappings.json', 'r') as f:
    mappings = json.load(f)

# Generate TypeScript code
ts_lines = []
for mapping in mappings:
    param = mapping['parameter'].replace("'", "\\'")
    desc = mapping['description'].replace("'", "\\'") if mapping['description'] else ''
    ts_lines.append(f"          {{ parameter: '{param}', address: {mapping['address']}, dataType: '{mapping['dataType']}', description: '{desc}' }},")

# Write to file
with open('pm5320_register_mappings_final.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(ts_lines))

print(f"Generated {len(ts_lines)} mappings")
print(f"First 3: {ts_lines[:3]}")
print(f"Last 3: {ts_lines[-3:]}")

