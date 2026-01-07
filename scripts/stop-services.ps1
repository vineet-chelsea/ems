# Stop Windows Services

Write-Host "Stopping EMS Services" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan
Write-Host ""

# Stop Backend Task
Write-Host "Stopping Backend..." -ForegroundColor Yellow
$backendTask = Get-ScheduledTask -TaskName "EMS-Backend" -ErrorAction SilentlyContinue
if ($backendTask) {
    Stop-ScheduledTask -TaskName "EMS-Backend" -ErrorAction SilentlyContinue
    Write-Host "  Backend task stopped" -ForegroundColor Green
}

# Stop Frontend Task
Write-Host "Stopping Frontend..." -ForegroundColor Yellow
$frontendTask = Get-ScheduledTask -TaskName "EMS-Frontend" -ErrorAction SilentlyContinue
if ($frontendTask) {
    Stop-ScheduledTask -TaskName "EMS-Frontend" -ErrorAction SilentlyContinue
    Write-Host "  Frontend task stopped" -ForegroundColor Green
}

# Also kill any running Node.js processes for backend
$backendProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -like "*backend*" -or $_.CommandLine -like "*backend*"
}
if ($backendProcesses) {
    $backendProcesses | Stop-Process -Force
    Write-Host "  Stopped backend Node.js processes" -ForegroundColor Green
}

# Stop Frontend (Electron)
$electronProcesses = Get-Process -Name "Energy Monitoring System" -ErrorAction SilentlyContinue
if ($electronProcesses) {
    $electronProcesses | Stop-Process -Force
    Write-Host "  Stopped Electron app" -ForegroundColor Green
}

Write-Host ""
Write-Host "Services stopped!" -ForegroundColor Green

