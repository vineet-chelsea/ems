# Verify offline bundle completeness
param([string]$BundleDir = "offline-bundle")

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$bundlePath = Join-Path $repoRoot $BundleDir

Write-Host "=== Verifying Offline Bundle ===" -ForegroundColor Green
Write-Host "Bundle Location: $bundlePath" -ForegroundColor Cyan

if (-not (Test-Path $bundlePath)) {
    Write-Host "ERROR: Bundle directory not found: $bundlePath" -ForegroundColor Red
    Write-Host "Run: .\scripts\prepare-offline-bundle.ps1 first" -ForegroundColor Yellow
    exit 1
}

$errors = @()
$warnings = @()

# Check installers
Write-Host "`n[1/5] Checking installers..." -ForegroundColor Yellow
$nodeInstaller = Get-ChildItem "$bundlePath\installer\nodejs\*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
$pgInstaller = Get-ChildItem "$bundlePath\installer\postgresql\postgresql-*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
$tsInstaller = Get-ChildItem "$bundlePath\installer\postgresql\timescaledb-*" -ErrorAction SilentlyContinue | Select-Object -First 1
$pyInstaller = Get-ChildItem "$bundlePath\installer\python\python-*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($nodeInstaller) {
    Write-Host "  OK Node.js: $($nodeInstaller.Name)" -ForegroundColor Green
} else {
    $errors += "Node.js installer missing"
    Write-Host "  ERROR: Node.js installer not found" -ForegroundColor Red
}

if ($pgInstaller) {
    Write-Host "  OK PostgreSQL: $($pgInstaller.Name)" -ForegroundColor Green
} else {
    $errors += "PostgreSQL installer missing"
    Write-Host "  ERROR: PostgreSQL installer not found" -ForegroundColor Red
}

if ($tsInstaller) {
    Write-Host "  OK TimescaleDB: $($tsInstaller.Name)" -ForegroundColor Green
} else {
    $warnings += "TimescaleDB installer missing (optional)"
    Write-Host "  WARNING: TimescaleDB installer not found (optional)" -ForegroundColor Yellow
}

if ($pyInstaller) {
    Write-Host "  OK Python: $($pyInstaller.Name)" -ForegroundColor Green
} else {
    $errors += "Python installer missing"
    Write-Host "  ERROR: Python installer not found" -ForegroundColor Red
}

# Check node_modules
Write-Host "`n[2/5] Checking node_modules..." -ForegroundColor Yellow
if (Test-Path "$bundlePath\node_modules") {
    $frontendSize = (Get-ChildItem "$bundlePath\node_modules" -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $frontendCount = (Get-ChildItem "$bundlePath\node_modules" -Directory -ErrorAction SilentlyContinue).Count
    $frontendSizeMB = [math]::Round($frontendSize / 1MB, 2)
    Write-Host "  OK Frontend: $frontendCount packages, $frontendSizeMB MB" -ForegroundColor Green
} else {
    $errors += "Frontend node_modules missing"
    Write-Host "  ERROR: Frontend node_modules not found" -ForegroundColor Red
}

if (Test-Path "$bundlePath\backend\node_modules") {
    $backendSize = (Get-ChildItem "$bundlePath\backend\node_modules" -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $backendCount = (Get-ChildItem "$bundlePath\backend\node_modules" -Directory -ErrorAction SilentlyContinue).Count
    $backendSizeMB = [math]::Round($backendSize / 1MB, 2)
    Write-Host "  OK Backend: $backendCount packages, $backendSizeMB MB" -ForegroundColor Green
} else {
    $errors += "Backend node_modules missing"
    Write-Host "  ERROR: Backend node_modules not found" -ForegroundColor Red
}

# Check Python wheels
Write-Host "`n[3/5] Checking Python packages..." -ForegroundColor Yellow
$wheelsDir = "$bundlePath\offline-packages\python-wheels"
if (Test-Path $wheelsDir) {
    $wheelFiles = Get-ChildItem "$wheelsDir\*.whl" -ErrorAction SilentlyContinue
    if ($wheelFiles.Count -gt 0) {
        $wheelsSize = ($wheelFiles | Measure-Object -Property Length -Sum).Sum
        $wheelsSizeMB = [math]::Round($wheelsSize / 1MB, 2)
        Write-Host "  OK Python wheels: $($wheelFiles.Count) files, $wheelsSizeMB MB" -ForegroundColor Green
        
        # Check for key packages
        $keyPackages = @('pymodbus', 'pandas', 'numpy')
        foreach ($pkg in $keyPackages) {
            $found = $wheelFiles | Where-Object { $_.Name -like "*$pkg*" }
            if ($found) {
                Write-Host "    OK $pkg found" -ForegroundColor Green
            } else {
                $warnings += "$pkg wheel not found"
                Write-Host "    WARNING: $pkg not found" -ForegroundColor Yellow
            }
        }
    } else {
        $warnings += "No Python wheel files found"
        Write-Host "  WARNING: No wheel files found" -ForegroundColor Yellow
    }
} else {
    $warnings += "Python wheels directory missing"
    Write-Host "  WARNING: Python wheels directory not found" -ForegroundColor Yellow
}

# Check key source files
Write-Host "`n[4/5] Checking source files..." -ForegroundColor Yellow
$requiredFiles = @(
    "package.json",
    "backend\package.json",
    "backend\src\index.ts",
    "requirements_modbus.txt",
    "scripts\offline-install.ps1"
)

$missingFiles = @()
foreach ($file in $requiredFiles) {
    if (Test-Path "$bundlePath\$file") {
        Write-Host "  OK $file" -ForegroundColor Green
    } else {
        $missingFiles += $file
        Write-Host "  ERROR: $file" -ForegroundColor Red
    }
}

if ($missingFiles.Count -gt 0) {
    $errors += "Missing source files: $($missingFiles -join ', ')"
}

# Check bundle size
Write-Host "`n[5/5] Checking bundle size..." -ForegroundColor Yellow
$totalSize = (Get-ChildItem $bundlePath -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
$totalSizeMB = [math]::Round($totalSize / 1MB, 2)
$totalSizeGB = [math]::Round($totalSize / 1GB, 2)
$sizeText = 'Total Size: ' + $totalSizeMB + ' MB (' + $totalSizeGB + ' GB)'
Write-Host "  $sizeText" -ForegroundColor Cyan

if ($totalSizeMB -lt 100) {
    $warnings += "Bundle seems too small - may be incomplete"
}

# Summary
Write-Host ""
Write-Host "=== Verification Summary ===" -ForegroundColor Green
if ($errors.Count -eq 0) {
    Write-Host "OK Bundle is complete and ready for offline installation!" -ForegroundColor Green
} else {
    Write-Host "ERROR: Errors found:" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Please fix errors before using bundle" -ForegroundColor Yellow
}

if ($warnings.Count -gt 0) {
    Write-Host ""
    Write-Host "WARNING: Warnings:" -ForegroundColor Yellow
    $warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}

Write-Host ""
Write-Host "Bundle Location: $bundlePath" -ForegroundColor Cyan
$sizeText2 = 'Total Size: ' + $totalSizeMB + ' MB (' + $totalSizeGB + ' GB)'
Write-Host $sizeText2 -ForegroundColor Cyan

if ($errors.Count -eq 0) {
    Write-Host ""
    Write-Host "OK Ready for offline installation!" -ForegroundColor Green
    exit 0
} else {
    exit 1
}

