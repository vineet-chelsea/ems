# Install Windows Services for Backend and Frontend
# This creates scheduled tasks that run on startup

Write-Host "Installing Windows Startup Services" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = $PSScriptRoot | Split-Path -Parent
$backendPath = Join-Path $projectRoot "backend"
$frontendPath = $projectRoot

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Function to create scheduled task
function Create-StartupTask {
    param(
        [string]$TaskName,
        [string]$Description,
        [string]$WorkingDirectory,
        [string]$Command,
        [string[]]$Arguments
    )
    
    Write-Host "Creating task: $TaskName" -ForegroundColor Yellow
    
    # Remove existing task if it exists
    $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Write-Host "  Removing existing task..." -ForegroundColor Gray
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    }
    
    # Create action
    $argumentString = if ($Arguments.Count -gt 0) { $Arguments -join " " } else { $null }
    if ($argumentString) {
        $action = New-ScheduledTaskAction -Execute $Command -Argument $argumentString -WorkingDirectory $WorkingDirectory
    } else {
        $action = New-ScheduledTaskAction -Execute $Command -WorkingDirectory $WorkingDirectory
    }
    
    # Create trigger (on system startup)
    $trigger = New-ScheduledTaskTrigger -AtStartup
    
    # Create principal (run as current user)
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
    
    # Create settings
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    
    # Register task
    try {
        Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $Description | Out-Null
        Write-Host "  Task created successfully!" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "  ERROR: Failed to create task: $_" -ForegroundColor Red
        return $false
    }
}

# Get Node.js path
$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
    Write-Host "ERROR: Node.js not found in PATH!" -ForegroundColor Red
    Write-Host "Please install Node.js and ensure it's in your PATH" -ForegroundColor Yellow
    exit 1
}
$nodeExe = $nodePath.Source

Write-Host "Node.js found: $nodeExe" -ForegroundColor Green
Write-Host ""

# Create Backend Service
Write-Host "[1/2] Creating Backend Startup Task..." -ForegroundColor Cyan
$backendBuilt = Test-Path (Join-Path $backendPath "dist\index.js")
if (-not $backendBuilt) {
    Write-Host "  WARNING: Backend not built. Building now..." -ForegroundColor Yellow
    Set-Location $backendPath
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Backend build failed!" -ForegroundColor Red
        Set-Location $projectRoot
        exit 1
    }
    Set-Location $projectRoot
}

$backendSuccess = Create-StartupTask `
    -TaskName "EMS-Backend" `
    -Description "Energy Monitoring System - Backend API Server" `
    -WorkingDirectory $backendPath `
    -Command $nodeExe `
    -Arguments @("dist\index.js")

Write-Host ""

# Create Frontend Service (Electron App)
Write-Host "[2/2] Creating Frontend Startup Task..." -ForegroundColor Cyan

# Find Electron executable
$electronExe = $null
$isDev = $false

# Check if built version exists
$builtExe = Join-Path $projectRoot "release\win-unpacked\Energy Monitoring System.exe"
if (Test-Path $builtExe) {
    $electronExe = $builtExe
    Write-Host "  Found built Electron app" -ForegroundColor Green
} else {
    # Check for development version
    $devExe = Join-Path $projectRoot "node_modules\.bin\electron.cmd"
    if (Test-Path $devExe) {
        $electronExe = $devExe
        $isDev = $true
        Write-Host "  Using development Electron (build app first for production)" -ForegroundColor Yellow
    } else {
        Write-Host "  WARNING: Electron app not found. Build the app first:" -ForegroundColor Yellow
        Write-Host "    npm run build:win" -ForegroundColor Gray
        Write-Host "  Skipping frontend service creation..." -ForegroundColor Yellow
        $frontendSuccess = $false
    }
}

if ($electronExe) {
    $frontendSuccess = Create-StartupTask `
        -TaskName "EMS-Frontend" `
        -Description "Energy Monitoring System - Frontend Electron App" `
        -WorkingDirectory $projectRoot `
        -Command $electronExe `
        -Arguments @()
} else {
    $frontendSuccess = $false
}

Write-Host ""

if ($backendSuccess) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Installation Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Services installed:" -ForegroundColor White
    Write-Host "  - EMS-Backend: Starts on system boot" -ForegroundColor $(if ($backendSuccess) { "Green" } else { "Red" })
    Write-Host "  - EMS-Frontend: Starts on system boot" -ForegroundColor $(if ($frontendSuccess) { "Green" } else { "Yellow" })
    Write-Host ""
    Write-Host "To manage services:" -ForegroundColor Yellow
    Write-Host "  View tasks: Get-ScheduledTask -TaskName EMS-*" -ForegroundColor Gray
    Write-Host "  Start: Start-ScheduledTask -TaskName EMS-Backend" -ForegroundColor Gray
    Write-Host "  Stop: Stop-ScheduledTask -TaskName EMS-Backend" -ForegroundColor Gray
    Write-Host "  Status: npm run status-services" -ForegroundColor Gray
    Write-Host ""
    if (-not $frontendSuccess) {
        Write-Host "NOTE: Build the app first, then re-run this script to install frontend service:" -ForegroundColor Yellow
        Write-Host "  npm run build:win" -ForegroundColor Gray
        Write-Host "  npm run install-services" -ForegroundColor Gray
        Write-Host ""
    }
    Write-Host "Services will start automatically on next system boot." -ForegroundColor Green
} else {
    Write-Host "Installation had errors. Please check the output above." -ForegroundColor Red
    exit 1
}

