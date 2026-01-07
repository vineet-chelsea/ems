# Windows Services Setup Guide

This guide explains how to set up the Energy Monitoring System to run as Windows services (similar to systemd on Linux), so both backend and frontend start automatically on system boot.

## Overview

Instead of relying on Electron's auto-launch, we'll use Windows Scheduled Tasks to:
- Start backend automatically on boot
- Start frontend (Electron app) automatically on boot
- Manage services like systemctl on Linux

## Installation

### Step 1: Build Backend

```powershell
cd backend
npm run build
cd ..
```

### Step 2: Install Windows Services

Run as Administrator:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-windows-services.ps1
```

Or use npm:

```powershell
npm run install-services
```

This will:
- Create a scheduled task "EMS-Backend" that starts on system boot
- Configure it to run the backend Node.js process
- Set up auto-restart on failure

## Service Management

### Check Status

```powershell
npm run status-services
# Or directly:
powershell -ExecutionPolicy Bypass -File scripts/status-services.ps1
```

### Start Services Manually

```powershell
npm run start-services
# Or directly:
powershell -ExecutionPolicy Bypass -File scripts/start-services.ps1
```

### Stop Services

```powershell
npm run stop-services
# Or directly:
powershell -ExecutionPolicy Bypass -File scripts/stop-services.ps1
```

### Uninstall Services

```powershell
npm run uninstall-services
# Or directly (as Administrator):
powershell -ExecutionPolicy Bypass -File scripts/uninstall-windows-services.ps1
```

## Manual Service Management (PowerShell)

### View All Tasks

```powershell
Get-ScheduledTask -TaskName EMS-*
```

### Start Backend Service

```powershell
Start-ScheduledTask -TaskName "EMS-Backend"
```

### Stop Backend Service

```powershell
Stop-ScheduledTask -TaskName "EMS-Backend"
```

### Check Service Status

```powershell
Get-ScheduledTask -TaskName "EMS-Backend" | Select-Object TaskName, State
```

### View Service Details

```powershell
Get-ScheduledTask -TaskName "EMS-Backend" | Get-ScheduledTaskInfo
```

## How It Works

### Backend Service

- **Task Name**: `EMS-Backend`
- **Trigger**: System startup
- **Action**: Runs `node dist/index.js` in the backend directory
- **Restart**: Automatically restarts up to 3 times if it fails
- **User**: Runs as current user (interactive)

### Frontend Service

The Electron app uses its built-in auto-launch feature, which:
- Registers itself in Windows Startup folder
- Starts automatically when user logs in
- Can be toggled from within the app settings

## Verification

After installation and reboot:

1. **Check Backend**:
   ```powershell
   npm run status-services
   ```
   Should show: "API: Responding"

2. **Check Frontend**:
   - Look for "Energy Monitoring System" in Task Manager
   - Window should appear automatically

3. **Test API**:
   ```powershell
   Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing
   ```

## Troubleshooting

### Backend Not Starting

1. Check if backend is built:
   ```powershell
   Test-Path "backend\dist\index.js"
   ```

2. Check task status:
   ```powershell
   Get-ScheduledTask -TaskName "EMS-Backend" | Get-ScheduledTaskInfo
   ```

3. Check task history:
   ```powershell
   Get-WinEvent -LogName Microsoft-Windows-TaskScheduler/Operational | Where-Object {$_.Message -like "*EMS-Backend*"} | Select-Object -First 10
   ```

4. Manually test backend:
   ```powershell
   cd backend
   node dist/index.js
   ```

### Frontend Not Starting

1. Check auto-launch status in app settings
2. Verify shortcut exists on desktop
3. Check Windows Startup folder:
   ```powershell
   Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
   ```

### Service Fails to Start

1. Check if running as Administrator when installing
2. Verify Node.js is in PATH
3. Check backend build exists
4. Review Windows Event Viewer for errors

## Alternative: Using NSSM (Non-Sucking Service Manager)

For more advanced service management, you can use NSSM:

1. Download NSSM: https://nssm.cc/download
2. Install backend service:
   ```powershell
   nssm install EMS-Backend "C:\Program Files\nodejs\node.exe" "D:\ems\backend\dist\index.js"
   nssm set EMS-Backend AppDirectory "D:\ems\backend"
   nssm start EMS-Backend
   ```

## Notes

- Services run as the current user (not SYSTEM) to access user files
- Backend runs in background (no window)
- Frontend (Electron) shows a window
- Both restart automatically on system boot
- Services can be managed like Linux systemd services

