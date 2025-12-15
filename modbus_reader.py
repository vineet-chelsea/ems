"""
Modbus TCP Register Reader for Jupyter Notebook
Supports reading holding registers with various data types from Modbus TCP devices
"""

from pymodbus.client import ModbusTcpClient
from pymodbus.exceptions import ModbusException
import struct
from typing import Union, List, Tuple, Optional
import pandas as pd
from datetime import datetime


class ModbusReader:
    """
    A class to read Modbus TCP holding registers with support for multiple data types
    """
    
    def __init__(self, ip_address: str = "192.168.0.5", port: int = 502, slave_id: int = 255):
        """
        Initialize Modbus TCP client
        
        Args:
            ip_address: IP address of the Modbus device
            port: Modbus TCP port (default: 502)
            slave_id: Modbus slave/unit ID (default: 255)
        """
        self.ip_address = ip_address
        self.port = port
        self.slave_id = slave_id
        self.client = None
        self.connected = False
        
    def connect(self) -> bool:
        """
        Connect to Modbus TCP device
        
        Returns:
            True if connection successful, False otherwise
        """
        try:
            self.client = ModbusTcpClient(host=self.ip_address, port=self.port)
            self.connected = self.client.connect()
            if self.connected:
                print(f"✓ Connected to Modbus device at {self.ip_address}:{self.port}")
            else:
                print(f"✗ Failed to connect to {self.ip_address}:{self.port}")
            return self.connected
        except Exception as e:
            print(f"✗ Connection error: {e}")
            return False
    
    def disconnect(self):
        """Close Modbus TCP connection"""
        if self.client:
            self.client.close()
            self.connected = False
            print("✓ Disconnected from Modbus device")
    
    def read_holding_registers(self, address: int, count: int) -> Optional[List[int]]:
        """
        Read raw holding registers
        
        Args:
            address: Starting register address (0-based)
            count: Number of registers to read
            
        Returns:
            List of register values or None if error
        """
        if not self.connected:
            print("✗ Not connected. Call connect() first.")
            return None
        
        try:
            result = self.client.read_holding_registers(address, count, unit=self.slave_id)
            if result.isError():
                print(f"✗ Modbus error: {result}")
                return None
            return result.registers
        except ModbusException as e:
            print(f"✗ Modbus exception: {e}")
            return None
        except Exception as e:
            print(f"✗ Error reading registers: {e}")
            return None
    
    def read_int16(self, address: int, count: int = 1, signed: bool = True) -> Union[int, List[int], None]:
        """
        Read INT16 (16-bit integer) values
        
        Args:
            address: Starting register address
            count: Number of INT16 values to read
            signed: True for signed, False for unsigned
            
        Returns:
            Single value or list of values
        """
        registers = self.read_holding_registers(address, count)
        if registers is None:
            return None
        
        values = []
        for reg in registers:
            if signed:
                # Convert to signed 16-bit integer
                if reg > 32767:
                    values.append(reg - 65536)
                else:
                    values.append(reg)
            else:
                values.append(reg)
        
        return values[0] if count == 1 else values
    
    def read_int32(self, address: int, count: int = 1, byte_order: str = "big") -> Union[int, List[int], None]:
        """
        Read INT32 (32-bit integer) values
        
        Args:
            address: Starting register address (must be even)
            count: Number of INT32 values to read
            byte_order: "big" (big-endian, default) or "little" (little-endian)
            
        Returns:
            Single value or list of values
        """
        # INT32 requires 2 registers
        register_count = count * 2
        registers = self.read_holding_registers(address, register_count)
        if registers is None:
            return None
        
        values = []
        for i in range(0, len(registers), 2):
            # Combine two 16-bit registers into 32-bit integer
            if byte_order == "big":
                # High word first (Modbus standard)
                value = (registers[i] << 16) | registers[i + 1]
            else:
                # Little-endian (low word first)
                value = (registers[i + 1] << 16) | registers[i]
            
            # Convert to signed 32-bit integer
            if value > 2147483647:
                value = value - 4294967296
            
            values.append(value)
        
        return values[0] if count == 1 else values
    
    def read_float32(self, address: int, count: int = 1, byte_order: str = "big") -> Union[float, List[float], None]:
        """
        Read FLOAT32 (32-bit floating point) values
        
        Args:
            address: Starting register address (must be even)
            count: Number of FLOAT32 values to read
            byte_order: "big" (big-endian, default) or "little" (little-endian)
            
        Returns:
            Single value or list of values
        """
        # FLOAT32 requires 2 registers
        register_count = count * 2
        registers = self.read_holding_registers(address, register_count)
        if registers is None:
            return None
        
        values = []
        for i in range(0, len(registers), 2):
            # Combine two 16-bit registers into 32-bit value
            if byte_order == "big":
                # Big-endian: high word first
                bytes_data = struct.pack('>HH', registers[i], registers[i + 1])
            else:
                # Little-endian: low word first
                bytes_data = struct.pack('<HH', registers[i], registers[i + 1])
            
            # Unpack as float
            value = struct.unpack('>f' if byte_order == "big" else '<f', bytes_data)[0]
            values.append(value)
        
        return values[0] if count == 1 else values
    
    def read_float64(self, address: int, count: int = 1, byte_order: str = "big") -> Union[float, List[float], None]:
        """
        Read FLOAT64 (64-bit floating point/double) values
        
        Args:
            address: Starting register address (must be even)
            count: Number of FLOAT64 values to read
            byte_order: "big" (big-endian, default) or "little" (little-endian)
            
        Returns:
            Single value or list of values
        """
        # FLOAT64 requires 4 registers
        register_count = count * 4
        registers = self.read_holding_registers(address, register_count)
        if registers is None:
            return None
        
        values = []
        for i in range(0, len(registers), 4):
            # Combine four 16-bit registers into 64-bit value
            if byte_order == "big":
                # Big-endian: high word first
                bytes_data = struct.pack('>HHHH', registers[i], registers[i + 1], 
                                        registers[i + 2], registers[i + 3])
            else:
                # Little-endian: low word first
                bytes_data = struct.pack('<HHHH', registers[i + 3], registers[i + 2],
                                        registers[i + 1], registers[i])
            
            # Unpack as double
            value = struct.unpack('>d' if byte_order == "big" else '<d', bytes_data)[0]
            values.append(value)
        
        return values[0] if count == 1 else values
    
    def read_bitmap(self, address: int, count: int = 1) -> Union[List[bool], List[List[bool]], None]:
        """
        Read BITMAP (bit field) values from registers
        
        Args:
            address: Starting register address
            count: Number of registers to read as bitmap
            
        Returns:
            List of boolean values (bits) or list of lists if count > 1
        """
        registers = self.read_holding_registers(address, count)
        if registers is None:
            return None
        
        if count == 1:
            # Single register: return 16 bits
            bits = []
            reg = registers[0]
            for i in range(16):
                bits.append(bool(reg & (1 << i)))
            return bits
        else:
            # Multiple registers: return list of bit lists
            result = []
            for reg in registers:
                bits = []
                for i in range(16):
                    bits.append(bool(reg & (1 << i)))
                result.append(bits)
            return result
    
    def read_custom(self, address: int, data_type: str, count: int = 1, **kwargs) -> Union[any, List[any], None]:
        """
        Read registers with specified data type
        
        Args:
            address: Starting register address
            data_type: Data type (INT16, INT32, FLOAT32, FLOAT64, BITMAP)
            count: Number of values to read
            **kwargs: Additional arguments (signed, byte_order, etc.)
            
        Returns:
            Value(s) based on data type
        """
        data_type = data_type.upper()
        
        if data_type == "INT16":
            signed = kwargs.get('signed', True)
            return self.read_int16(address, count, signed)
        elif data_type == "INT32":
            byte_order = kwargs.get('byte_order', 'big')
            return self.read_int32(address, count, byte_order)
        elif data_type == "FLOAT32":
            byte_order = kwargs.get('byte_order', 'big')
            return self.read_float32(address, count, byte_order)
        elif data_type == "FLOAT64":
            byte_order = kwargs.get('byte_order', 'big')
            return self.read_float64(address, count, byte_order)
        elif data_type == "BITMAP":
            return self.read_bitmap(address, count)
        else:
            print(f"✗ Unsupported data type: {data_type}")
            print("Supported types: INT16, INT32, FLOAT32, FLOAT64, BITMAP")
            return None
    
    def read_multiple(self, register_map: List[dict]) -> pd.DataFrame:
        """
        Read multiple registers with different data types and return as DataFrame
        
        Args:
            register_map: List of dictionaries with keys:
                - name: Parameter name
                - address: Register address
                - data_type: INT16, INT32, FLOAT32, FLOAT64, BITMAP
                - count: Number of values (optional, default: 1)
                - unit: Unit of measurement (optional)
                - description: Description (optional)
                
        Returns:
            DataFrame with results
        """
        results = []
        
        for reg_config in register_map:
            name = reg_config.get('name', f'Register_{reg_config["address"]}')
            address = reg_config['address']
            data_type = reg_config['data_type']
            count = reg_config.get('count', 1)
            unit = reg_config.get('unit', '')
            description = reg_config.get('description', '')
            
            value = self.read_custom(address, data_type, count, **reg_config.get('options', {}))
            
            if value is not None:
                if isinstance(value, list) and count > 1:
                    # Multiple values - create row for each
                    for i, v in enumerate(value):
                        results.append({
                            'Timestamp': datetime.now(),
                            'Name': f"{name}[{i}]" if count > 1 else name,
                            'Address': address + (i * (2 if data_type in ['INT32', 'FLOAT32'] else 4 if data_type == 'FLOAT64' else 1)),
                            'Data Type': data_type,
                            'Value': v,
                            'Unit': unit,
                            'Description': description
                        })
                else:
                    # Single value
                    results.append({
                        'Timestamp': datetime.now(),
                        'Name': name,
                        'Address': address,
                        'Data Type': data_type,
                        'Value': value,
                        'Unit': unit,
                        'Description': description
                    })
            else:
                results.append({
                    'Timestamp': datetime.now(),
                    'Name': name,
                    'Address': address,
                    'Data Type': data_type,
                    'Value': 'Error',
                    'Unit': unit,
                    'Description': description
                })
        
        return pd.DataFrame(results)


# Example usage functions for Jupyter notebook
def example_basic_usage():
    """
    Example: Basic usage in Jupyter notebook
    """
    print("=" * 60)
    print("Example: Basic Modbus Reading")
    print("=" * 60)
    
    # Create reader instance
    reader = ModbusReader(ip_address="192.168.0.5", slave_id=255)
    
    # Connect
    if reader.connect():
        # Read INT16 at address 0
        value = reader.read_int16(0)
        print(f"INT16 at address 0: {value}")
        
        # Read FLOAT32 at address 10
        value = reader.read_float32(10)
        print(f"FLOAT32 at address 10: {value}")
        
        # Disconnect
        reader.disconnect()


def example_register_map():
    """
    Example: Reading multiple registers with a register map
    """
    print("=" * 60)
    print("Example: Reading Multiple Registers")
    print("=" * 60)
    
    # Define register map
    register_map = [
        {
            'name': 'Voltage_R',
            'address': 0,
            'data_type': 'FLOAT32',
            'unit': 'V',
            'description': 'Phase R Voltage'
        },
        {
            'name': 'Voltage_Y',
            'address': 2,
            'data_type': 'FLOAT32',
            'unit': 'V',
            'description': 'Phase Y Voltage'
        },
        {
            'name': 'Current_R',
            'address': 10,
            'data_type': 'FLOAT32',
            'unit': 'A',
            'description': 'Phase R Current'
        },
        {
            'name': 'Status',
            'address': 20,
            'data_type': 'INT16',
            'unit': '',
            'description': 'Device Status'
        },
        {
            'name': 'Power_Total',
            'address': 30,
            'data_type': 'FLOAT64',
            'unit': 'kW',
            'description': 'Total Power'
        }
    ]
    
    # Create reader and read
    reader = ModbusReader(ip_address="192.168.0.5", slave_id=255)
    
    if reader.connect():
        df = reader.read_multiple(register_map)
        print("\nResults:")
        print(df)
        reader.disconnect()
        
        return df
    
    return None


if __name__ == "__main__":
    # Run examples
    example_basic_usage()
    print("\n")
    example_register_map()


