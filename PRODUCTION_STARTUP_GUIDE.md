# Production Startup Guide

This guide explains how to set up the Energy Monitoring System to run automatically on startup with both frontend and backend.

## Current Issues and Solutions

### Issue 1: Desktop Shortcut Not Working
**Problem**: Shortcut exists but doesn't launch the app properly.

**Solution**: 
1. The shortcut has been updated to point to the correct executable
2. Run the build script to ensure everything is built: `scripts/build-and-start.ps1`

### Issue 2: Backend and Frontend Not Starting on Startup
**Problem**: You have to manually run `npm start` for backend and frontend.

**Solution**: 
- **Frontend**: In production mode, the frontend is built into static files and served by Electron (no separate process needed)
- **Backend**: The Electron app automatically starts the backend when it launches

## How It Works

### Production Mode (Built App)
1. **Frontend**: Built into `dist/` folder, loaded directly by Electron (no Vite server needed)
2. **Backend**: Automatically started by Electron when the app launches
3. **Auto-Start**: Enabled automatically on first launch

### Development Mode
- Frontend: Vite dev server on port 5173
- Backend: Manual start with `npm start` in backend folder
- Electron: Loads from Vite dev server

## Setup Steps

### Step 1: Build Everything
Run the complete build script:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-and-start.ps1
```

This will:
1. Build backend (`backend/dist/`)
2. Build frontend (`dist/`)
3. Build Electron app (`release/win-unpacked/`)
4. Create desktop shortcut
5. Start the application

### Step 2: Verify Auto-Start
After the app launches:
1. Check Windows Startup folder or Task Manager → Startup tab
2. The app should be listed as "Energy Monitoring System"
3. Restart your computer to verify it starts automatically

### Step 3: Verify Backend Starts
When the app launches:
1. Check the application logs (should show "Backend API server running on port 3001")
2. The backend starts automatically - no manual `npm start` needed
3. Frontend loads automatically - no separate Vite server needed

## Manual Build Process

If you prefer to build manually:

```powershell
# 1. Build backend
cd backend
npm run build
cd ..

# 2. Build frontend
npm run build:dev

# 3. Build Electron app
npm run build:win

# 4. Create desktop shortcut
powershell -ExecutionPolicy Bypass -File scripts/create-desktop-shortcut.ps1

# 5. Start the app
.\release\win-unpacked\Energy Monitoring System.exe
```

## Troubleshooting

### Desktop Shortcut Doesn't Work
1. Check if executable exists: `Test-Path "release\win-unpacked\Energy Monitoring System.exe"`
2. Recreate shortcut: `powershell -ExecutionPolicy Bypass -File scripts/create-desktop-shortcut.ps1`
3. Verify shortcut target: Right-click shortcut → Properties → Check "Target" field

### Backend Doesn't Start
1. Check if backend is built: `Test-Path "backend\dist\index.js"`
2. If not built: `cd backend && npm run build`
3. Rebuild Electron app: `npm run build:win`
4. Check logs in: `%APPDATA%\Energy Monitoring System\logs\`

### Frontend Doesn't Load
1. Check if frontend is built: `Test-Path "dist\index.html"`
2. If not built: `npm run build:dev`
3. Rebuild Electron app: `npm run build:win`

### Auto-Start Not Working
1. Check if auto-launch is enabled in app settings
2. Verify in Windows Startup: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`
3. Check app logs for auto-launch errors

## Important Notes

- **Production mode**: Frontend and backend start automatically - no manual commands needed
- **Development mode**: You still need to run `npm start` in backend and `npm run dev` for frontend
- **First launch**: The app enables auto-start automatically
- **Desktop shortcut**: Created automatically on first launch in production mode

## Quick Start Command

For the easiest setup, just run:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-and-start.ps1
```

This does everything automatically!

