import * as net from 'net';

/**
 * Modbus TCP Utility Functions
 * Supports reading registers with various data types
 */

export interface ModbusRegisterConfig {
  address: number; // Register address (0-based)
  dataType: 'INT16U' | 'INT32U' | 'FLOAT32' | 'UTF8' | '4Q_FP_PF' | 'INT16S';
  registerCount?: number; // Number of registers to read (auto-determined by dataType if not specified)
  name: string; // Parameter name
}

/**
 * Create Modbus TCP client connection
 * Note: Actual Modbus reading would require a Modbus library like 'jsmodbus' or 
 * communication with a Python service that uses pymodbus.
 * This is a placeholder structure for future implementation.
 */
export async function createModbusClient(
  ipAddress: string,
  port: number = 502,
  slaveAddress: number = 1
): Promise<any> {
  // TODO: Implement actual Modbus client connection
  // Options:
  // 1. Use jsmodbus library for Node.js
  // 2. Create Python service that uses pymodbus and communicate via API
  // 3. Use child_process to execute Python scripts
  
  throw new Error('Modbus client creation needs implementation with actual library');
}

/**
 * Test Modbus TCP connection
 */
export async function testModbusConnection(
  ipAddress: string,
  port: number = 502
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 3000);

    socket.connect(port, ipAddress, () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/**
 * Decode unsigned 16-bit integer (INT16U)
 */
export function decode_int16u(reg: number): number {
  return reg & 0xFFFF;
}

/**
 * Decode signed 16-bit integer (INT16S)
 */
export function decode_int16s(reg: number): number {
  const value = reg & 0xFFFF;
  return value > 0x7FFF ? value - 0x10000 : value;
}

/**
 * Decode unsigned 32-bit integer (INT32U) - 2 registers, Big-Endian
 */
export function decode_int32u(regs: number[]): number {
  if (regs.length < 2) {
    throw new Error('INT32U requires 2 registers');
  }
  // Big-Endian: high word first
  const high = regs[0] & 0xFFFF;
  const low = regs[1] & 0xFFFF;
  return (high << 16) | low;
}

/**
 * Decode IEEE 754 Float32 - 2 registers, Big-Endian
 */
export function decode_float32(regs: number[]): number {
  if (regs.length < 2) {
    throw new Error('FLOAT32 requires 2 registers');
  }
  
  // Big-Endian byte order
  const buffer = Buffer.alloc(4);
  buffer.writeUInt16BE(regs[0] & 0xFFFF, 0);
  buffer.writeUInt16BE(regs[1] & 0xFFFF, 2);
  return buffer.readFloatBE(0);
}

/**
 * Decode UTF-8 string from registers
 * 1 register = 2 characters
 */
export function decode_utf8(regs: number[]): string {
  const bytes: number[] = [];
  
  for (const reg of regs) {
    // Big-Endian: extract two bytes from each register
    bytes.push((reg >> 8) & 0xFF); // High byte
    bytes.push(reg & 0xFF); // Low byte
  }
  
  // Find null terminator and decode
  const nullIndex = bytes.indexOf(0);
  const stringBytes = nullIndex >= 0 ? bytes.slice(0, nullIndex) : bytes;
  
  try {
    return Buffer.from(stringBytes).toString('utf-8');
  } catch (error) {
    // If UTF-8 decode fails, try with replacement characters
    return Buffer.from(stringBytes).toString('utf-8').replace(/\uFFFD/g, '');
  }
}

/**
 * Decode four-quadrant power factor
 * Signed INT16, scaled by 1000
 */
export function decode_4q_fp_pf(reg: number): number {
  const signed = decode_int16s(reg);
  return signed / 1000.0;
}

/**
 * Decode register value based on data type
 */
export function decodeRegisterValue(
  regs: number[],
  dataType: ModbusRegisterConfig['dataType']
): number | string {
  switch (dataType) {
    case 'INT16U':
      return decode_int16u(regs[0]);
    
    case 'INT16S':
      return decode_int16s(regs[0]);
    
    case 'INT32U':
      return decode_int32u(regs);
    
    case 'FLOAT32':
      return decode_float32(regs);
    
    case 'UTF8':
      return decode_utf8(regs);
    
    case '4Q_FP_PF':
      return decode_4q_fp_pf(regs[0]);
    
    default:
      throw new Error(`Unknown data type: ${dataType}`);
  }
}

/**
 * Get register count needed for a data type
 */
export function getRegisterCount(dataType: ModbusRegisterConfig['dataType']): number {
  switch (dataType) {
    case 'INT16U':
    case 'INT16S':
    case '4Q_FP_PF':
      return 1;
    
    case 'INT32U':
    case 'FLOAT32':
      return 2;
    
    case 'UTF8':
      // UTF8 length is variable, default to reasonable size
      // Caller should specify registerCount in config
      return 16; // Default to 32 characters (16 registers)
    
    default:
      return 1;
  }
}

