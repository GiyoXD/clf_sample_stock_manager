Write-Host "--------------------------------------------------------"
Write-Host "   SAMPLE MANAGER BUILD SCRIPT"
Write-Host "--------------------------------------------------------"

# 1. Build Backend
Write-Host "[1/3] Building Backend (Node.js -> EXE)..."
Push-Location backend
npm run build-exe
if ($LASTEXITCODE -ne 0) { Write-Error "Backend build failed"; exit 1 }
Pop-Location

# 2. Move Binary
Write-Host "[2/3] Updating Sidecar Binary..."
$backendBin = "backend\sample-manager-backend.exe"
$targetBin = "frontend\src-tauri\binaries\server-x86_64-pc-windows-msvc.exe"

if (Test-Path $backendBin) {
    Move-Item -Path $backendBin -Destination $targetBin -Force
    Write-Host "   - Moved $backendBin to $targetBin"
}
else {
    Write-Error "   - Backend binary not found!"
    exit 1
}

# 3. Build Frontend/Tauri
Write-Host "[3/3] Building Tauri Interface..."
Push-Location frontend
npm run tauri build
if ($LASTEXITCODE -ne 0) { Write-Error "Tauri build failed"; exit 1 }
Pop-Location

Write-Host "--------------------------------------------------------"
Write-Host "   BUILD SUCCESSFUL!"
Write-Host "   Installer located in: frontend\src-tauri\target\release\bundle\nsis"
Write-Host "--------------------------------------------------------"
