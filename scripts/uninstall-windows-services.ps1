# Uninstall Windows Services

Write-Host "Uninstalling Windows Startup Services" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    exit 1
}

$tasks = @("EMS-Backend", "EMS-Frontend")

foreach ($taskName in $tasks) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        Write-Host "Removing task: $taskName" -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Host "  Removed" -ForegroundColor Green
    } else {
        Write-Host "Task not found: $taskName" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "Uninstallation complete!" -ForegroundColor Green

