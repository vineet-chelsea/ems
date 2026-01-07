# Clean and Build Script
# Kills any running instances and cleans build directories before building

Write-Host "Cleaning and Building Energy Monitoring System" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Kill any running instances
Write-Host "[1/4] Checking for running instances..." -ForegroundColor Yellow
$processes = Get-Process -Name "Energy Monitoring System" -ErrorAction SilentlyContinue
if ($processes) {
    Write-Host "  Found running instances, closing them..." -ForegroundColor Gray
    $processes | Stop-Process -Force
    Start-Sleep -Seconds 2
    Write-Host "  All instances closed" -ForegroundColor Green
} else {
    Write-Host "  No running instances found" -ForegroundColor Green
}

# Also check for electron processes
$electronProcesses = Get-Process -Name "electron" -ErrorAction SilentlyContinue
if ($electronProcesses) {
    Write-Host "  Found Electron processes, closing them..." -ForegroundColor Gray
    $electronProcesses | Stop-Process -Force
    Start-Sleep -Seconds 2
}

Write-Host ""

# Step 2: Clean release directory
Write-Host "[2/4] Cleaning release directory..." -ForegroundColor Yellow
if (Test-Path "release\win-unpacked") {
    Write-Host "  Removing old build files..." -ForegroundColor Gray
    try {
        # Try to remove with retries
        $maxRetries = 5
        $retryCount = 0
        $removed = $false
        
        while ($retryCount -lt $maxRetries -and -not $removed) {
            try {
                Remove-Item -Path "release\win-unpacked" -Recurse -Force -ErrorAction Stop
                $removed = $true
                Write-Host "  Release directory cleaned" -ForegroundColor Green
            } catch {
                $retryCount++
                if ($retryCount -lt $maxRetries) {
                    Write-Host "  Retry $retryCount/$maxRetries - Waiting for files to unlock..." -ForegroundColor Yellow
                    Start-Sleep -Seconds 2
                    # Try to kill any processes that might be locking files
                    Get-Process | Where-Object { $_.Path -like "*release\win-unpacked*" } | Stop-Process -Force -ErrorAction SilentlyContinue
                } else {
                    Write-Host "  WARNING: Could not fully clean release directory" -ForegroundColor Yellow
                    Write-Host "  You may need to manually close the app and delete: release\win-unpacked" -ForegroundColor Yellow
                }
            }
        }
    } catch {
        Write-Host "  WARNING: Could not clean release directory: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "  Release directory doesn't exist (OK)" -ForegroundColor Green
}

# Clean dist-electron as well
if (Test-Path "dist-electron") {
    Remove-Item -Path "dist-electron" -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""

# Step 3: Build backend
Write-Host "[3/4] Building backend..." -ForegroundColor Yellow
Set-Location backend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Backend build failed!" -ForegroundColor Red
    Set-Location ..
    exit 1
}
Set-Location ..
Write-Host "  Backend built successfully" -ForegroundColor Green
Write-Host ""

# Step 4: Build frontend and Electron
Write-Host "[4/4] Building frontend and Electron app..." -ForegroundColor Yellow
npm run build:win
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Build completed successfully!" -ForegroundColor Green
Write-Host ""

# Step 5: Create desktop shortcut
Write-Host "Creating desktop shortcut..." -ForegroundColor Yellow
powershell -ExecutionPolicy Bypass -File scripts/create-desktop-shortcut.ps1
Write-Host ""

Write-Host "========================================" -ForegroundColor Green
Write-Host "Build Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "You can now:" -ForegroundColor White
Write-Host "  1. Launch from desktop shortcut" -ForegroundColor Gray
Write-Host "  2. Or run: .\release\win-unpacked\Energy Monitoring System.exe" -ForegroundColor Gray
Write-Host ""

