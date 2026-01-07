# Complete Build and Start Script
# Builds backend, frontend, and Electron app, then starts it

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Energy Monitoring System - Full Build" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Kill any running instances first
Write-Host "Closing any running instances..." -ForegroundColor Yellow
Get-Process -Name "Energy Monitoring System" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "electron" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host ""

# Step 1: Build Backend
Write-Host "[1/3] Building Backend..." -ForegroundColor Yellow
Set-Location backend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Backend build failed!" -ForegroundColor Red
    Set-Location ..
    exit 1
}
Set-Location ..
Write-Host "  Backend built successfully" -ForegroundColor Green
Write-Host ""

# Step 2: Build Frontend
Write-Host "[2/3] Building Frontend..." -ForegroundColor Yellow
npm run build:dev
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Frontend build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Frontend built successfully" -ForegroundColor Green
Write-Host ""

# Step 3: Build Electron App
Write-Host "[3/3] Building Electron App..." -ForegroundColor Yellow
npm run build:win
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Electron build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Electron app built successfully" -ForegroundColor Green
Write-Host ""

# Step 4: Create Desktop Shortcut
Write-Host "Creating Desktop Shortcut..." -ForegroundColor Yellow
powershell -ExecutionPolicy Bypass -File scripts/create-desktop-shortcut.ps1
Write-Host ""

# Step 5: Start the Application
Write-Host "Starting Application..." -ForegroundColor Cyan
$exePath = "release\win-unpacked\Energy Monitoring System.exe"
if (Test-Path $exePath) {
    Start-Process -FilePath $exePath
    Write-Host "Application started!" -ForegroundColor Green
    Write-Host ""
    Write-Host "The app will:" -ForegroundColor White
    Write-Host "  - Start backend automatically" -ForegroundColor Gray
    Write-Host "  - Open frontend window" -ForegroundColor Gray
    Write-Host "  - Enable auto-start on system boot" -ForegroundColor Gray
} else {
    Write-Host "ERROR: Executable not found!" -ForegroundColor Red
    exit 1
}

