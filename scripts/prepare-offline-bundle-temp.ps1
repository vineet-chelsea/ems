# Script to prepare complete offline bundle with ALL dependencies
# Note: This script does NOT require admin rights - only the install script does

param(
    [string]$BundleDir = "offline-bundle",
    [switch]$IncludeNodeModules = $true,
    [switch]$IncludePythonPackages = $true
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

Write-Host "=== Preparing Complete Offline Bundle ===" -ForegroundColor Green
Write-Host "Repository: $repoRoot" -ForegroundColor Cyan
Write-Host "Bundle Directory: $BundleDir" -ForegroundColor Cyan

# Create bundle structure
$bundlePath = Join-Path $repoRoot $BundleDir
if (Test-Path $bundlePath) {
    Write-Host "`n??? Bundle directory already exists. Removing..." -ForegroundColor Yellow
    Remove-Item $bundlePath -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $bundlePath | Out-Null

# Copy installers directory
Write-Host "`n[1/6] Copying installers..." -ForegroundColor Yellow
if (Test-Path "$repoRoot\installer") {
    Copy-Item -Path "$repoRoot\installer" -Destination "$bundlePath\installer" -Recurse -Force
    Write-Host "??? Installers copied" -ForegroundColor Green
} else {
    Write-Host "??? Installer directory not found" -ForegroundColor Yellow
}

# Copy source code (excluding node_modules, dist, etc.)
Write-Host "`n[2/6] Copying source code..." -ForegroundColor Yellow
$excludePatterns = @('node_modules', '.git', 'dist', 'dist-electron', 'release', 'offline-bundle', '.next', '__pycache__', '*.pyc', '*.log', '.env')
Get-ChildItem -Path $repoRoot -Recurse -File | Where-Object {
    $shouldExclude = $false
    foreach ($pattern in $excludePatterns) {
        if ($_.FullName -like "*\$pattern*") {
            $shouldExclude = $true
            break
        }
    }
    return -not $shouldExclude
} | ForEach-Object {
    $relativePath = $_.FullName.Substring($repoRoot.Length + 1)
    $destPath = Join-Path $bundlePath $relativePath
    $destDir = Split-Path -Parent $destPath
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    }
    Copy-Item $_.FullName -Destination $destPath -Force
}

# Copy directories (excluding excluded ones)
Get-ChildItem -Path $repoRoot -Recurse -Directory | Where-Object {
    $shouldExclude = $false
    foreach ($pattern in $excludePatterns) {
        if ($_.FullName -like "*\$pattern*" -or $_.Name -eq $pattern) {
            $shouldExclude = $true
            break
        }
    }
    return -not $shouldExclude -and $_.FullName -ne $bundlePath
} | ForEach-Object {
    $relativePath = $_.FullName.Substring($repoRoot.Length + 1)
    $destPath = Join-Path $bundlePath $relativePath
    if (-not (Test-Path $destPath)) {
        New-Item -ItemType Directory -Force -Path $destPath | Out-Null
    }
}

Write-Host "??? Source code copied" -ForegroundColor Green

# Install and bundle frontend node_modules
if ($IncludeNodeModules) {
    Write-Host "`n[3/6] Installing and bundling frontend dependencies..." -ForegroundColor Yellow
    Set-Location $repoRoot
    
    if (-not (Test-Path "node_modules")) {
        Write-Host "  Installing frontend npm packages..." -ForegroundColor Cyan
        npm install --legacy-peer-deps
    }
    
    Write-Host "  Copying frontend node_modules..." -ForegroundColor Cyan
    $frontendModulesDest = Join-Path $bundlePath "node_modules"
    if (Test-Path $frontendModulesDest) {
        Remove-Item $frontendModulesDest -Recurse -Force
    }
    Copy-Item -Path "node_modules" -Destination $frontendModulesDest -Recurse -Force
    $frontendSize = (Get-ChildItem $frontendModulesDest -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $frontendSizeMB = [math]::Round($frontendSize / 1MB, 2)
    Write-Host "OK Frontend node_modules bundled ($frontendSizeMB MB)" -ForegroundColor Green
}

# Install and bundle backend node_modules
if ($IncludeNodeModules) {
    Write-Host "`n[4/6] Installing and bundling backend dependencies..." -ForegroundColor Yellow
    Set-Location "$repoRoot\backend"
    
    if (-not (Test-Path "node_modules")) {
        Write-Host "  Installing backend npm packages..." -ForegroundColor Cyan
        npm install
    }
    
    Write-Host "  Copying backend node_modules..." -ForegroundColor Cyan
    $backendModulesDest = Join-Path $bundlePath "backend\node_modules"
    if (Test-Path $backendModulesDest) {
        Remove-Item $backendModulesDest -Recurse -Force
    }
    Copy-Item -Path "node_modules" -Destination $backendModulesDest -Recurse -Force
    $backendSize = (Get-ChildItem $backendModulesDest -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $backendSizeMB = [math]::Round($backendSize / 1MB, 2)
    Write-Host "OK Backend node_modules bundled ($backendSizeMB MB)" -ForegroundColor Green
}

# Download and bundle Python packages
if ($IncludePythonPackages) {
    Write-Host "`n[5/6] Downloading and bundling Python packages..." -ForegroundColor Yellow
    $pythonWheelsDir = Join-Path $bundlePath "offline-packages\python-wheels"
    New-Item -ItemType Directory -Force -Path $pythonWheelsDir | Out-Null
    
    Write-Host "  Downloading Python wheels..." -ForegroundColor Cyan
    if (Test-Path "$repoRoot\requirements_modbus.txt") {
        pip download -r "$repoRoot\requirements_modbus.txt" -d $pythonWheelsDir 2>&1 | Out-Null
    }
    if (Test-Path "$repoRoot\backend\requirements_gpu.txt") {
        pip download -r "$repoRoot\backend\requirements_gpu.txt" -d $pythonWheelsDir 2>&1 | Out-Null
    }
    
    # Download core dependencies
    pip download pymodbus pandas numpy -d $pythonWheelsDir 2>&1 | Out-Null
    
    $wheelFiles = Get-ChildItem "$pythonWheelsDir\*.whl" -ErrorAction SilentlyContinue
    if ($wheelFiles.Count -gt 0) {
        $wheelsSize = ($wheelFiles | Measure-Object -Property Length -Sum).Sum
        $wheelsSizeMB = [math]::Round($wheelsSize / 1MB, 2)
        $wheelCount = $wheelFiles.Count
        Write-Host "OK Python packages bundled ($wheelCount files, $wheelsSizeMB MB)" -ForegroundColor Green
    } else {
        Write-Host "??? No Python wheel files downloaded" -ForegroundColor Yellow
    }
}

# Create installation script
Write-Host "`n[6/6] Creating installation scripts..." -ForegroundColor Yellow
$installScriptPath = Join-Path $bundlePath "scripts\offline-install.ps1"
New-Item -ItemType Directory -Force -Path (Split-Path $installScriptPath) | Out-Null

# Copy the offline install script (will be created separately)
Write-Host "??? Installation script location prepared" -ForegroundColor Green

# Calculate total size
$totalSize = (Get-ChildItem $bundlePath -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
$totalSizeMB = [math]::Round($totalSize / 1MB, 2)
$totalSizeGB = [math]::Round($totalSize / 1GB, 2)

Write-Host ""
Write-Host "=== Bundle Complete ===" -ForegroundColor Green
Write-Host "Bundle Location: $bundlePath" -ForegroundColor Cyan
Write-Host $bundleMsg -ForegroundColor Cyan
$sizeText = 'Total Size: ' + $totalSizeMB + ' MB (' + $totalSizeGB + ' GB)'
Write-Host $sizeText -ForegroundColor Cyan
Write-Host ""
Write-Host 'Next: Run offline-install.ps1 on target machine' -ForegroundColor Yellow

Set-Location $repoRoot


