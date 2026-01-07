# Backend Connection Troubleshooting Guide

## Problem: `ERR_CONNECTION_REFUSED` on `localhost:3001`

This error means the backend API server is not running or not accessible.

## Quick Diagnosis

Run the diagnostic script:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-backend-status.ps1
```

This will check:
1. Backend Node.js process
2. Port 3001 status
3. Backend health endpoint
4. Docker containers
5. PostgreSQL connection
6. Backend files in Electron build

## Common Causes & Solutions

### 1. PostgreSQL Service Not Running

**Symptom**: Backend can't connect to PostgreSQL

**Solution**: Start PostgreSQL Windows Service
```powershell
# Check PostgreSQL service status
Get-Service -Name "*postgresql*"

# Start PostgreSQL service (replace with actual service name)
Start-Service -Name "postgresql-x64-XX"  # Replace XX with your version

# Or start via Services GUI:
# Win+R → services.msc → Find PostgreSQL → Start
```

**Note**: This application uses **local PostgreSQL service**, not Docker containers.

### 2. PostgreSQL Not Available

**Symptom**: Backend crashes with database connection errors

**Solutions**:

**Use Local PostgreSQL Service** (This is the configured setup)
- Ensure PostgreSQL service is running
- Verify it's listening on port 5432
- Check credentials match backend expectations:
  - Host: `localhost`
  - Port: `5432`
  - Database: `ems_db`
  - User: `ems_user`
  - Password: `ems_password`

### 3. Backend Process Not Starting

**Symptom**: No backend process found, port 3001 not listening

**Check**:
1. Open Electron app
2. Check console logs for backend startup messages
3. Look for errors like:
   - "Backend not found"
   - "Failed to start backend"
   - "Database connection failed"

**Solutions**:
- Ensure backend is built: `cd backend && npm run build`
- Rebuild Electron app: `npm run build:win`
- Check backend logs in Electron console

### 4. Backend Crashes Immediately

**Symptom**: Backend process starts then exits with error code

**Common Causes**:
- Database connection fails (PostgreSQL not running)
- Missing environment variables
- Missing dependencies

**Check Backend Logs**:
The Electron app should show backend output in the console. Look for:
- Database connection errors
- Missing module errors
- Configuration errors

## Step-by-Step Fix

### Step 1: Ensure Docker is Running
```powershell
# Check Docker status
docker info

# If Docker is not running, start Docker Desktop
```

### Step 2: Start Docker Containers
```powershell
# Navigate to project root
cd D:\ems

# Start all containers
docker-compose up -d

# Wait for containers to be ready (check logs)
docker-compose logs -f
```

### Step 3: Verify Backend Container
```powershell
# Check if backend container is running
docker ps | findstr ems_backend

# Check backend logs
docker logs ems_backend

# Check if backend is responding
curl http://localhost:3001/health
# Or in PowerShell:
Invoke-WebRequest -Uri http://localhost:3001/health
```

### Step 4: If Using Direct Backend (No Docker)

**Prerequisites**:
- PostgreSQL must be running locally
- Database `ems_db` must exist
- User `ems_user` must exist with correct password

**Start Backend Manually**:
```powershell
cd backend
node dist/index.js
```

Check for errors in the console output.

## Electron App Startup Sequence

The Electron app starts the backend in this order:

1. **Skip Docker** (database is on local PostgreSQL service)
   - Start backend as Node.js process directly
   - Backend connects to local PostgreSQL on `localhost:5432`

2. **Backend startup requirements**:
   - PostgreSQL Windows service must be running
   - Database `ems_db` must exist
   - User `ems_user` with password `ems_password` must exist
   - Database connection must succeed (15 retries, up to 45 seconds)
   - If connection fails → Backend exits with error

3. **Backend startup requirements**:
   - PostgreSQL must be accessible
   - Database connection must succeed (15 retries, up to 45 seconds)
   - If connection fails → Backend exits with error

## Manual Testing

### Test Backend Health Endpoint
```powershell
# Should return: {"status":"ok","database":"connected"}
Invoke-WebRequest -Uri http://localhost:3001/health
```

### Test Backend API
```powershell
# Test login endpoint (should return error about missing credentials, not connection refused)
Invoke-WebRequest -Uri http://localhost:3001/api/auth/login -Method POST -ContentType "application/json" -Body '{"email":"test","password":"test"}'
```

## Logs Location

### Electron App Logs
- Open DevTools in Electron app (if enabled)
- Check console for backend startup messages
- Look for errors starting with `[Backend]`

### Docker Container Logs
```powershell
# Backend container logs
docker logs ems_backend

# PostgreSQL container logs
docker logs ems_postgres

# All containers logs
docker-compose logs
```

### Backend Process Logs (Direct Mode)
- Check Electron console output
- Backend stdout/stderr is logged to Electron console

## Still Not Working?

1. **Run diagnostic script**: `scripts/check-backend-status.ps1`
2. **Check Electron console** for detailed error messages
3. **Verify Docker containers** are running: `docker-compose ps`
4. **Check PostgreSQL** is accessible: `docker logs ems_postgres`
5. **Rebuild everything**:
   ```powershell
   cd backend
   npm run build
   cd ..
   npm run build:win
   ```

## Expected Behavior

When the Electron app starts successfully:
1. ✅ Docker containers start (or backend starts directly)
2. ✅ Backend connects to PostgreSQL (may take up to 45 seconds)
3. ✅ Backend starts listening on port 3001
4. ✅ Health endpoint responds: `http://localhost:3001/health`
5. ✅ Frontend can connect to backend API

If any step fails, check the logs for the specific error message.

