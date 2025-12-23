$ErrorActionPreference = "Stop"

Write-Host "Starting Sample Manager System..." -ForegroundColor Cyan

# --- Cleanup Step ---
Write-Host "Cleaning up old processes..." -ForegroundColor Yellow
# Kill any running Node.js processes (Backend & Frontend)
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
# --------------------

# Define paths
$root = Get-Location
$backendPath = Join-Path $root "backend"
$frontendPath = Join-Path $root "frontend"

# Check if directories exist
if (!(Test-Path $backendPath)) {
    Write-Error "Backend directory not found at $backendPath"
    exit 1
}
if (!(Test-Path $frontendPath)) {
    Write-Error "Frontend directory not found at $frontendPath"
    exit 1
}

# Start Backend
Write-Host "Launching Backend Server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; npm start" -WindowStyle Minimized

# Start Frontend
Write-Host "Launching Frontend Dev Server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendPath'; npm run dev"

Write-Host "System started! Backend running in background, Frontend launching..." -ForegroundColor Cyan
