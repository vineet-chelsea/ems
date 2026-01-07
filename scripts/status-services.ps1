# Check Status of Windows Services

Write-Host "EMS Services Status" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan
Write-Host ""

# Check Backend Task
Write-Host "Backend Service:" -ForegroundColor Yellow
$backendTask = Get-ScheduledTask -TaskName "EMS-Backend" -ErrorAction SilentlyContinue
if ($backendTask) {
    $state = $backendTask.State
    Write-Host "  Task: Installed" -ForegroundColor Green
    Write-Host "  State: $state" -ForegroundColor $(if ($state -eq "Running") { "Green" } else { "Yellow" })
    
    # Check if backend process is running
    $backendProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -like "*backend*" -or (Get-WmiObject Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine -like "*backend*"
    }
    if ($backendProcess) {
        Write-Host "  Process: Running (PID: $($backendProcess.Id))" -ForegroundColor Green
    } else {
        Write-Host "  Process: Not running" -ForegroundColor Yellow
    }
    
    # Check if backend API is responding
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        Write-Host "  API: Responding (Status: $($response.StatusCode))" -ForegroundColor Green
    } catch {
        Write-Host "  API: Not responding" -ForegroundColor Red
    }
} else {
    Write-Host "  Task: Not installed" -ForegroundColor Red
    Write-Host "  Run: powershell -ExecutionPolicy Bypass -File scripts/install-windows-services.ps1" -ForegroundColor Yellow
}

Write-Host ""

# Check Frontend Task
Write-Host "Frontend Service:" -ForegroundColor Yellow
$frontendTask = Get-ScheduledTask -TaskName "EMS-Frontend" -ErrorAction SilentlyContinue
if ($frontendTask) {
    $state = $frontendTask.State
    Write-Host "  Task: Installed" -ForegroundColor Green
    Write-Host "  State: $state" -ForegroundColor $(if ($state -eq "Running") { "Green" } else { "Yellow" })
} else {
    Write-Host "  Task: Not installed" -ForegroundColor Red
    Write-Host "  Run: npm run install-services (after building the app)" -ForegroundColor Yellow
}

# Check Frontend Process (Electron)
$electronProcesses = Get-Process -Name "Energy Monitoring System" -ErrorAction SilentlyContinue
if ($electronProcesses) {
    Write-Host "  Process: Running ($($electronProcesses.Count) process(es))" -ForegroundColor Green
    $electronProcesses | ForEach-Object {
        Write-Host "    PID: $($_.Id), Started: $($_.StartTime)" -ForegroundColor Gray
    }
} else {
    Write-Host "  Process: Not running" -ForegroundColor Yellow
}

Write-Host ""

