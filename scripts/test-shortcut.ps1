# Test Desktop Shortcut
# Launches the app and checks if it starts properly

Write-Host "Testing Desktop Shortcut" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan
Write-Host ""

$shortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "Energy Monitoring System.lnk"

if (-not (Test-Path $shortcutPath)) {
    Write-Host "ERROR: Desktop shortcut not found!" -ForegroundColor Red
    Write-Host "Creating shortcut..." -ForegroundColor Yellow
    powershell -ExecutionPolicy Bypass -File scripts/create-desktop-shortcut.ps1
    exit 1
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)

Write-Host "Shortcut Details:" -ForegroundColor Yellow
Write-Host "  Target: $($shortcut.TargetPath)" -ForegroundColor Gray
Write-Host "  Working Dir: $($shortcut.WorkingDirectory)" -ForegroundColor Gray
Write-Host ""

# Check if target exists
if (-not (Test-Path $shortcut.TargetPath)) {
    Write-Host "ERROR: Target executable not found!" -ForegroundColor Red
    Write-Host "  Expected: $($shortcut.TargetPath)" -ForegroundColor Gray
    exit 1
}

Write-Host "Launching application..." -ForegroundColor Yellow
$process = Start-Process -FilePath $shortcut.TargetPath -WorkingDirectory $shortcut.WorkingDirectory -PassThru

Write-Host "  Process ID: $($process.Id)" -ForegroundColor Gray
Write-Host "  Waiting 5 seconds for app to start..." -ForegroundColor Gray
Start-Sleep -Seconds 5

$running = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "Application is running!" -ForegroundColor Green
    Write-Host "  Process: $($running.ProcessName) (ID: $($running.Id))" -ForegroundColor Gray
    
    # Check for window
    $windows = Get-Process -Name "Energy Monitoring System" -ErrorAction SilentlyContinue
    Write-Host "  Total processes: $($windows.Count)" -ForegroundColor Gray
    
    Write-Host ""
    Write-Host "If the window is not visible, check:" -ForegroundColor Yellow
    Write-Host "  1. Task Manager - Look for Energy Monitoring System" -ForegroundColor Gray
    Write-Host "  2. Check if window is minimized or behind other windows" -ForegroundColor Gray
    Write-Host "  3. Check logs in AppData\Roaming\Energy Monitoring System\logs\" -ForegroundColor Gray
} else {
    Write-Host "Application did not start or crashed immediately" -ForegroundColor Red
    Write-Host "  Check logs for errors" -ForegroundColor Yellow
}

Write-Host ""
