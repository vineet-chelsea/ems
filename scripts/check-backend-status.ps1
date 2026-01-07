# Check Backend Status Script
# This script helps diagnose why the backend might not be starting

Write-Host "=== Backend Status Check ===" -ForegroundColor Cyan
Write-Host ""

# Check if backend process is running
Write-Host "1. Checking for backend Node.js process..." -ForegroundColor Yellow
$backendProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { 
    $_.CommandLine -like "*backend*" -or $_.Path -like "*backend*"
}
if ($backendProcess) {
    Write-Host "   ✓ Backend Node.js process found (PID: $($backendProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "   ✗ No backend Node.js process found" -ForegroundColor Red
}

# Check if port 3001 is in use
Write-Host ""
Write-Host "2. Checking if port 3001 is listening..." -ForegroundColor Yellow
$port3001 = netstat -ano | findstr ":3001" | findstr "LISTENING"
if ($port3001) {
    Write-Host "   ✓ Port 3001 is listening" -ForegroundColor Green
    Write-Host "   $port3001" -ForegroundColor Gray
} else {
    Write-Host "   ✗ Port 3001 is not listening" -ForegroundColor Red
}

# Check if backend health endpoint responds
Write-Host ""
Write-Host "3. Checking backend health endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "   ✓ Backend health check passed" -ForegroundColor Green
    Write-Host "   Response: $($response.Content)" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Backend health check failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Check Docker containers
Write-Host ""
Write-Host "4. Checking Docker containers..." -ForegroundColor Yellow
try {
    $dockerPs = docker ps --format "table {{.Names}}\t{{.Status}}" 2>&1
    if ($LASTEXITCODE -eq 0) {
        $emsContainers = $dockerPs | Select-String "ems_"
        if ($emsContainers) {
            Write-Host "   ✓ Docker containers found:" -ForegroundColor Green
            $emsContainers | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
        } else {
            Write-Host "   ⚠ No EMS Docker containers running" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   ✗ Docker not available or not running" -ForegroundColor Red
    }
} catch {
    Write-Host "   ✗ Could not check Docker: $_" -ForegroundColor Red
}

# Check PostgreSQL
Write-Host ""
Write-Host "5. Checking PostgreSQL connection..." -ForegroundColor Yellow
$pgPort = netstat -ano | findstr ":5432" | findstr "LISTENING"
if ($pgPort) {
    Write-Host "   ✓ PostgreSQL is listening on port 5432" -ForegroundColor Green
} else {
    Write-Host "   ✗ PostgreSQL is not listening on port 5432" -ForegroundColor Red
    Write-Host "   → Start Docker containers or local PostgreSQL service" -ForegroundColor Yellow
}

# Check backend directory in Electron build
Write-Host ""
Write-Host "6. Checking backend in Electron build..." -ForegroundColor Yellow
$buildBackend = "release\win-unpacked\resources\backend"
if (Test-Path $buildBackend) {
    Write-Host "   ✓ Backend directory found in build" -ForegroundColor Green
    $backendIndex = "$buildBackend\dist\index.js"
    if (Test-Path $backendIndex) {
        Write-Host "   ✓ Backend index.js found" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Backend index.js not found (backend not built?)" -ForegroundColor Red
    }
    $backendNodeModules = "$buildBackend\node_modules"
    if (Test-Path $backendNodeModules) {
        Write-Host "   ✓ Backend node_modules found" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Backend node_modules not found" -ForegroundColor Red
    }
} else {
    Write-Host "   ✗ Backend directory not found in build" -ForegroundColor Red
    Write-Host "   → Run: npm run build:win" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Check Complete ===" -ForegroundColor Cyan

