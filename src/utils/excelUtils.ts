import * as XLSX from 'xlsx';

export interface ParameterMappingRow {
  parameter: string;  // Parameter name (e.g., V1, Ptotal, PFavg)
  address: string;   // Register address (e.g., Register 40001, 40001, etc.)
  dataType?: string; // Data type (INT16U, INT32U, FLOAT32, UTF8, 4Q_FP_PF)
  description?: string; // Optional description
}

/**
 * Generate PM5320 Excel template for parameter/register mapping
 * Based on standard PM5320 Modbus register map
 */
function getPM5320Mappings(): ParameterMappingRow[] {
  return [
    // Voltage parameters (FLOAT32)
    { parameter: 'V1', address: '40001', dataType: 'FLOAT32', description: 'Voltage L1-N (V)' },
    { parameter: 'V2', address: '40003', dataType: 'FLOAT32', description: 'Voltage L2-N (V)' },
    { parameter: 'V3', address: '40005', dataType: 'FLOAT32', description: 'Voltage L3-N (V)' },
    { parameter: 'VR', address: '40007', dataType: 'FLOAT32', description: 'Voltage R-N (V)' },
    { parameter: 'VY', address: '40009', dataType: 'FLOAT32', description: 'Voltage Y-N (V)' },
    { parameter: 'VB', address: '40011', dataType: 'FLOAT32', description: 'Voltage B-N (V)' },
    { parameter: 'Vavg', address: '40013', dataType: 'FLOAT32', description: 'Average Voltage (V)' },
    
    // Current parameters (FLOAT32)
    { parameter: 'I1', address: '40015', dataType: 'FLOAT32', description: 'Current L1 (A)' },
    { parameter: 'I2', address: '40017', dataType: 'FLOAT32', description: 'Current L2 (A)' },
    { parameter: 'I3', address: '40019', dataType: 'FLOAT32', description: 'Current L3 (A)' },
    { parameter: 'IR', address: '40021', dataType: 'FLOAT32', description: 'Current R (A)' },
    { parameter: 'IY', address: '40023', dataType: 'FLOAT32', description: 'Current Y (A)' },
    { parameter: 'IB', address: '40025', dataType: 'FLOAT32', description: 'Current B (A)' },
    { parameter: 'Iavg', address: '40027', dataType: 'FLOAT32', description: 'Average Current (A)' },
    { parameter: 'Ipeak', address: '40029', dataType: 'FLOAT32', description: 'Peak Current (A)' },
    
    // Power parameters (FLOAT32)
    { parameter: 'P1', address: '40031', dataType: 'FLOAT32', description: 'Active Power L1 (kW)' },
    { parameter: 'P2', address: '40033', dataType: 'FLOAT32', description: 'Active Power L2 (kW)' },
    { parameter: 'P3', address: '40035', dataType: 'FLOAT32', description: 'Active Power L3 (kW)' },
    { parameter: 'Ptotal', address: '40037', dataType: 'FLOAT32', description: 'Total Active Power (kW)' },
    
    // Power Factor (4Q_FP_PF - four-quadrant power factor)
    { parameter: 'PF1', address: '40039', dataType: '4Q_FP_PF', description: 'Power Factor L1' },
    { parameter: 'PF2', address: '40040', dataType: '4Q_FP_PF', description: 'Power Factor L2' },
    { parameter: 'PF3', address: '40041', dataType: '4Q_FP_PF', description: 'Power Factor L3' },
    { parameter: 'PFavg', address: '40042', dataType: '4Q_FP_PF', description: 'Average Power Factor' },
    
    // Frequency (FLOAT32)
    { parameter: 'frequency', address: '40043', dataType: 'FLOAT32', description: 'Frequency (Hz)' },
    
    // Energy parameters (INT32U - usually in Wh)
    { parameter: 'energy_active', address: '40045', dataType: 'INT32U', description: 'Active Energy (Wh)' },
    { parameter: 'energy_reactive', address: '40047', dataType: 'INT32U', description: 'Reactive Energy (VARh)' },
    
    // Additional common parameters
    { parameter: 'V', address: '40049', dataType: 'FLOAT32', description: 'Voltage (V)' },
    { parameter: 'I', address: '40051', dataType: 'FLOAT32', description: 'Current (A)' },
  ];
}

/**
 * Generate a sample Excel template for parameter/register mapping
 * This is used per device to map parameters to register addresses
 */
export function generateParameterMappingTemplate(deviceType: string = 'PM5320'): void {
  // Get mappings based on device type
  let sampleMappings: ParameterMappingRow[];
  
  if (deviceType === 'PM5320') {
    sampleMappings = getPM5320Mappings();
  } else {
    // Default/generic template
    sampleMappings = [
      { parameter: 'V1', address: '40001', dataType: 'FLOAT32', description: 'Voltage L1 (V)' },
      { parameter: 'V2', address: '40003', dataType: 'FLOAT32', description: 'Voltage L2 (V)' },
      { parameter: 'V3', address: '40005', dataType: 'FLOAT32', description: 'Voltage L3 (V)' },
      { parameter: 'I1', address: '40015', dataType: 'FLOAT32', description: 'Current L1 (A)' },
      { parameter: 'I2', address: '40017', dataType: 'FLOAT32', description: 'Current L2 (A)' },
      { parameter: 'I3', address: '40019', dataType: 'FLOAT32', description: 'Current L3 (A)' },
      { parameter: 'P1', address: '40031', dataType: 'FLOAT32', description: 'Power L1 (kW)' },
      { parameter: 'P2', address: '40033', dataType: 'FLOAT32', description: 'Power L2 (kW)' },
      { parameter: 'P3', address: '40035', dataType: 'FLOAT32', description: 'Power L3 (kW)' },
      { parameter: 'Ptotal', address: '40037', dataType: 'FLOAT32', description: 'Total Power (kW)' },
      { parameter: 'PF1', address: '40039', dataType: '4Q_FP_PF', description: 'Power Factor L1' },
      { parameter: 'PF2', address: '40040', dataType: '4Q_FP_PF', description: 'Power Factor L2' },
      { parameter: 'PF3', address: '40041', dataType: '4Q_FP_PF', description: 'Power Factor L3' },
      { parameter: 'frequency', address: '40043', dataType: 'FLOAT32', description: 'Frequency (Hz)' },
    ];
  }

  // Create workbook
  const wb = XLSX.utils.book_new();
  
  // Convert to array format for Excel with headers
  const excelData = [
    ['Parameter', 'Register Address', 'Data Type', 'Description'],
    ...sampleMappings.map(m => [
      m.parameter,
      m.address,
      m.dataType || 'FLOAT32',
      m.description || ''
    ])
  ];
  
  // Create worksheet from array
  const ws = XLSX.utils.aoa_to_sheet(excelData);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 25 }, // Parameter
    { wch: 20 }, // Address
    { wch: 15 }, // Data Type
    { wch: 40 }, // Description
  ];
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Parameter Mappings');
  
  // Create instructions sheet
  const instructions = [
    ['Parameter/Register Mapping Template'],
    [''],
    ['Instructions:'],
    ['1. Column A (Parameter): Enter the parameter name (e.g., V1, Ptotal, PFavg)'],
    ['2. Column B (Register Address): Enter the corresponding register address (e.g., 40001)'],
    ['3. Column C (Data Type): Enter the data type (INT16U, INT32U, FLOAT32, UTF8, 4Q_FP_PF)'],
    ['4. Column D (Description): Optional description of the parameter'],
    ['5. You can add or remove rows as needed for your device configuration'],
    [''],
    ['Required Columns:'],
    ['- Parameter: Parameter name (e.g., "V1", "Ptotal", "PFavg")'],
    ['- Register Address: Register address (e.g., "40001", "0x9C41")'],
    ['- Data Type: INT16U, INT32U, FLOAT32, UTF8, or 4Q_FP_PF'],
    ['- Description: Optional description'],
    [''],
    ['Supported Data Types:'],
    ['- INT16U: Unsigned 16-bit integer (1 register)'],
    ['- INT32U: Unsigned 32-bit integer (2 registers, Big-Endian)'],
    ['- FLOAT32: IEEE 754 32-bit float (2 registers, Big-Endian)'],
    ['- UTF8: UTF-8 string (variable registers)'],
    ['- 4Q_FP_PF: Four-quadrant power factor (signed INT16 scaled by 1000, 1 register)'],
    [''],
    ['Example:'],
    ['Parameter  | Register Address | Data Type  | Description'],
    ['V1         | 40001           | FLOAT32    | Voltage L1-N (V)'],
    ['Ptotal     | 40037           | FLOAT32    | Total Active Power (kW)'],
    ['PFavg      | 40042           | 4Q_FP_PF   | Average Power Factor'],
    [''],
    ['Device Type: ' + deviceType],
    [''],
    ['Note: IP address is configured separately in the Add Device dialog'],
  ];
  
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
  wsInstructions['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');
  
  // Generate filename
  const filename = `parameter_mapping_template_${deviceType}_${new Date().toISOString().split('T')[0]}.xlsx`;
  
  // Write file
  XLSX.writeFile(wb, filename);
}

/**
 * Parse Excel file and extract parameter/register mappings
 */
export function parseParameterMappingFile(file: File): Promise<ParameterMappingRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Get first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);
        
        // Validate and parse data
        const validatedData: ParameterMappingRow[] = [];
        
        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i];
          const parameter = row.Parameter || row.parameter || row['Parameter/Register Variable'];
          const address = row['Register Address'] || row.Address || row.address || row['Register Address'];
          const rawDataType = row['Data Type'] || row.dataType || row.DataType || 'FLOAT32';
          const description = row.Description || row.description || '';
          
          // Skip empty rows
          if (!parameter && !address) {
            continue;
          }
          
          // Validate required fields
          if (!parameter || !address) {
            throw new Error(`Row ${i + 2}: Both Parameter and Register Address are required`);
          }
          
          // Validate and normalize data type
          const validDataTypes = ['INT16U', 'INT32U', 'FLOAT32', 'UTF8', '4Q_FP_PF', 'INT16S'];
          const normalizedDataType = String(rawDataType).trim().toUpperCase();
          let finalDataType: string;
          
          if (!normalizedDataType || !validDataTypes.includes(normalizedDataType)) {
            console.warn(`Row ${i + 2}: Invalid data type "${rawDataType}", defaulting to FLOAT32`);
            finalDataType = 'FLOAT32';
          } else {
            finalDataType = normalizedDataType;
          }
          
          validatedData.push({
            parameter: String(parameter).trim(),
            address: String(address).trim(),
            dataType: finalDataType,
            description: description ? String(description).trim() : undefined,
          });
        }
        
        if (validatedData.length === 0) {
          throw new Error('No valid parameter mappings found in the file');
        }
        
        resolve(validatedData);
      } catch (error: any) {
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Convert parameter mappings array to object format
 */
export function mappingsToObject(mappings: ParameterMappingRow[]): Record<string, string> {
  const result: Record<string, string> = {};
  mappings.forEach(mapping => {
    result[mapping.parameter] = mapping.address;
  });
  return result;
}

/**
 * Validate parameter mapping data
 */
export function validateParameterMapping(mapping: ParameterMappingRow): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!mapping.parameter || mapping.parameter.trim().length === 0) {
    errors.push('Parameter name is required');
  }
  
  if (!mapping.address || mapping.address.trim().length === 0) {
    errors.push('Register address is required');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
