# EMS Installation Guide for Windows

Complete step-by-step guide to install the Energy Monitoring System (EMS) on a fresh Windows machine.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation Steps](#installation-steps)
3. [Database Setup](#database-setup)
4. [Application Setup](#application-setup)
5. [Configuration](#configuration)
6. [Running the Application](#running-the-application)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### 1. Node.js (v18 or higher)

1. Download Node.js from [https://nodejs.org/](https://nodejs.org/)
2. Choose the **LTS version** (recommended)
3. Run the installer (`node-vXX.X.X-x64.msi`)
4. Follow the installation wizard (accept defaults)
5. Verify installation:
   ```powershell
   node --version
   npm --version
   ```
   You should see version numbers (e.g., `v20.10.0` and `10.2.3`)

### 2. PostgreSQL with TimescaleDB

#### Option A: PostgreSQL with TimescaleDB (Recommended)

1. Download PostgreSQL from [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/)
2. Run the installer
3. During installation:
   - Set a **strong password** for the `postgres` superuser (remember this!)
   - Choose port **5432** (default)
   - Select components: PostgreSQL Server, pgAdmin 4, Command Line Tools
4. After PostgreSQL installation, install TimescaleDB:
   - Download TimescaleDB from [https://docs.timescale.com/install/latest/self-hosted/](https://docs.timescale.com/install/latest/self-hosted/)
   - Run the TimescaleDB installer
   - It will detect your PostgreSQL installation automatically

#### Option B: PostgreSQL Only (TimescaleDB can be added later)

1. Follow steps 1-3 above
2. TimescaleDB extension can be installed later via SQL

### 3. Python 3.8 or higher

1. Download Python from [https://www.python.org/downloads/](https://www.python.org/downloads/)
2. Run the installer
3. **IMPORTANT**: Check "Add Python to PATH" during installation
4. Choose "Install Now" (includes pip)
5. Verify installation:
   ```powershell
   python --version
   pip --version
   ```
   You should see version numbers (e.g., `Python 3.11.5`)

### 4. Python Dependencies

Install required Python packages:

```powershell
pip install pymodbus
```

---

## Installation Steps

### Step 1: Clone or Download the Repository

If using Git:
```powershell
git clone <repository-url>
cd ems
```

If downloading as ZIP:
1. Extract the ZIP file to a location (e.g., `C:\EMS\ems`)
2. Open PowerShell in that directory:
   ```powershell
   cd C:\EMS\ems
   ```

### Step 2: Install Frontend Dependencies

```powershell
npm install
```

This will install all frontend dependencies. Wait for completion.

### Step 3: Install Backend Dependencies

```powershell
cd backend
npm install
cd ..
```

---

## Database Setup

### Step 1: Create Database and User

1. Open **pgAdmin 4** (installed with PostgreSQL) or use **psql** command line

2. **Using pgAdmin 4:**
   - Launch pgAdmin 4
   - Connect to PostgreSQL server (use the password you set during installation)
   - Right-click "Databases" → "Create" → "Database"
   - Name: `ems_db`
   - Click "Save"

3. **Using psql (Command Line):**
   ```powershell
   psql -U postgres
   ```
   Enter your postgres password when prompted, then run:
   ```sql
   CREATE DATABASE ems_db;
   CREATE USER ems_user WITH PASSWORD 'your_secure_password_here';
   GRANT ALL PRIVILEGES ON DATABASE ems_db TO ems_user;
   \q
   ```
   Replace `'your_secure_password_here'` with a strong password.

### Step 2: Install TimescaleDB Extension

1. **Using pgAdmin 4:**
   - Connect to `ems_db` database
   - Open Query Tool (Tools → Query Tool)
   - Run:
     ```sql
     CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
     ```
   - Click Execute (F5)

2. **Using psql:**
   ```powershell
   psql -U postgres -d ems_db
   ```
   Then run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
   \q
   ```

### Step 3: Configure PostgreSQL (Optional but Recommended)

For high-performance deployment, configure PostgreSQL settings:

1. Find `postgresql.conf`:
   - Usually located at: `C:\Program Files\PostgreSQL\<version>\data\postgresql.conf`
   - Or find it using:
     ```sql
     SHOW config_file;
     ```

2. Edit `postgresql.conf` with recommended settings (see `backend/POSTGRESQL_CONFIG.md`)

3. Restart PostgreSQL service:
   ```powershell
   Restart-Service postgresql-x64-<version>
   ```
   Replace `<version>` with your PostgreSQL version number.

---

## Application Setup

### Step 1: Create Environment File

1. Navigate to `backend` folder:
   ```powershell
   cd backend
   ```

2. Create `.env` file (copy from example or create new):
   ```powershell
   # Copy the example (if it exists)
   Copy-Item .env.example .env
   
   # Or create new .env file
   New-Item .env -ItemType File
   ```

3. Edit `.env` file with your database credentials:
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=ems_db
   DB_USER=ems_user
   DB_PASSWORD=your_secure_password_here
   
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
   
   # Kafka (optional, set to false if not using)
   KAFKA_ENABLED=false
   KAFKA_BROKERS=localhost:9092
   ```

   **Important**: Replace `your_secure_password_here` with the password you set for `ems_user`.

### Step 2: Build the Application

1. Build the backend:
   ```powershell
   cd backend
   npm run build
   cd ..
   ```

2. Build the frontend (if needed):
   ```powershell
   npm run build
   ```

---

## Configuration

### Database Connection Test

Test database connection before starting the application:

```powershell
cd backend
npm run migrate
```

This will:
- Test database connection
- Create necessary tables
- Initialize schema

If you see connection errors, verify:
- PostgreSQL service is running
- Database credentials in `.env` are correct
- Firewall allows connections on port 5432

### Performance Tuning (Optional)

For high-performance deployment with 64GB RAM and SSD:

1. Review `backend/POSTGRESQL_CONFIG.md` for PostgreSQL settings
2. Adjust environment variables in `.env` as needed
3. See `backend/DEPLOYMENT_OPTIMIZATIONS.md` for optimization details

---

## Running the Application

### Development Mode

**Terminal 1 - Backend:**
```powershell
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```powershell
npm run dev
```

The application will be available at:
- Frontend: `http://localhost:5173` (or port shown in terminal)
- Backend API: `http://localhost:3001`

### Production Mode

**Terminal 1 - Backend:**
```powershell
cd backend
npm start
```

**Terminal 2 - Frontend:**
```powershell
npm run build
npm run preview
```

Or use a process manager like PM2 for production:
```powershell
# Install PM2 globally
npm install -g pm2

# Start backend
cd backend
pm2 start dist/index.js --name ems-backend

# Start frontend (build first)
npm run build
pm2 serve dist --name ems-frontend --port 5173
```

---

## First-Time Setup

### 1. Create Admin User

The application should create a default admin user on first run. If not, you may need to:

1. Access the database and insert a user manually, or
2. Use the registration endpoint (if available)

### 2. Add Devices

1. Log in to the application
2. Navigate to Devices section
3. Click "Add Device"
4. Fill in device details:
   - Device name
   - Device type (PM8000, PM5320, EM6400, MICROLOGIC_6E)
   - IP address
   - Slave address (usually 1 or 255)
5. Save the device

### 3. Verify Data Collection

1. Check device status (should show "online" if connected)
2. View device parameters in real-time
3. Check backend logs for collection messages

---

## Troubleshooting

### PostgreSQL Connection Issues

**Error: "Connection refused" or "ECONNREFUSED"**

1. Check PostgreSQL service is running:
   ```powershell
   Get-Service -Name "*postgresql*"
   ```

2. Start PostgreSQL service if stopped:
   ```powershell
   Start-Service postgresql-x64-<version>
   ```

3. Verify port 5432 is not blocked by firewall

**Error: "Authentication failed"**

1. Verify username and password in `.env` file
2. Check user exists in PostgreSQL:
   ```sql
   \du
   ```

3. Reset password if needed:
   ```sql
   ALTER USER ems_user WITH PASSWORD 'new_password';
   ```

### Python Script Execution Issues

**Error: "python3 not found" or "python not found"**

1. Verify Python is installed:
   ```powershell
   python --version
   ```

2. Check Python is in PATH:
   ```powershell
   $env:PATH -split ';' | Select-String python
   ```

3. Reinstall Python with "Add to PATH" checked

**Error: "pymodbus not found"**

1. Install pymodbus:
   ```powershell
   pip install pymodbus
   ```

2. Verify installation:
   ```powershell
   pip list | Select-String pymodbus
   ```

### Port Already in Use

**Error: "Port 3001 already in use"**

1. Find process using port 3001:
   ```powershell
   netstat -ano | findstr :3001
   ```

2. Kill the process (replace PID with actual process ID):
   ```powershell
   taskkill /PID <PID> /F
   ```

   Or restart the application - it should automatically kill the process.

### Database Schema Issues

**Error: "Table does not exist"**

1. Run migration:
   ```powershell
   cd backend
   npm run migrate
   ```

2. Or initialize schema manually (check `backend/src/db/schema.ts`)

### TimescaleDB Extension Issues

**Error: "Extension timescaledb does not exist"**

1. Install TimescaleDB (see Prerequisites section)
2. Or continue without TimescaleDB (system will work but without time-series optimizations)

---

## Windows Service Installation (Optional)

To run EMS as a Windows service:

1. Install `node-windows`:
   ```powershell
   npm install -g node-windows
   ```

2. Create service script (create `install-service.js`):
   ```javascript
   const Service = require('node-windows').Service;
   const svc = new Service({
     name: 'EMS Backend',
     description: 'Energy Monitoring System Backend',
     script: 'C:\\EMS\\ems\\backend\\dist\\index.js',
     nodeOptions: []
   });
   svc.on('install', () => svc.start());
   svc.install();
   ```

3. Run the script:
   ```powershell
   node install-service.js
   ```

---

## Maintenance

### Database Backup

Regular backups are recommended:

```powershell
# Backup database
pg_dump -U ems_user -d ems_db > backup_$(Get-Date -Format "yyyyMMdd").sql

# Restore database
psql -U ems_user -d ems_db < backup_20240101.sql
```

### Logs

- Backend logs: Check console output or log files
- Database logs: `C:\Program Files\PostgreSQL\<version>\data\log\`

### Updates

1. Pull latest changes (if using Git):
   ```powershell
   git pull
   ```

2. Install dependencies:
   ```powershell
   npm install
   cd backend
   npm install
   cd ..
   ```

3. Rebuild:
   ```powershell
   cd backend
   npm run build
   cd ..
   npm run build
   ```

4. Restart application

---

## Support

For issues or questions:
- Check `backend/DEPLOYMENT_OPTIMIZATIONS.md` for performance tuning
- Check `backend/ENV_VARIABLES.md` for configuration options
- Check `backend/POSTGRESQL_CONFIG.md` for database optimization
- Contact: vemconindustries@gmail.com

---

## Quick Reference

### Essential Commands

```powershell
# Start backend (development)
cd backend
npm run dev

# Start frontend (development)
npm run dev

# Build backend
cd backend
npm run build

# Build frontend
npm run build

# Test database connection
cd backend
npm run migrate

# Check PostgreSQL service
Get-Service -Name "*postgresql*"

# Check Node.js version
node --version

# Check Python version
python --version
```

### Important Files

- `.env` - Backend configuration (database credentials, etc.)
- `backend/src/config/performance.config.ts` - Performance settings
- `backend/POSTGRESQL_CONFIG.md` - Database optimization guide
- `backend/ENV_VARIABLES.md` - Environment variables reference

---

**Installation Complete!** 🎉

Your EMS system should now be running. Access it at `http://localhost:5173` (or the port shown in your terminal).

