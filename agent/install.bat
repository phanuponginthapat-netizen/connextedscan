@echo off
chcp 65001 >nul
title FaceGate Setup (Windows x64)
echo ==============================================
echo    FaceGate Setup (Windows x64)
echo ==============================================
echo.
set "CLOUD_URL=__CLOUD_URL__"
set "DEVICE_KEY=__DEVICE_KEY__"
if "%DEVICE_KEY%"=="__DEVICE_KEY__" set "DEVICE_KEY="
if "%DEVICE_KEY%"=="" set /p DEVICE_KEY=ใส่รหัสเครื่อง (Device Key) จากหน้าหลังบ้าน:
echo.
echo กำลังติดตั้ง กรุณาอย่าปิดหน้าต่างนี้...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$env:FACEGATE_CLOUD_URL='%CLOUD_URL%'; $env:FACEGATE_DEVICE_KEY='%DEVICE_KEY%'; irm '%CLOUD_URL%/api/public/agent/install.ps1' | iex"
echo.
pause
