# Backend Startup Fixes

## Issues Fixed

### 1. ES Module Import Error
**Problem**: `electron/main.ts` was using `require('fs')` in an ES module file, causing runtime errors.

**Fix**: Changed to `import * as fs from 'fs'` at the top of the file.

### 2. Health Check Endpoint Mismatch
**Problem**: Frontend was calling `/api/health` but backend serves `/health` directly.

**Fix**: Updated `src/services/api.ts` to call the health endpoint without the `/api` prefix:
- Health endpoint: `http://localhost:3001/health` (not `/api/health`)

### 3. Improved Error Handling
**Enhancements**:
- Added detailed logging for backend startup process
- Added Node.js version check
- Improved error messages with stack traces
- Better process exit code handling

## Testing the Fixes

1. **Launch the Electron app** from the desktop shortcut or `release/win-unpacked/Energy Monitoring System.exe`

2. **Check the logs**:
   - The app should log backend startup messages
   - Look for: "Starting backend directly...", "Backend path: ...", "Backend process spawned with PID: ..."
   - Check for any error messages

3. **Verify backend is running**:
   - Open browser and go to `http://localhost:3001/health`
   - Should return: `{"status":"ok","database":"connected"}`

4. **Test login**:
   - Try logging in through the frontend
   - Should no longer see "failed to fetch" error

## Troubleshooting

### If backend still doesn't start:

1. **Check backend build**:
   ```powershell
   cd backend
   npm run build
   ```
   Ensure `backend/dist/index.js` exists.

2. **Check backend dependencies**:
   The backend's `node_modules` are excluded from the Electron package.
   If the backend needs dependencies at runtime, you may need to:
   - Include `backend/node_modules` in the build (makes package larger)
   - Or ensure all dependencies are bundled in the backend build

3. **Check logs**:
   - Look for error messages in the Electron console (if DevTools is open)
   - Check Windows Event Viewer for application errors
   - The app logs should show detailed backend startup information

4. **Manual backend test**:
   ```powershell
   cd backend
   node dist/index.js
   ```
   This should start the backend on port 3001. If this fails, the issue is with the backend itself, not the Electron integration.

### If "failed to fetch" still occurs:

1. **Verify backend is running**:
   - Check `http://localhost:3001/health` in browser
   - If it doesn't respond, backend isn't starting

2. **Check CORS**:
   - Backend should have CORS enabled (it does in `backend/src/index.ts`)

3. **Check API URL**:
   - Frontend uses `http://localhost:3001/api` by default
   - Verify this matches your backend configuration

## Next Steps

If backend dependencies are missing in production:
1. Consider including `backend/node_modules` in the Electron package
2. Or use a bundler like `pkg` or `nexe` to create a standalone backend executable
3. Or install backend dependencies at app startup (not recommended for production)

