# Complete Offline Installation Guide

## Overview

This guide explains how to use the complete offline installation bundle that contains **ALL** dependencies and libraries required for EMS installation on a machine without internet access.

## What's Included

The offline bundle contains:

### System Installers
- ✅ **Node.js v22.x LTS** - JavaScript runtime and npm package manager
- ✅ **PostgreSQL 17.x** - Database server
- ✅ **TimescaleDB** - Time-series database extension
- ✅ **Python 3.11+** - Python interpreter

### Pre-installed Dependencies
- ✅ **Frontend node_modules** - All React, Vite, Electron, and UI dependencies (~500-700 MB)
- ✅ **Backend node_modules** - All Express, TypeScript, database drivers (~200-300 MB)
- ✅ **Python wheel files** - All Python packages (pymodbus, pandas, numpy, etc.) (~50-100 MB)

### Source Code
- ✅ Complete application source code
- ✅ Configuration files
- ✅ Documentation
- ✅ Installation scripts

**Total Bundle Size**: ~1.5 - 2 GB

## Creating the Offline Bundle

### Prerequisites
- Windows 10/11 (64-bit)
- Administrator privileges
- Internet connection (for initial bundle creation only)
- ~3 GB free disk space

### Steps

1. **Prepare the bundle** (run on a machine with internet):
   ```powershell
   cd C:\Users\vemco\EMS\ems
   .\scripts\prepare-offline-bundle.ps1
   ```

   This script will:
   - Copy all installers from `installer/` folder
   - Copy complete source code
   - Install and bundle all frontend npm packages
   - Install and bundle all backend npm packages
   - Download all Python packages as wheel files
   - Create installation scripts

2. **Verify the bundle**:
   ```powershell
   .\scripts\verify-bundle.ps1
   ```

   This will check:
   - All installers are present
   - All node_modules are bundled
   - All Python wheels are downloaded
   - All source files are included

3. **Transfer the bundle**:
   - Copy the entire `offline-bundle/` folder to target machine
   - Use USB drive, external hard drive, or network share
   - Ensure all files are copied (verify size matches)

## Installing on Offline Machine

### Prerequisites
- Windows 10/11 (64-bit)
- Administrator privileges
- ~5 GB free disk space (for installation)

### Installation Steps

1. **Extract/Copy Bundle**:
   - Copy `offline-bundle/` folder to target machine (e.g., `C:\EMS\ems-offline`)

2. **Run Installation Script** (as Administrator):
   ```powershell
   # Right-click PowerShell and select "Run as Administrator"
   cd C:\EMS\ems-offline
   .\scripts\offline-install.ps1
   ```

   This will automatically:
   - Install Node.js
   - Install PostgreSQL (you'll be prompted for password)
   - Install TimescaleDB (if included)
   - Install Python
   - Install all Python packages from wheels
   - Verify all installations

3. **Restart Terminal**:
   - Close and reopen PowerShell to refresh PATH environment variable
   - Verify installations:
     ```powershell
     node --version    # Should show v22.x.x
     npm --version     # Should show version
     python --version  # Should show Python 3.11.x
     pip list          # Should show pymodbus, pandas, numpy, etc.
     ```

4. **Setup Database**:
   
   **Option A: Using pgAdmin**
   - Open pgAdmin 4 (installed with PostgreSQL)
   - Connect to PostgreSQL server (use password set during installation)
   - Right-click "Databases" → "Create" → "Database"
   - Name: `ems_db`
   - Click "Save"
   - Right-click `ems_db` → "Query Tool"
   - Run:
     ```sql
     CREATE USER ems_user WITH PASSWORD 'your_secure_password';
     GRANT ALL PRIVILEGES ON DATABASE ems_db TO ems_user;
     CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
     ```

   **Option B: Using psql (Command Line)**
   ```powershell
   psql -U postgres
   ```
   Enter your postgres password, then run:
   ```sql
   CREATE DATABASE ems_db;
   CREATE USER ems_user WITH PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE ems_db TO ems_user;
   \c ems_db
   CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
   \q
   ```

5. **Configure Environment**:
   
   Create `backend/.env` file:
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=ems_db
   DB_USER=ems_user
   DB_PASSWORD=your_secure_password
   
   # Server Port
   PORT=3001
   
   # Sampling Intervals (in seconds)
   SAMPLING_INTERVAL=0.1
   CRITICAL_INTERVAL=0.05
   NORMAL_INTERVAL=0.2
   
   # Database Pool
   DB_POOL_SIZE=50
   DB_MIN_CONNECTIONS=10
   
   # Batch Processing
   BATCH_SIZE=10
   INSERT_BATCH_SIZE=100
   
   # Data Retention (days)
   RETENTION_DAYS=180
   CLEANUP_SCHEDULE=0 2 * * *
   
   # Worker Pool
   MAX_WORKERS=10
   WORKER_TIMEOUT=5000
   
   # Memory Management (MB)
   MAX_REPORT_MEMORY_MB=2048
   SPATIAL_SAMPLING_THRESHOLD=100000
   
   # Monitoring
   MONITORING_ENABLED=true
   MONITORING_LOG_INTERVAL=60
   ```

6. **Initialize Database**:
   ```powershell
   cd backend
   npm run migrate
   ```

7. **Start Application**:
   ```powershell
   # From bundle root directory
   npm run start:dev
   ```

## Troubleshooting

### Node.js not found after installation
- **Solution**: Restart PowerShell/terminal
- **Verify**: `$env:Path -split ';' | Select-String node`
- **Manual**: Add `C:\Program Files\nodejs\` to PATH

### Python not found after installation
- **Solution**: Restart PowerShell/terminal
- **Verify**: `Get-Command python`
- **Manual**: Add Python to PATH during installation

### PostgreSQL service not running
```powershell
# Check service status
Get-Service -Name "*postgresql*"

# Start service
Start-Service postgresql-x64-17

# Or restart
Restart-Service postgresql-x64-17
```

### Missing Python packages
```powershell
# Install from bundled wheels
pip install --no-index --find-links offline-packages\python-wheels -r requirements_modbus.txt

# Or install manually
pip install --no-index --find-links offline-packages\python-wheels pymodbus pandas numpy
```

### Missing npm packages
If `node_modules` are not bundled:
```powershell
# Frontend
npm install --legacy-peer-deps

# Backend
cd backend
npm install
```

### TimescaleDB extension error
If TimescaleDB wasn't installed:
```sql
-- System will work without TimescaleDB, but without time-series optimizations
-- To install later:
-- 1. Install TimescaleDB installer
-- 2. Run: CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
```

### Port already in use
```powershell
# Find process using port 3001
netstat -ano | findstr :3001

# Kill process (replace PID)
taskkill /PID <PID> /F
```

## Bundle Structure

```
offline-bundle/
├── installer/
│   ├── nodejs/
│   │   └── node-v22.17.1-x64.msi
│   ├── postgresql/
│   │   ├── postgresql-17.0-rc1-windows-x64.exe
│   │   └── timescaledb-postgresql-17-windows-amd64.zip
│   └── python/
│       └── python-3.11.6-amd64.exe
├── offline-packages/
│   └── python-wheels/
│       └── *.whl (all Python packages)
├── node_modules/          # Frontend dependencies (pre-installed)
├── backend/
│   └── node_modules/      # Backend dependencies (pre-installed)
├── scripts/
│   ├── offline-install.ps1
│   └── verify-bundle.ps1
└── ... (all source code)
```

## Notes

- ✅ **All dependencies are bundled** - No internet connection required
- ✅ **Pre-installed packages** - No npm/pip downloads needed
- ✅ **Complete source code** - Ready to run
- ⚠️ **Installers must be included** - Download separately if needed
- ⚠️ **Bundle size** - ~1.5-2 GB (ensure enough space)
- ⚠️ **PATH refresh** - Restart terminal after installation

## Support

For issues or questions:
- Check `INSTALLATION_GUIDE.md` for detailed setup
- Check `TROUBLESHOOTING.md` for common issues
- Verify bundle: `.\scripts\verify-bundle.ps1`

---

**Ready for offline installation!** 🚀

