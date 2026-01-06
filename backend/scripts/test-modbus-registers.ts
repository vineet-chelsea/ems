/**
 * Test script to verify Modbus register reading
 * This uses the same logic as the dataCollector service
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as url from 'url';

const execAsync = promisify(exec);
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RegisterMapping {
  parameter: string;
  address: number;
  dataType: string;
  description?: string;
}

async function testModbusReading(
  ipAddress: string,
  slaveAddress: number,
  testRegisters: RegisterMapping[]
): Promise<void> {
  console.log('='.repeat(60));
  console.log('Modbus Register Reading Test');
  console.log('='.repeat(60));
  console.log(`Device IP: ${ipAddress}`);
  console.log(`Port: 502`);
  console.log(`Slave ID: ${slaveAddress}`);
  console.log(`Test Registers: ${testRegisters.length}`);
  console.log('');

  // Create temporary files
  const tempDir = os.tmpdir();
  const scriptPath = path.join(tempDir, `modbus_test_${Date.now()}.py`);
  const mappingsPath = path.join(tempDir, `mappings_test_${Date.now()}.json`);

  // Write mappings to JSON file
  fs.writeFileSync(mappingsPath, JSON.stringify(testRegisters, null, 2));

  // Generate Python script (same as in dataCollector.ts)
  const pythonScript = `
import sys
import json
import struct
from pymodbus.client import ModbusTcpClient

def read_regs(client, address, count, slave_id):
    """Read holding registers from Modbus device"""
    try:
        result = client.read_holding_registers(address, count, unit=slave_id)
        if result.isError():
            return None
        return result.registers
    except Exception as e:
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

def read_register(client, address, data_type, slave_id):
    """Read a single register value"""
    try:
        # Use address directly as register index
        # Addresses from Excel column C are used as-is (e.g., 2017)
        
        if data_type == 'FLOAT32':
            regs = read_regs(client, address, 2, slave_id)
            return decode_float32(regs) if regs else None
        elif data_type == 'INT32U':
            regs = read_regs(client, address, 2, slave_id)
            return decode_int32u(regs) if regs else None
        elif data_type == '4Q_FP_PF':
            regs = read_regs(client, address, 2, slave_id)
            if regs and len(regs) >= 2:
                return decode_4q_fp_pf(regs)
            return None
        elif data_type == 'INT16U':
            regs = read_regs(client, address, 1, slave_id)
            if regs and len(regs) > 0:
                return decode_int16u(regs[0])
            return None
        elif data_type == 'UTF8':
            # UTF8 strings - read 20 registers (40 bytes) for string data
            regs = read_regs(client, address, 20, slave_id)
            return decode_utf8(regs) if regs else None
        else:
            return None
    except Exception as e:
        return None

# Parse arguments
ip_address = sys.argv[1]
slave_id = int(sys.argv[2])
mappings_file = sys.argv[3]

# Read mappings from JSON file
with open(mappings_file, 'r') as f:
    mappings = json.load(f)

# Connect to Modbus device
client = ModbusTcpClient(host=ip_address, port=502)
if not client.connect():
    print(json.dumps({"error": "Failed to connect to Modbus device"}))
    sys.exit(1)

# Read all registers
results = {}
for mapping in mappings:
    param = mapping['parameter']
    address = mapping['address']
    data_type = mapping['dataType']
    
    value = read_register(client, address, data_type, slave_id)
    if value is not None:
        results[param] = value

client.close()

# Output results as JSON
print(json.dumps(results))
`;

  fs.writeFileSync(scriptPath, pythonScript);

  try {
    console.log('[1] Testing TCP connection...');
    // Test TCP connection first
    const tcpTest = await execAsync(`python -c "import socket; s = socket.socket(); s.settimeout(3); result = s.connect_ex(('${ipAddress}', 502)); s.close(); exit(0 if result == 0 else 1)"`);
    console.log('    ✓ TCP connection successful\n');

    console.log('[2] Connecting to Modbus device...');
    console.log(`    Executing Python script...`);

    // Execute Python script
    const { stdout, stderr } = await execAsync(
      `python "${scriptPath}" "${ipAddress}" ${slaveAddress} "${mappingsPath}"`
    );

    if (stderr && !stderr.includes('DeprecationWarning')) {
      console.error('    Python stderr:', stderr);
    }

    if (!stdout || stdout.trim().length === 0) {
      throw new Error('Python script returned no output');
    }

    const result = JSON.parse(stdout.trim());

    if (result.error) {
      throw new Error(result.error);
    }

    console.log('    ✓ Modbus client connected\n');

    console.log('[3] Register Read Results:');
    console.log('-'.repeat(60));

    const successCount = Object.keys(result).length;
    const failCount = testRegisters.length - successCount;

    for (const reg of testRegisters) {
      const value = result[reg.parameter];
      if (value !== undefined) {
        const valueStr = typeof value === 'string' ? `"${value}"` : value;
        console.log(`  ✓ ${reg.parameter} (addr: ${reg.address}, type: ${reg.dataType}): ${valueStr}`);
      } else {
        console.log(`  ✗ ${reg.parameter} (addr: ${reg.address}, type: ${reg.dataType}): FAILED`);
      }
    }

    console.log('-'.repeat(60));
    console.log(`\nSummary: ${successCount}/${testRegisters.length} registers read successfully`);

    if (successCount > 0) {
      console.log('\n✓ Modbus reading is working!');
    } else {
      console.log('\n✗ No registers could be read. Check:');
      console.log('  - Device IP address and port');
      console.log('  - Slave ID (unit ID)');
      console.log('  - Network connectivity');
      console.log('  - Register addresses (device-specific)');
    }
  } catch (error: any) {
    console.error('\n✗ Error during test:');
    if (error.stdout) {
      console.error('Python stdout:', error.stdout);
    }
    if (error.stderr) {
      console.error('Python stderr:', error.stderr);
    }
    console.error('Error:', error.message || error);
    process.exit(1);
  } finally {
    // Clean up temp files
    try {
      fs.unlinkSync(scriptPath);
      fs.unlinkSync(mappingsPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: ts-node test-modbus-registers.ts <IP_ADDRESS> <SLAVE_ID>');
    console.log('Example: ts-node test-modbus-registers.ts 192.168.1.100 1');
    process.exit(1);
  }

  const ipAddress = args[0];
  const slaveAddress = parseInt(args[1], 10);

  // Test with sample PM5320 registers
  const testRegisters: RegisterMapping[] = [
    { parameter: 'Nominal Voltage', address: 2017, dataType: 'FLOAT32' },
    { parameter: 'Nominal Current', address: 2019, dataType: 'FLOAT32' },
    { parameter: 'Number of Phases', address: 2013, dataType: 'INT16U' },
    { parameter: 'Number of Wires', address: 2014, dataType: 'INT16U' },
    { parameter: 'Current A', address: 2999, dataType: 'FLOAT32' },
    { parameter: 'Voltage A-N', address: 3027, dataType: 'FLOAT32' },
    { parameter: 'Active Power Total', address: 3059, dataType: 'FLOAT32' },
    { parameter: 'Frequency', address: 3109, dataType: 'FLOAT32' },
    { parameter: 'Meter Name', address: 29, dataType: 'UTF8' },
    { parameter: 'Meter Model', address: 49, dataType: 'UTF8' },
  ];

  await testModbusReading(ipAddress, slaveAddress, testRegisters);
}

main().catch(console.error);

