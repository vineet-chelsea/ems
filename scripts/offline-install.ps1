#Requires -RunAsAdministrator
# Complete Offline Installation Script for EMS
# This script installs all prerequisites and sets up the EMS system

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundleRoot = Split-Path -Parent $scriptDir

Write-Host "=== EMS Complete Offline Installation ===" -ForegroundColor Green
Write-Host "Bundle Location: $bundleRoot" -ForegroundColor Cyan

# Check admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# 1. Install Node.js
Write-Host "`n[1/5] Installing Node.js..." -ForegroundColor Yellow
$nodeInstaller = Get-ChildItem "$bundleRoot\installer\nodejs\*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($nodeInstaller) {
    Write-Host "  Installing $($nodeInstaller.Name)..." -ForegroundColor Cyan
    $process = Start-Process msiexec.exe -ArgumentList "/i `"$($nodeInstaller.FullName)`" /quiet /norestart ADDLOCAL=ALL" -Wait -PassThru -NoNewWindow
    if ($process.ExitCode -eq 0 -or $process.ExitCode -eq 3010) {
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        Start-Sleep -Seconds 3
        $nodeVersion = & node --version 2>$null
        if ($nodeVersion) {
            Write-Host "  ✓ Node.js $nodeVersion installed" -ForegroundColor Green
        } else {
            Write-Host "  ⚠ Node.js installed but not in PATH. Please restart terminal." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ✗ Node.js installation failed (Exit code: $($process.ExitCode))" -ForegroundColor Red
    }
} else {
    Write-Host "  ✗ Node.js installer not found in $bundleRoot\installer\nodejs\" -ForegroundColor Red
    exit 1
}

# 2. Install PostgreSQL
Write-Host "`n[2/5] Installing PostgreSQL..." -ForegroundColor Yellow
$pgInstaller = Get-ChildItem "$bundleRoot\installer\postgresql\postgresql-*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pgInstaller) {
    Write-Host "  Installing $($pgInstaller.Name)..." -ForegroundColor Cyan
    Write-Host "  ⚠ IMPORTANT: Please set PostgreSQL password when prompted" -ForegroundColor Yellow
    Write-Host "  ⚠ Remember this password - you'll need it for database setup" -ForegroundColor Yellow
    Start-Process $pgInstaller.FullName -Wait
    Write-Host "  ✓ PostgreSQL installed" -ForegroundColor Green
} else {
    Write-Host "  ✗ PostgreSQL installer not found in $bundleRoot\installer\postgresql\" -ForegroundColor Red
    exit 1
}

# 3. Install TimescaleDB
Write-Host "`n[3/5] Installing TimescaleDB..." -ForegroundColor Yellow
$tsInstaller = Get-ChildItem "$bundleRoot\installer\postgresql\timescaledb-*.zip" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($tsInstaller) {
    Write-Host "  Found TimescaleDB: $($tsInstaller.Name)" -ForegroundColor Cyan
    Write-Host "  ⚠ TimescaleDB is a ZIP file. Please extract and install manually:" -ForegroundColor Yellow
    Write-Host "     1. Extract: $($tsInstaller.FullName)" -ForegroundColor White
    Write-Host "     2. Run the installer from the extracted folder" -ForegroundColor White
    Write-Host "     3. It will auto-detect your PostgreSQL installation" -ForegroundColor White
} else {
    $tsExe = Get-ChildItem "$bundleRoot\installer\postgresql\timescaledb-*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($tsExe) {
        Write-Host "  Installing $($tsExe.Name)..." -ForegroundColor Cyan
        Start-Process $tsExe.FullName -Wait
        Write-Host "  ✓ TimescaleDB installed" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ TimescaleDB installer not found (optional - can install later)" -ForegroundColor Yellow
    }
}

# 4. Install Python
Write-Host "`n[4/5] Installing Python..." -ForegroundColor Yellow
$pyInstaller = Get-ChildItem "$bundleRoot\installer\python\python-*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pyInstaller) {
    Write-Host "  Installing $($pyInstaller.Name)..." -ForegroundColor Cyan
    $process = Start-Process $pyInstaller.FullName -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0" -Wait -PassThru -NoNewWindow
    if ($process.ExitCode -eq 0) {
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        Start-Sleep -Seconds 3
        $pyVersion = & python --version 2>$null
        if ($pyVersion) {
            Write-Host "  ✓ $pyVersion installed" -ForegroundColor Green
        } else {
            Write-Host "  ⚠ Python installed but not in PATH. Please restart terminal." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ✗ Python installation failed (Exit code: $($process.ExitCode))" -ForegroundColor Red
    }
} else {
    Write-Host "  ✗ Python installer not found in $bundleRoot\installer\python\" -ForegroundColor Red
    exit 1
}

# 5. Install Python packages (offline)
Write-Host "`n[5/5] Installing Python packages (offline)..." -ForegroundColor Yellow
$wheelsDir = "$bundleRoot\offline-packages\python-wheels"
if (Test-Path $wheelsDir) {
    $wheelFiles = Get-ChildItem "$wheelsDir\*.whl" -ErrorAction SilentlyContinue
    if ($wheelFiles.Count -gt 0) {
        Write-Host "  Installing from $($wheelFiles.Count) wheel files..." -ForegroundColor Cyan
        if (Test-Path "$bundleRoot\requirements_modbus.txt") {
            pip install --no-index --find-links $wheelsDir -r "$bundleRoot\requirements_modbus.txt" 2>&1 | Out-Null
        }
        if (Test-Path "$bundleRoot\backend\requirements_gpu.txt") {
            pip install --no-index --find-links $wheelsDir -r "$bundleRoot\backend\requirements_gpu.txt" 2>&1 | Out-Null
        }
        Write-Host "  ✓ Python packages installed" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ No wheel files found in $wheelsDir" -ForegroundColor Yellow
        Write-Host "  You can install manually: pip install pymodbus pandas numpy" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠ Python wheels directory not found" -ForegroundColor Yellow
    Write-Host "  Installing from requirements files (requires internet)..." -ForegroundColor Yellow
    if (Test-Path "$bundleRoot\requirements_modbus.txt") {
        pip install -r "$bundleRoot\requirements_modbus.txt" 2>&1 | Out-Null
    }
}

# Verify installations
Write-Host "`n=== Installation Verification ===" -ForegroundColor Green
$nodeVer = & node --version 2>$null
$npmVer = & npm --version 2>$null
$pyVer = & python --version 2>$null
$pipVer = & pip --version 2>$null

Write-Host "Node.js: $(if($nodeVer){$nodeVer}else{'Not found - restart terminal'})" -ForegroundColor $(if($nodeVer){'Green'}else{'Yellow'})
Write-Host "NPM: $(if($npmVer){$npmVer}else{'Not found - restart terminal'})" -ForegroundColor $(if($npmVer){'Green'}else{'Yellow'})
Write-Host "Python: $(if($pyVer){$pyVer}else{'Not found - restart terminal'})" -ForegroundColor $(if($pyVer){'Green'}else{'Yellow'})
Write-Host "Pip: $(if($pipVer){$pipVer}else{'Not found - restart terminal'})" -ForegroundColor $(if($pipVer){'Green'}else{'Yellow'})

# Check PostgreSQL service
$pgService = Get-Service -Name "*postgresql*" -ErrorAction SilentlyContinue
if ($pgService) {
    Write-Host "PostgreSQL Service: $($pgService.Status)" -ForegroundColor $(if($pgService.Status -eq 'Running'){'Green'}else{'Yellow'})
    if ($pgService.Status -ne 'Running') {
        Write-Host "  Starting PostgreSQL service..." -ForegroundColor Cyan
        Start-Service $pgService.Name -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "PostgreSQL Service: Not found (may need system restart)" -ForegroundColor Yellow
}

# Check if node_modules exist (pre-bundled)
$frontendModules = Test-Path "$bundleRoot\node_modules"
$backendModules = Test-Path "$bundleRoot\backend\node_modules"

Write-Host "`n=== Dependencies Status ===" -ForegroundColor Green
Write-Host "Frontend node_modules: $(if($frontendModules){'✓ Bundled' -ForegroundColor Green}else{'✗ Missing' -ForegroundColor Red})"
Write-Host "Backend node_modules: $(if($backendModules){'✓ Bundled' -ForegroundColor Green}else{'✗ Missing' -ForegroundColor Red})"

if (-not $frontendModules -or -not $backendModules) {
    Write-Host "`n⚠ Some dependencies are missing. Installing now..." -ForegroundColor Yellow
    if (-not $frontendModules) {
        Write-Host "  Installing frontend dependencies..." -ForegroundColor Cyan
        Set-Location $bundleRoot
        npm install --legacy-peer-deps
    }
    if (-not $backendModules) {
        Write-Host "  Installing backend dependencies..." -ForegroundColor Cyan
        Set-Location "$bundleRoot\backend"
        npm install
    }
    Set-Location $bundleRoot
}

Write-Host "`n=== Next Steps ===" -ForegroundColor Yellow
Write-Host "1. RESTART your terminal/PowerShell to refresh PATH" -ForegroundColor White
Write-Host "2. Navigate to bundle: cd `"$bundleRoot`"" -ForegroundColor White
Write-Host "3. Setup database:" -ForegroundColor White
Write-Host "   - Open pgAdmin or use psql" -ForegroundColor Gray
Write-Host "   - Create database: CREATE DATABASE ems_db;" -ForegroundColor Gray
Write-Host "   - Create user: CREATE USER ems_user WITH PASSWORD 'your_password';" -ForegroundColor Gray
Write-Host "   - Grant privileges: GRANT ALL ON DATABASE ems_db TO ems_user;" -ForegroundColor Gray
Write-Host "   - Install TimescaleDB: CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;" -ForegroundColor Gray
Write-Host "4. Create .env file in backend/ directory (see INSTALLATION_GUIDE.md)" -ForegroundColor White
Write-Host "5. Initialize database: cd backend && npm run migrate" -ForegroundColor White
Write-Host "6. Start application: npm run start:dev" -ForegroundColor White

Write-Host "`n✓ Installation Complete!" -ForegroundColor Green
Write-Host "See INSTALLATION_GUIDE.md for detailed setup instructions" -ForegroundColor Cyan

