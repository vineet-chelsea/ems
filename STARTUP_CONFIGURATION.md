# Startup Configuration Guide

This document describes how the Energy Monitoring System is configured to start automatically on system startup.

## Features

### 1. Desktop Icon
- **Automatic Creation**: A desktop shortcut is automatically created during installation
- **Location**: Desktop shortcut named "Energy Monitoring System"
- **Icon**: Uses `build/icon.ico` for Windows
- **Configuration**: Set in `package.json` → `build.nsis.createDesktopShortcut: true`

### 2. Auto-Start on System Boot
- **Enabled by Default**: The application automatically enables auto-start when first launched in production mode
- **Implementation**: Uses `auto-launch` package
- **Location**: Windows Startup folder (managed automatically)
- **Configuration**: Set in `electron/main.ts` - automatically enabled on first run

### 3. Backend Startup
The backend starts automatically when the Electron app launches in production mode. It uses a two-tier approach:

#### Primary Method: Docker (if available)
- Checks if Docker is installed and running
- Starts Docker containers using `docker-compose.yml`
- Waits for backend to be ready on port 3001

#### Fallback Method: Direct Backend Start
- If Docker is not available or fails to start
- Starts the backend Node.js process directly
- Uses the built backend from `backend/dist/index.js`
- Automatically manages the backend process lifecycle

## Configuration Files

### package.json
```json
{
  "build": {
    "nsis": {
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "Energy Monitoring System"
    }
  }
}
```

### electron/main.ts
- Auto-launch initialization and enabling
- Backend startup logic (Docker or direct)
- Process management

## How It Works

### On First Launch (Production Mode)
1. Electron app starts
2. Auto-launch is checked and enabled if not already enabled
3. Backend services are started:
   - First tries Docker containers
   - Falls back to direct Node.js process if Docker unavailable
4. Frontend window opens after backend is ready

### On System Startup
1. Windows starts the application from Startup folder
2. Application follows the same startup sequence as above
3. Both frontend and backend are ready automatically

## Manual Control

Users can control auto-start through the application settings:
- Open the application
- Navigate to Settings
- Toggle "Launch on System Startup" option
- Changes take effect immediately

## Troubleshooting

### Desktop Icon Not Created
- Ensure the build completed successfully
- Check that `build/icon.ico` exists
- Rebuild the application: `npm run build`

### Auto-Start Not Working
- Check Windows Startup folder: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`
- Verify auto-launch is enabled in app settings
- Check application logs: `%APPDATA%\Energy Monitoring System\logs\`

### Backend Not Starting
- Check if Docker is installed and running
- Verify backend is built: `cd backend && npm run build`
- Check application logs for errors
- Ensure port 3001 is not in use by another application

## Production Build

To create a production build with all startup features:

```bash
# Build frontend
npm run build

# Build backend
cd backend
npm run build
cd ..

# Build Electron app
npm run build:win
```

The installer will:
- Create desktop shortcut automatically
- Install the application
- Enable auto-start on first launch

## Notes

- Auto-start only works in production mode (packaged app)
- In development mode, auto-start is disabled
- Backend process is automatically cleaned up when app closes
- Docker containers can optionally be stopped on app close (currently disabled)

