# FaceGate Installer — run via ติดตั้ง-FaceGate.bat
$ErrorActionPreference = "Stop"
$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $env:LOCALAPPDATA "FaceGate"

Write-Host ""
Write-Host "กำลังติดตั้ง FaceGate ไปที่ $target" -ForegroundColor Cyan
Write-Host "(อาจใช้เวลา 1-3 นาที โปรดรอ)" -ForegroundColor DarkGray
Write-Host ""

# ต้องแตก ZIP ก่อน: ตรวจว่า exe อยู่ในโฟลเดอร์เดียวกับสคริปต์
if (-not (Test-Path (Join-Path $source "FaceGate.exe"))) {
    Write-Host "[ผิดพลาด] ไม่พบ FaceGate.exe ในโฟลเดอร์นี้" -ForegroundColor Red
    Write-Host "กรุณาแตกไฟล์ ZIP ให้ครบก่อน แล้วดับเบิลคลิก ติดตั้ง-FaceGate.bat จากโฟลเดอร์ที่แตกไฟล์" -ForegroundColor Yellow
    exit 1
}

if (Test-Path $target) { Remove-Item $target -Recurse -Force }
New-Item -ItemType Directory -Path $target | Out-Null
Copy-Item (Join-Path $source "*") $target -Recurse -Force `
    -Exclude "ติดตั้ง-FaceGate.bat", "install.ps1"

Write-Host "กำลังสร้างไอคอนบนหน้าจอและตั้งให้เปิดอัตโนมัติ..." -ForegroundColor Cyan

$w = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$startup = [Environment]::GetFolderPath("Startup")
foreach ($dir in @($desktop, $startup)) {
    $lnk = $w.CreateShortcut((Join-Path $dir "FaceGate.lnk"))
    $lnk.TargetPath = Join-Path $target "FaceGate.exe"
    $lnk.WorkingDirectory = $target
    $lnk.Save()
}

Write-Host ""
Write-Host "ติดตั้งเสร็จเรียบร้อย!" -ForegroundColor Green
Write-Host "เปิดโปรแกรมได้จากไอคอน FaceGate บนหน้าจอ และจะเปิดเองทุกครั้งที่เปิดเครื่อง" -ForegroundColor Green
Write-Host "ครั้งแรกให้ใส่ Device Key จากเมนู 'อุปกรณ์' ในระบบหลังบ้าน" -ForegroundColor Yellow
Write-Host ""
