# Troubleshooting Guide

## Error: "Cannot find path backend/package.json because it does not exist"

### Problem
You're getting an error that `backend/package.json` cannot be found, even though the file exists.

### Solution

#### Step 1: Verify Your Current Directory

```powershell
# Check where you are
Get-Location

# Should show: C:\Users\vemco\EMS\ems
# If it shows something else, navigate to the correct directory:
cd C:\Users\vemco\EMS\ems
```

#### Step 2: Verify the File Exists

```powershell
# From the root ems directory, check if backend folder exists
Test-Path backend

# Should return: True

# Check if package.json exists in backend
Test-Path backend/package.json

# Should return: True

# List backend directory contents
Get-ChildItem backend | Select-Object Name
```

#### Step 3: Use Absolute Paths (If Relative Paths Fail)

If relative paths don't work, use absolute paths:

```powershell
# Get the full path
$rootPath = "C:\Users\vemco\EMS\ems"
$backendPath = Join-Path $rootPath "backend"
$packageJsonPath = Join-Path $backendPath "package.json"

# Verify it exists
Test-Path $packageJsonPath

# Navigate using absolute path
cd $backendPath
Get-Location
```

#### Step 4: Correct Installation Steps

**Frontend Installation (Root Directory):**
```powershell
# Make sure you're in root
cd C:\Users\vemco\EMS\ems

# Verify
Get-Location
# Should end with: \ems

# Verify package.json
Test-Path package.json
# Should be: True

# Install
npm install
```

**Backend Installation (Backend Directory):**
```powershell
# Navigate to backend
cd C:\Users\vemco\EMS\ems\backend

# OR from root:
cd backend

# Verify
Get-Location
# Should end with: \ems\backend

# Verify package.json
Test-Path package.json
# Should be: True

# If Test-Path returns False, check:
Get-ChildItem | Select-Object Name
# Should show: package.json, src, node_modules, etc.

# Install
npm install
```

### Common Causes

1. **Wrong Directory**: You're in a subdirectory or parent directory
   - **Fix**: Use `cd C:\Users\vemco\EMS\ems` to go to root

2. **Path with Spaces**: Path contains spaces causing issues
   - **Fix**: Use quotes: `cd "C:\Users\vemco\EMS\ems"`

3. **Case Sensitivity**: On some systems, case matters
   - **Fix**: Use exact case: `backend` not `Backend` or `BACKEND`

4. **Symlinks or Junctions**: If using symlinks, they might not resolve correctly
   - **Fix**: Use the actual physical path

5. **PowerShell Execution Policy**: Scripts might be blocked
   - **Fix**: Run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

### Verification Commands

Run these commands to verify everything is set up correctly:

```powershell
# 1. Check root directory structure
cd C:\Users\vemco\EMS\ems
Get-ChildItem -Directory | Select-Object Name
# Should show: backend, src, node_modules, etc.

# 2. Check backend directory structure
cd backend
Get-ChildItem | Select-Object Name
# Should show: package.json, src, node_modules, tsconfig.json, etc.

# 3. Verify package.json files
cd C:\Users\vemco\EMS\ems
Get-Content package.json | Select-String "name"
# Should show: "name": "energy-monitoring-system"

cd backend
Get-Content package.json | Select-String "name"
# Should show: "name": "ems-backend"
```

### Alternative: Use Full Paths in Commands

If you continue having issues, you can use full paths:

```powershell
# Install frontend (from anywhere)
Set-Location "C:\Users\vemco\EMS\ems"
npm install

# Install backend (from anywhere)
Set-Location "C:\Users\vemco\EMS\ems\backend"
npm install
```

### Still Having Issues?

1. **Check if you're in a Git repository:**
   ```powershell
   cd C:\Users\vemco\EMS\ems
   Test-Path .git
   # Should be: True
   ```

2. **Check if backend folder is actually a folder:**
   ```powershell
   cd C:\Users\vemco\EMS\ems
   (Get-Item backend).PSIsContainer
   # Should be: True
   ```

3. **List all files recursively to find package.json:**
   ```powershell
   cd C:\Users\vemco\EMS\ems
   Get-ChildItem -Recurse -Filter "package.json" | Select-Object FullName
   # Should show both: ...\ems\package.json and ...\ems\backend\package.json
   ```

4. **Check file permissions:**
   ```powershell
   cd C:\Users\vemco\EMS\ems\backend
   Get-Acl package.json | Format-List
   ```

### Quick Fix Script

Run this PowerShell script to verify and fix paths:

```powershell
# Set the root path
$rootPath = "C:\Users\vemco\EMS\ems"

# Verify root exists
if (-not (Test-Path $rootPath)) {
    Write-Host "ERROR: Root path does not exist: $rootPath" -ForegroundColor Red
    exit 1
}

# Verify backend exists
$backendPath = Join-Path $rootPath "backend"
if (-not (Test-Path $backendPath)) {
    Write-Host "ERROR: Backend folder does not exist: $backendPath" -ForegroundColor Red
    exit 1
}

# Verify package.json files
$rootPackageJson = Join-Path $rootPath "package.json"
$backendPackageJson = Join-Path $backendPath "package.json"

if (-not (Test-Path $rootPackageJson)) {
    Write-Host "ERROR: Root package.json not found: $rootPackageJson" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $backendPackageJson)) {
    Write-Host "ERROR: Backend package.json not found: $backendPackageJson" -ForegroundColor Red
    exit 1
}

Write-Host "✓ All paths verified successfully!" -ForegroundColor Green
Write-Host "Root: $rootPath" -ForegroundColor Green
Write-Host "Backend: $backendPath" -ForegroundColor Green
```

Save this as `verify-paths.ps1` and run it to check your setup.


