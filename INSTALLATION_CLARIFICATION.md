# Installation Directory Clarification

## Understanding the Two package.json Files

This project has **TWO separate package.json files** for two different parts of the application:

### 1. Root Directory (`ems/package.json`)
- **Name:** `energy-monitoring-system`
- **Purpose:** Frontend React application
- **Location:** `C:\Users\vemco\EMS\ems\package.json`
- **Dependencies:** React, Vite, UI components, Electron (for desktop app)
- **Scripts:** `dev`, `build`, `preview` (frontend build commands)

### 2. Backend Directory (`ems/backend/package.json`)
- **Name:** `ems-backend`
- **Purpose:** Backend Node.js API server
- **Location:** `C:\Users\vemco\EMS\ems\backend\package.json`
- **Dependencies:** Express, PostgreSQL, TypeScript, etc.
- **Scripts:** `dev`, `build`, `start`, `migrate` (backend commands)

## How to Install Correctly

### Step 1: Install Frontend Dependencies

```powershell
# Make sure you're in the ROOT directory
cd C:\Users\vemco\EMS\ems

# Verify location
Get-Location
# Should show: C:\Users\vemco\EMS\ems

# Verify which package.json
Get-Content package.json | Select-String "name"
# Should show: "name": "energy-monitoring-system"

# Install frontend dependencies
npm install
# This installs: React, Vite, UI libraries, etc.
# Creates: node_modules/ in root directory
```

### Step 2: Install Backend Dependencies

```powershell
# Navigate to backend directory
cd backend

# Verify location
Get-Location
# Should show: C:\Users\vemco\EMS\ems\backend

# Verify which package.json
Get-Content package.json | Select-String "name"
# Should show: "name": "ems-backend"

# Install backend dependencies
npm install
# This installs: Express, PostgreSQL, TypeScript, etc.
# Creates: backend/node_modules/ in backend directory
```

## Visual Directory Structure

```
ems/
├── package.json          ← Frontend (React/Vite)
├── node_modules/         ← Frontend dependencies
├── src/                  ← Frontend source code
├── vite.config.ts        ← Frontend build config
│
└── backend/
    ├── package.json      ← Backend (Node.js/Express)
    ├── node_modules/     ← Backend dependencies
    ├── src/              ← Backend source code
    └── tsconfig.json     ← Backend TypeScript config
```

## How to Tell Which One You're Installing

### Check the Output

**Frontend install (root directory):**
```
npm install
# Output will show packages like:
# + react@18.3.1
# + vite@5.4.1
# + @radix-ui/react-*
# + electron@39.2.6
```

**Backend install (backend directory):**
```
npm install
# Output will show packages like:
# + express@4.18.2
# + pg@8.11.3
# + typescript@5.5.3
# + tsx@4.7.0
# + node-cron@3.0.3
```

### Check node_modules Location

**Frontend:**
```powershell
cd C:\Users\vemco\EMS\ems
Test-Path node_modules
# Should be: True
Get-ChildItem node_modules | Select-Object -First 5
# Should show: react, vite, etc.
```

**Backend:**
```powershell
cd C:\Users\vemco\EMS\ems\backend
Test-Path node_modules
# Should be: True
Get-ChildItem node_modules | Select-Object -First 5
# Should show: express, pg, typescript, etc.
```

## Quick Verification Commands

### Verify Frontend Installation
```powershell
cd C:\Users\vemco\EMS\ems
npm list react
# Should show: react@18.3.1
```

### Verify Backend Installation
```powershell
cd C:\Users\vemco\EMS\ems\backend
npm list express
# Should show: express@4.18.2
```

## Common Confusion Points

### Why They Seem Similar

1. **Both use npm** - Same package manager
2. **Both create node_modules** - Standard npm behavior
3. **Both show similar output** - npm install looks the same
4. **Both are in the same repo** - But separate projects

### The Key Difference

- **Root `npm install`** → Installs frontend dependencies (React, Vite, UI components)
- **Backend `npm install`** → Installs backend dependencies (Express, PostgreSQL, TypeScript)

### They Are NOT the Same

- Different `package.json` files
- Different dependencies
- Different `node_modules` folders
- Different purposes

## Installation Checklist

- [ ] Run `npm install` in root directory (frontend)
- [ ] Run `npm install` in backend directory (backend)
- [ ] Verify both `node_modules` folders exist
- [ ] Check that frontend has React/Vite
- [ ] Check that backend has Express/PostgreSQL

## Troubleshooting

### If npm install seems to do the same thing:

1. **Check your current directory:**
   ```powershell
   Get-Location
   ```

2. **Check which package.json is being used:**
   ```powershell
   Get-Content package.json | Select-String "name"
   ```

3. **Check where node_modules is created:**
   ```powershell
   Test-Path node_modules
   Test-Path ../node_modules
   ```

4. **Verify different packages are installed:**
   ```powershell
   # In root
   npm list react
   
   # In backend
   cd backend
   npm list express
   ```

## Summary

- **Two separate projects** in one repository
- **Two separate package.json files**
- **Two separate npm install commands** needed
- **Two separate node_modules folders** will be created
- They are **NOT the same** - each installs different dependencies

