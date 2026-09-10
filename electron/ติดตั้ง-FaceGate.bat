@echo off
chcp 65001 >nul
title ติดตั้ง FaceGate
setlocal

set "TARGET=%LOCALAPPDATA%\FaceGate"
set "SOURCE=%~dp0"

echo.
echo ============================================
echo   ติดตั้งระบบสแกนใบหน้า FaceGate
echo ============================================
echo.
echo กำลังคัดลอกไฟล์ไปที่ %TARGET%
echo (ใช้เวลาสักครู่ ประมาณ 1-3 นาที)
echo.

if exist "%TARGET%" rmdir /s /q "%TARGET%"
mkdir "%TARGET%"
robocopy "%SOURCE%." "%TARGET%" /E /NFL /NDL /NJH /NJS /NP /XF "ติดตั้ง-FaceGate.bat" >nul

echo กำลังสร้างไอคอนบนหน้าจอและตั้งให้เปิดอัตโนมัติ...

powershell -NoProfile -Command ^
  "$w = New-Object -ComObject WScript.Shell;" ^
  "$d = $w.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\FaceGate.lnk');" ^
  "$d.TargetPath = '%TARGET%\FaceGate.exe'; $d.WorkingDirectory = '%TARGET%'; $d.Save();" ^
  "$s = $w.CreateShortcut([Environment]::GetFolderPath('Startup') + '\FaceGate.lnk');" ^
  "$s.TargetPath = '%TARGET%\FaceGate.exe'; $s.WorkingDirectory = '%TARGET%'; $s.Save();"

echo.
echo ติดตั้งเสร็จแล้ว
echo เปิดโปรแกรมได้จากไอคอน FaceGate บนหน้าจอ
echo ครั้งแรกให้ใส่รหัสอุปกรณ์ (Device Key) จากเมนู "อุปกรณ์" ในระบบหลังบ้าน
echo.
pause
