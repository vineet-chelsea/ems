# Start Development Environment
# This script starts both backend and frontend in separate windows

$ErrorActionPreference = "Continue"

# Get the project root directory (parent of scripts folder)
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $projectRoot "backend"

Write-Host "=== Energy Monitoring System - Development Startup ===" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is available
try {
    $nodeVersion = node --version
    Write-Host "[OK] Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Check if backend is built
$backendDist = Join-Path $backendPath "dist\index.js"
if (-not (Test-Path $backendDist)) {
    Write-Host "[WARN] Backend not built. Building now..." -ForegroundColor Yellow
    Set-Location $backendPath
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Backend build failed" -ForegroundColor Red
        exit 1
    }
    Set-Location $projectRoot
    Write-Host "[OK] Backend built successfully" -ForegroundColor Green
}

# Check if PostgreSQL is running
Write-Host ""
Write-Host "Checking PostgreSQL..." -ForegroundColor Yellow
$pgService = Get-Service -Name "*postgresql*" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Running" }
if ($pgService) {
    Write-Host "[OK] PostgreSQL service is running" -ForegroundColor Green
} else {
    Write-Host "[WARN] PostgreSQL service not found or not running" -ForegroundColor Yellow
    Write-Host "  Backend may fail to connect. Start PostgreSQL service if needed." -ForegroundColor Yellow
}

# Check if ports are available
Write-Host ""
Write-Host "Checking ports..." -ForegroundColor Yellow
$port3001 = netstat -ano | findstr ":3001" | findstr "LISTENING"
$port5173 = netstat -ano | findstr ":5173" | findstr "LISTENING"

if ($port3001) {
    Write-Host "[WARN] Port 3001 is already in use" -ForegroundColor Yellow
    Write-Host "  Backend may already be running or another service is using this port" -ForegroundColor Yellow
} else {
    Write-Host "[OK] Port 3001 is available" -ForegroundColor Green
}

if ($port5173) {
    Write-Host "[WARN] Port 5173 is already in use" -ForegroundColor Yellow
    Write-Host "  Frontend may already be running or another service is using this port" -ForegroundColor Yellow
} else {
    Write-Host "[OK] Port 5173 is available" -ForegroundColor Green
}

Write-Host ""
Write-Host "Starting services..." -ForegroundColor Cyan
Write-Host ""

# Start backend in a new window
Write-Host "Starting backend..." -ForegroundColor Yellow
$backendScript = @"
cd `"$backendPath`"
Write-Host `"=== Backend Server ===`" -ForegroundColor Green
Write-Host `"Starting on http://localhost:3001`" -ForegroundColor Cyan
npm run start
pause
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendScript

# Wait a moment for backend to start
Start-Sleep -Seconds 3

# Start frontend in a new window
Write-Host "Starting frontend (Electron)..." -ForegroundColor Yellow
$frontendScript = @"
cd `"$projectRoot`"
Write-Host `"=== Frontend (Electron) ===`" -ForegroundColor Green
Write-Host `"Starting Electron app...`" -ForegroundColor Cyan
npm run dev:electron
pause
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendScript

Write-Host ""
Write-Host "[OK] Both services started in separate windows" -ForegroundColor Green
Write-Host ""
Write-Host "Backend:  http://localhost:3001" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "Electron app should open automatically." -ForegroundColor Cyan
Write-Host ""
Write-Host "To stop services, close the PowerShell windows or press Ctrl+C in each window." -ForegroundColor Yellow
Write-Host ""
Write-Host "Press any key to close this window (services will continue running)..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

