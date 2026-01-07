# Start Windows Services Manually

Write-Host "Starting EMS Services" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan
Write-Host ""

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "WARNING: Some operations may require Administrator privileges" -ForegroundColor Yellow
    Write-Host ""
}

# Start Backend
Write-Host "Starting Backend..." -ForegroundColor Yellow
$backendTask = Get-ScheduledTask -TaskName "EMS-Backend" -ErrorAction SilentlyContinue
if ($backendTask) {
    Start-ScheduledTask -TaskName "EMS-Backend"
    Write-Host "  Backend task started" -ForegroundColor Green
} else {
    Write-Host "  Backend task not found. Starting manually..." -ForegroundColor Yellow
    $projectRoot = $PSScriptRoot | Split-Path -Parent
    $backendPath = Join-Path $projectRoot "backend"
    
    if (Test-Path (Join-Path $backendPath "dist\index.js")) {
        Start-Process -FilePath "node" -ArgumentList "dist\index.js" -WorkingDirectory $backendPath -WindowStyle Hidden
        Write-Host "  Backend started manually" -ForegroundColor Green
    } else {
        Write-Host "  ERROR: Backend not built. Run: cd backend && npm run build" -ForegroundColor Red
    }
}

# Start Frontend
Write-Host "Starting Frontend..." -ForegroundColor Yellow
$frontendTask = Get-ScheduledTask -TaskName "EMS-Frontend" -ErrorAction SilentlyContinue
if ($frontendTask) {
    Start-ScheduledTask -TaskName "EMS-Frontend"
    Write-Host "  Frontend task started" -ForegroundColor Green
} else {
    Write-Host "  Frontend task not found. Starting manually..." -ForegroundColor Yellow
    $projectRoot = $PSScriptRoot | Split-Path -Parent
    $builtExe = Join-Path $projectRoot "release\win-unpacked\Energy Monitoring System.exe"
    if (Test-Path $builtExe) {
        Start-Process -FilePath $builtExe
        Write-Host "  Frontend started manually" -ForegroundColor Green
    } else {
        Write-Host "  ERROR: Frontend not built. Run: npm run build:win" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Services started!" -ForegroundColor Green

