# EMS Quick Installation Guide

**Complete setup in 5 steps - No hassle, everything works!**

---

## Prerequisites (Install Once)

### 1. Node.js (v18 or higher)
- Download: https://nodejs.org/
- Install the **LTS version**
- Verify: `node --version` (should show v18+)

### 2. PostgreSQL with TimescaleDB
- Download PostgreSQL: https://www.postgresql.org/download/windows/
- During installation:
  - Set a **strong password** for `postgres` user (remember this!)
  - Port: **5432** (default)
- After PostgreSQL, install TimescaleDB:
  - Download: https://docs.timescale.com/install/latest/self-hosted/
  - Run installer (auto-detects PostgreSQL)

### 3. Python 3.8+
- Download: https://www.python.org/downloads/
- **IMPORTANT**: Check "Add Python to PATH" during installation
- Verify: `python --version`

### 4. Install Python Package
```powershell
pip install pymodbus
```

---

## Installation Steps

### Step 1: Clone Repository

**Important:** Clone the correct branch that has all the latest features:
```powershell
# Clone the repository
git clone <your-repository-url>
cd ems

# Switch to the branch with all features (if not already on it)
git checkout db-creds-history-26fbd

# Or clone directly with the branch:
# git clone -b db-creds-history-26fbd <your-repository-url>
```

**Verify the setup script exists:**
```powershell
Test-Path backend/scripts/setup-db.js
# Should return: True
```

### Step 2: Install Frontend Dependencies
```powershell
# Make sure you're in the 'ems' root directory
Get-Location
# Should show: ...\ems

# Install
npm install
```

### Step 3: Install Backend Dependencies
```powershell
# Navigate to backend
cd backend

# Verify you're in backend
Get-Location
# Should show: ...\ems\backend

# Install
npm install

# Go back to root
cd ..
```

### Step 4: Setup Database

**Option A: Using Setup Script (Recommended)**

**Important:** Make sure you're on the correct branch and have the latest code:
```powershell
# Check current branch
git branch

# If needed, switch to the branch with setup-db script
# (usually 'db-creds-history-26fbd' or 'main')
git pull origin db-creds-history-26fbd

# Verify the script exists
Test-Path backend/scripts/setup-db.js
# Should return: True
```

Then run:
```powershell
cd backend
npm run setup-db
# Follow prompts to enter PostgreSQL password
cd ..
```

**Option B: Manual Setup**
```powershell
# Connect to PostgreSQL
psql -U postgres

# Run these commands in psql:
CREATE DATABASE ems_db;
CREATE USER ems_user WITH PASSWORD 'your_password_here';
GRANT ALL PRIVILEGES ON DATABASE ems_db TO ems_user;
\q

# Run migration
cd backend
npm run migrate
cd ..
```

### Step 5: Build and Start

**Build Frontend:**
```powershell
# From root directory
npm run build
```

**Build Backend:**
```powershell
cd backend
npm run build
# This will compile TypeScript AND copy JSON mapping files
cd ..
```

**Start Backend:**
```powershell
cd backend
npm start
# Backend runs on http://localhost:3001
```

**Start Frontend (in another terminal):**
```powershell
# Option 1: Using http-server
npx http-server dist -p 5173

# Option 2: Using Python
cd dist
python -m http.server 5173
```

**Access Application:**
- Open browser: http://localhost:5173
- Default login: `admin` / `admin123`

---

## Configuration (Optional)

### Database Connection
Edit `backend/.env` (created after first run):
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ems_db
DB_USER=ems_user
DB_PASSWORD=your_password
```

### Performance Settings
Edit `backend/src/config/performance.config.ts` or use environment variables (see `backend/ENV_VARIABLES.md`)

---

## Troubleshooting

### "Cannot find module" errors
**Solution:** Make sure you ran `npm install` in both root AND backend directories

### "Mapping file not found" errors
**Solution:** Run `npm run build` in backend directory to copy JSON files

### Database connection errors
**Solution:** 
1. Check PostgreSQL is running: `Get-Service postgresql*`
2. Verify credentials in `backend/.env`
3. Test connection: `psql -U ems_user -d ems_db -h localhost`

### Port already in use
**Solution:** Change port in `backend/.env`: `PORT=3002`

### Python script errors
**Solution:**
1. Verify Python: `python --version`
2. Install pymodbus: `pip install pymodbus`
3. Check Python is in PATH: `where python`

---

## Verification Checklist

After installation, verify:

- [ ] Node.js installed: `node --version`
- [ ] Python installed: `python --version`
- [ ] PostgreSQL running: `Get-Service postgresql*`
- [ ] Frontend dependencies: `Test-Path node_modules` (in root)
- [ ] Backend dependencies: `Test-Path backend/node_modules`
- [ ] Mapping files exist: `Test-Path backend/src/config/pm5320_mappings.json`
- [ ] Database exists: `psql -U ems_user -d ems_db -c "SELECT 1"`
- [ ] Backend builds: `cd backend && npm run build`
- [ ] Frontend builds: `npm run build`
- [ ] Backend starts: `cd backend && npm start` (no errors)
- [ ] Frontend accessible: http://localhost:5173

---

## Quick Commands Reference

```powershell
# Install everything
npm install                    # Frontend (from root)
cd backend && npm install     # Backend

# Build everything
npm run build                 # Frontend (from root)
cd backend && npm run build   # Backend

# Start everything
cd backend && npm start       # Backend (Terminal 1)
npx http-server dist -p 5173  # Frontend (Terminal 2)

# Database
cd backend && npm run migrate # Setup database schema
```

---

## What Gets Installed

- **Frontend**: React app with all UI components
- **Backend**: Node.js API server with TypeScript
- **Database**: PostgreSQL with TimescaleDB extension
- **Mappings**: All device parameter mappings (PM5320, PM8000, EM6400, Micrologic 6E)
- **Scripts**: Python Modbus scripts for data collection

---

## Next Steps

1. **Add Devices**: Login and add your Modbus devices
2. **Configure**: Adjust performance settings if needed
3. **Monitor**: View real-time data and generate reports

---

## Need Help?

- Check `INSTALLATION_GUIDE.md` for detailed steps
- Check `TROUBLESHOOTING.md` for common issues
- Check `backend/ENV_VARIABLES.md` for configuration options

---

**That's it! Your EMS system is ready to use.**

