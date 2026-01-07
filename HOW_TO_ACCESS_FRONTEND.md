# How to Access the Frontend

## Production Mode (Built App)

The frontend is accessed through the **Electron desktop application window**:

### Method 1: Desktop Shortcut
- Double-click the **"Energy Monitoring System"** shortcut on your desktop
- The Electron window will open showing the frontend interface

### Method 2: Direct Executable
- Navigate to: `release\win-unpacked\Energy Monitoring System.exe`
- Double-click to launch

### Method 3: Windows Service (Auto-start)
- If you've installed Windows services, the app will start automatically on system boot
- The window will appear automatically when you log in

## Development Mode

In development, you have two options:

### Option 1: Electron Window (Recommended)
```powershell
npm run electron:dev
```
This launches the Electron app with the frontend loaded inside it.

### Option 2: Web Browser (for testing)
```powershell
npm run dev
```
Then open your browser and go to:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001

**Note**: In development, the Vite dev server runs on port 5173, but the Electron app will automatically connect to it.

## Access Points Summary

| Mode | Frontend Access | Backend API |
|------|----------------|-------------|
| **Production** | Electron app window | http://localhost:3001 |
| **Development** | Electron window OR http://localhost:5173 | http://localhost:3001 |

## Important Notes

1. **The frontend is NOT a standalone web server** - it's designed to run inside Electron
2. **In production**, the frontend files are bundled into the Electron app (in `dist/` folder)
3. **The Electron window IS the frontend** - there's no separate web interface
4. **Backend API** is always accessible at `http://localhost:3001` (if backend is running)

## Troubleshooting

### Frontend window not appearing?
1. Check if Electron app is running:
   ```powershell
   Get-Process -Name "Energy Monitoring System"
   ```
2. Check backend is running:
   ```powershell
   npm run status-services
   ```
3. Try launching manually:
   ```powershell
   .\release\win-unpacked\Energy Monitoring System.exe
   ```

### Want to access frontend in browser during development?
1. Start Vite dev server:
   ```powershell
   npm run dev
   ```
2. Open browser: http://localhost:5173
3. **Note**: Some Electron-specific features may not work in browser mode

