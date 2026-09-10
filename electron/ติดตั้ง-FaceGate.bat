@echo off
setlocal
cd /d "%~dp0"
echo ==========================================
echo   FaceGate Installer
echo ==========================================
echo.
if not exist "install.ps1" (
  echo [ERROR] install.ps1 not found.
  echo Please extract the ZIP file completely first,
  echo then double-click this file from the extracted folder.
  echo.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
pause
