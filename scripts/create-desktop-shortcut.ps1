# Create Desktop Shortcut for Energy Monitoring System
# This script creates a desktop shortcut manually

$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "Energy Monitoring System.lnk"

# Check if shortcut already exists
if (Test-Path $shortcutPath) {
    Write-Host "Desktop shortcut already exists at: $shortcutPath" -ForegroundColor Yellow
    $overwrite = Read-Host "Do you want to overwrite it? (Y/N)"
    if ($overwrite -ne "Y" -and $overwrite -ne "y") {
        Write-Host "Skipping shortcut creation." -ForegroundColor Gray
        exit 0
    }
}

# Find the executable
$exePath = $null

# Check if running from built app (x64)
if (Test-Path "release\win-unpacked\Energy Monitoring System.exe") {
    $exePath = (Resolve-Path "release\win-unpacked\Energy Monitoring System.exe").Path
    Write-Host "Found built executable (x64): $exePath" -ForegroundColor Green
}
# Check if running from built app (ia32)
elseif (Test-Path "release\win-ia32-unpacked\Energy Monitoring System.exe") {
    $exePath = (Resolve-Path "release\win-ia32-unpacked\Energy Monitoring System.exe").Path
    Write-Host "Found built executable (ia32): $exePath" -ForegroundColor Green
}
# Check if running from dist-electron (development build)
elseif (Test-Path "dist-electron\main.js") {
    $nodePath = Get-Command node -ErrorAction SilentlyContinue
    if ($nodePath) {
        $exePath = $nodePath.Source
        Write-Host "Using Node.js for development: $exePath" -ForegroundColor Yellow
        Write-Host "Note: For production, build the app first with: npm run build:win" -ForegroundColor Yellow
    }
}
# Check if electron is available
else {
    $electronPath = Get-Command electron -ErrorAction SilentlyContinue
    if ($electronPath) {
        $exePath = $electronPath.Source
        Write-Host "Using Electron for development: $exePath" -ForegroundColor Yellow
    }
}

if (-not $exePath) {
    Write-Host "ERROR: Could not find executable. Please build the app first:" -ForegroundColor Red
    Write-Host "  npm run build:win" -ForegroundColor Gray
    exit 1
}

# Get icon path
$iconPath = $null
if (Test-Path "build\icon.ico") {
    $iconPath = (Resolve-Path "build\icon.ico").Path
} elseif (Test-Path "public\favicon.ico") {
    $iconPath = (Resolve-Path "public\favicon.ico").Path
}

# Create shortcut
Write-Host "Creating desktop shortcut..." -ForegroundColor Cyan
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = $exePath.ToString()
$Shortcut.WorkingDirectory = (Split-Path $exePath -Parent).ToString()
$Shortcut.Description = "Energy Monitoring System"
if ($iconPath) {
    $Shortcut.IconLocation = $iconPath.ToString()
}
$Shortcut.Save()

Write-Host "Desktop shortcut created successfully!" -ForegroundColor Green
Write-Host "  Location: $shortcutPath" -ForegroundColor Gray

