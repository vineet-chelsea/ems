# Parameter/Register Mapping Excel Upload Guide

## Overview

The Energy Monitoring System allows you to upload an Excel file to configure parameter-to-register mappings for each device. This is done **per device** during the device addition process.

## How It Works

1. **Configure Device Details** - Enter device name, type, IP address, and subnet mask in the Add Device dialog
2. **Upload Parameter Mappings (Optional)** - Upload an Excel file that maps parameters to register addresses
3. **Device Created** - Device is created with the parameter mappings stored

## Excel Template Format

The Excel template has **two columns**:

| Parameter | Address |
|-----------|---------|
| V1 | Register 40001 |
| V2 | Register 40002 |
| Ptotal | Register 40007 |
| PFavg | Register 40008 |

### Column Descriptions

- **Parameter** (Column A): The parameter name (e.g., V1, V2, Ptotal, PFavg, etc.)
- **Address** (Column B): The corresponding register address (e.g., "Register 40001", "40001", "0x9C41", etc.)

## Step-by-Step Instructions

### Step 1: Download Template

1. Open the "Add Device" dialog
2. Select your device type from the dropdown
3. Click "Download Template" button in the Parameter/Register Mapping section
4. The template will download as `parameter_mapping_template_<type>_<date>.xlsx`

### Step 2: Fill in Device Information

In the Add Device dialog:
- **Device Type**: Select from dropdown (PM5320, PM5330, PM5350, Custom)
- **Device Name**: Enter a descriptive name
- **IP Address**: Enter the device IP address (e.g., 192.168.1.100)
- **Subnet Mask**: Enter subnet mask (e.g., 255.255.255.0)

### Step 3: Fill in Parameter Mappings (Optional)

In the downloaded Excel template:
1. Column A: Enter parameter names (V1, V2, Ptotal, etc.)
2. Column B: Enter corresponding register addresses
3. Add or remove rows as needed for your device
4. Save the file

### Step 4: Upload Excel File

1. In the Add Device dialog, click "Choose File" in the Parameter/Register Mapping section
2. Select your filled Excel file
3. The system will parse and validate the file
4. A preview table will show all parameter mappings
5. Review the mappings

### Step 5: Add Device

1. Click "Add Device" button
2. Device is created with:
   - Basic information (name, type, IP, subnet mask)
   - Parameter mappings (if uploaded)

## Example Excel Content

```
Parameter  | Address
-----------|------------------
V1         | Register 40001
V2         | Register 40002
V3         | Register 40003
VR         | Register 40004
VY         | Register 40005
VB         | Register 40006
I1         | Register 40007
I2         | Register 40008
I3         | Register 40009
P1         | Register 40013
P2         | Register 40014
P3         | Register 40015
Ptotal     | Register 40016
PF1        | Register 40017
PF2        | Register 40018
PF3        | Register 40019
PFavg      | Register 40020
frequency  | Register 40021
```

## Supported Parameters

Common parameters you can map:
- **Voltage**: V1, V2, V3, VR, VY, VB, V, Vavg, Vpeak
- **Current**: I1, I2, I3, IR, IY, IB, I, Iavg, Ipeak
- **Power**: P1, P2, P3, Ptotal, Q1, Q2, Q3, Qtotal, S1, S2, S3, Stotal
- **Power Factor**: PF1, PF2, PF3, PFavg, PF
- **Frequency**: frequency
- **Energy**: energy_active, energy_reactive, energy_apparent
- **Harmonics**: THD_V1, THD_V2, THD_V3, THD_I1, THD_I2, THD_I3, THD_V, THD_I
- **Additional**: temperature, humidity

## Address Format

The address can be in various formats:
- `Register 40001`
- `40001`
- `0x9C41` (hexadecimal)
- `40001-40002` (range, if supported)
- Any format your device protocol supports

## Validation Rules

The system validates:
- ✅ Both Parameter and Address columns must have values
- ✅ Empty rows are skipped
- ✅ File must be .xlsx or .xls format

## Important Notes

1. **IP Address is Separate** - The device IP address is configured in the Add Device form, NOT in the Excel file
2. **Per Device** - Each device can have its own parameter mapping file
3. **Optional** - Parameter mapping is optional; you can add devices without it
4. **Device Type Specific** - Templates are generated based on selected device type
5. **Stored with Device** - Parameter mappings are stored in the database with the device

## Use Cases

### Use Case 1: Standard Device
- Use default mappings (no Excel upload needed)
- Device works with default register addresses

### Use Case 2: Custom Device
- Upload Excel with custom parameter mappings
- Map parameters to device-specific register addresses

### Use Case 3: Different Protocol
- Upload Excel to map parameters to protocol-specific addresses
- Supports Modbus, DNP3, IEC 61850, etc.

## Troubleshooting

### File Won't Upload
- Ensure file is .xlsx or .xls format
- Check file is not corrupted
- Try downloading a fresh template

### Validation Errors
- Ensure both Parameter and Address columns have values
- Check for empty rows (they will be skipped)
- Verify column headers match template

### Mappings Not Applied
- Check backend is running
- Verify device was created successfully
- Check device details to see stored mappings

## Benefits

- ✅ **Flexibility** - Configure different register addresses per device
- ✅ **Efficiency** - Upload mappings instead of manual entry
- ✅ **Accuracy** - Template ensures correct format
- ✅ **Scalability** - Easy to configure multiple devices
- ✅ **Documentation** - Excel file serves as configuration documentation
