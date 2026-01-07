# Start Production Mode Script
# This script builds everything and starts the app in production mode

Write-Host "Building Energy Monitoring System for Production" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: Please run this script from the project root directory" -ForegroundColor Red
    exit 1
}

# Step 1: Build backend
Write-Host "Step 1: Building backend..." -ForegroundColor Yellow
Set-Location backend
if (-not (Test-Path "dist\index.js")) {
    Write-Host "  Building TypeScript..." -ForegroundColor Gray
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Backend build failed!" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
} else {
    Write-Host "  Backend already built" -ForegroundColor Green
}
Set-Location ..

# Step 2: Build frontend
Write-Host "Step 2: Building frontend..." -ForegroundColor Yellow
if (-not (Test-Path "dist\index.html")) {
    Write-Host "  Building React app..." -ForegroundColor Gray
    npm run build:dev
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Frontend build failed!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  Frontend already built" -ForegroundColor Green
}

# Step 3: Build Electron
Write-Host "Step 3: Building Electron app..." -ForegroundColor Yellow
npm run build:win
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Electron build failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Build complete! Starting application..." -ForegroundColor Green
Write-Host ""

# Step 4: Start the app
$exePath = "release\win-unpacked\Energy Monitoring System.exe"
if (Test-Path $exePath) {
    Write-Host "Starting: $exePath" -ForegroundColor Cyan
    Start-Process -FilePath $exePath
    Write-Host "Application started!" -ForegroundColor Green
} else {
    Write-Host "ERROR: Executable not found at: $exePath" -ForegroundColor Red
    Write-Host "Please build the app first: npm run build:win" -ForegroundColor Yellow
    exit 1
}

