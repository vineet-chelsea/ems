# Stop Development Environment
# Kills all Node.js processes related to the project

Write-Host "Stopping development services..." -ForegroundColor Cyan

# Kill processes on ports 3001 and 5173
$ports = @(3001, 5173)

foreach ($port in $ports) {
    $connections = netstat -ano | findstr ":$port" | findstr "LISTENING"
    if ($connections) {
        $connections | ForEach-Object {
            $parts = $_ -split '\s+'
            $pid = $parts[-1]
            if ($pid -match '^\d+$') {
                Write-Host "Stopping process on port $port (PID: $pid)..." -ForegroundColor Yellow
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

# Kill Electron processes
$electronProcesses = Get-Process -Name "electron" -ErrorAction SilentlyContinue
if ($electronProcesses) {
    Write-Host "Stopping Electron processes..." -ForegroundColor Yellow
    $electronProcesses | Stop-Process -Force
}

# Kill node processes that might be running backend/frontend
# (Be careful - this might kill other Node processes)
Write-Host ""
Write-Host "✓ Development services stopped" -ForegroundColor Green
Write-Host ""
Write-Host "Note: If you have other Node.js applications running, they may have been affected." -ForegroundColor Yellow

