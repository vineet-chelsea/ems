import json

# Read the PM5320 mappings
with open('backend/src/config/pm5320_mappings.json', 'r', encoding='utf-8') as f:
    mappings = json.load(f)

print("=" * 80)
print("PM5320 MAPPINGS ANALYSIS - Identifying Skipped Parameters")
print("=" * 80)
print(f"\nTotal parameters in mappings: {len(mappings)}")
print(f"Expected collected: 286")
print(f"Potentially skipped: {len(mappings) - 286} = 12")
print("\n" + "=" * 80)

# Most likely candidates based on common issues
print("\n" + "=" * 80)
print("MOST LIKELY CANDIDATES FOR SKIPPED PARAMETERS:")
print("=" * 80)

likely_skipped = []

# 1. DateTime parameters with FLOAT32 type (should be DATETIME)
datetime_float32 = [m for m in mappings if 'DateTime' in m.get('parameter', '') and m.get('dataType') == 'FLOAT32']
if datetime_float32:
    print(f"\n1. DateTime parameters with FLOAT32 type (should be DATETIME) - {len(datetime_float32)}:")
    for p in datetime_float32:
        print(f"   - {p['parameter']} (addr: {p['address']})")
        likely_skipped.append(p)

# 2. Accumulated Energy Reset Date/Time with INT32U (should be DATETIME)
accumulated_datetime = [m for m in mappings if 'Accumulated Energy Reset' in m.get('parameter', '')]
if accumulated_datetime:
    print(f"\n2. Accumulated Energy Reset Date/Time - {len(accumulated_datetime)}:")
    for p in accumulated_datetime:
        print(f"   - {p['parameter']} (addr: {p['address']}, type: {p['dataType']})")
        likely_skipped.append(p)

# 3. UTF8 parameters (might fail if device doesn't return proper strings)
utf8_params = [m for m in mappings if m.get('dataType') == 'UTF8']
print(f"\n3. UTF8 string parameters ({len(utf8_params)}) - might fail if empty/null:")
for p in utf8_params:
    print(f"   - {p['parameter']} (addr: {p['address']})")
    # UTF8 parameters are less likely to be skipped unless they return empty strings
    # But they could be if the device doesn't have these values configured

# 4. Parameters with very high addresses that might be out of device range
# PM5320 typically supports up to ~28000, but some very high addresses might fail
very_high_address = [m for m in mappings if m.get('address', 0) > 25000]
print(f"\n4. Parameters with addresses > 25000 ({len(very_high_address)}) - might be out of range:")
for p in sorted(very_high_address, key=lambda x: x.get('address', 0)):
    print(f"   - {p['parameter']} (addr: {p['address']}, type: {p['dataType']})")
    if len(very_high_address) <= 12:
        likely_skipped.append(p)

# 5. Check for parameters that might have overlapping addresses causing conflicts
# FLOAT32 needs 2 registers, INT32U needs 2, so check for overlaps
address_ranges = []
for m in mappings:
    addr = m.get('address', 0)
    dt = m.get('dataType', '')
    if dt in ['FLOAT32', 'INT32U', '4Q_FP_PF', 'INT64U', 'INT64S']:
        length = 2
    elif dt in ['INT64U', 'INT64S']:
        length = 4
    elif dt == 'UTF8':
        length = 20  # UTF8 reads up to 20 registers
    else:
        length = 1
    address_ranges.append({
        'parameter': m.get('parameter'),
        'address': addr,
        'end': addr + length - 1,
        'dataType': dt
    })

# Find overlapping addresses
overlaps = []
for i, r1 in enumerate(address_ranges):
    for j, r2 in enumerate(address_ranges[i+1:], i+1):
        if r1['address'] <= r2['end'] and r2['address'] <= r1['end']:
            overlaps.append((r1, r2))

if overlaps:
    print(f"\n5. Parameters with overlapping address ranges ({len(overlaps)} overlaps):")
    seen_params = set()
    for r1, r2 in overlaps[:10]:
        if r1['parameter'] not in seen_params:
            print(f"   - {r1['parameter']} (addr: {r1['address']}, type: {r1['dataType']}) overlaps with {r2['parameter']} (addr: {r2['address']})")
            seen_params.add(r1['parameter'])
            if r1['parameter'] not in [p['parameter'] for p in likely_skipped]:
                likely_skipped.append({'parameter': r1['parameter'], 'address': r1['address'], 'dataType': r1['dataType']})

# 6. Parameters that might return invalid values (check for known problematic patterns)
print(f"\n6. Additional analysis:")

# Check if there are parameters that might be computed or derived (not directly readable)
computed_like = [m for m in mappings if any(word in m.get('parameter', '').lower() for word in ['total', 'avg', 'worst', 'sum'])]
print(f"   - Parameters with 'Total', 'Avg', 'Worst', 'Sum' in name: {len(computed_like)}")
print(f"     (These are usually computed, but PM5320 might provide them directly)")

# Summary
print("\n" + "=" * 80)
print("SUMMARY OF LIKELY SKIPPED PARAMETERS:")
print("=" * 80)

# Remove duplicates
unique_skipped = []
seen = set()
for p in likely_skipped:
    key = p.get('parameter') if isinstance(p, dict) else p['parameter']
    if key not in seen:
        seen.add(key)
        unique_skipped.append(p)

print(f"\nTotal unique candidates identified: {len(unique_skipped)}")
print("\nDetailed list:")
for i, p in enumerate(unique_skipped, 1):
    if isinstance(p, dict):
        print(f"{i:2d}. {p['parameter']}")
        print(f"    Address: {p['address']}, Data Type: {p['dataType']}")
    else:
        print(f"{i:2d}. {p['parameter']}")
        print(f"    Address: {p['address']}, Data Type: {p['dataType']}")

if len(unique_skipped) < 12:
    print(f"\nNote: Only {len(unique_skipped)} candidates identified. The remaining {12 - len(unique_skipped)} might be:")
    print("  - Parameters that return NaN/Infinity values")
    print("  - Parameters that throw exceptions during reading")
    print("  - Parameters that fail validity checks")
    print("  - Check backend logs for exact list of skipped parameters")

print("\n" + "=" * 80)
print("RECOMMENDATIONS:")
print("=" * 80)
print("1. Check backend logs for 'Skipped X parameter(s)' messages - this will show the exact 12")
print("2. Fix DateTime parameters: Change dataType from FLOAT32/INT32U to DATETIME")
print("3. Verify UTF8 parameters are returning valid strings")
print("4. Check if very high address parameters (>25000) are within device range")
print("5. Verify no address range conflicts exist")
