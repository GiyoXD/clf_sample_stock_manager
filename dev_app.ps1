$ErrorActionPreference = "Stop"

# Define Paths
$root = $PSScriptRoot
$backendPath = Join-Path $root "backend"
$frontendPath = Join-Path $root "frontend"

# 1. Determine Database Path
# Use the standar Tauri AppData path: %APPDATA%\com.samplemanager.app\database.sqlite
$appData = $env:APPDATA
$dbDir = Join-Path $appData "com.samplemanager.app"
if (-not (Test-Path $dbDir)) {
    New-Item -ItemType Directory -Force -Path $dbDir | Out-Null
}
$dbPath = Join-Path $dbDir "database.sqlite"

Write-Host " Professional Dev Mode Enabled " -ForegroundColor Cyan
Write-Host " using Database: $dbPath" -ForegroundColor Gray

# 2. Kill any old node processes (optional, but good for cleanup)
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force

# 3. Start Backend with explicit DB Path
Write-Host " Starting Backend Server..." -ForegroundColor Green
$backendProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; node server.js --db-path '$dbPath'" -PassThru -WindowStyle Minimized

# 4. Start Frontend (Tauri Dev)
Write-Host " Starting Tauri App..." -ForegroundColor Green
Set-Location $frontendPath
try {
    npm run tauri dev
}
finally {
    # 5. Cleanup Backend on Exist
    Write-Host " Stopping Backend Server..." -ForegroundColor Yellow
    Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
}
