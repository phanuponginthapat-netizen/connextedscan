# =====================================================================
#  FaceGate Setup for Windows (x64)
#  - ติดตั้ง Python + ไลบรารีตรวจใบหน้า (ArcFace/ONNX)
#  - ติดตั้งตัวโปรแกรม FaceGate ลงเครื่อง
#  - สร้างไอคอนบนเดสก์ท็อป + เปิดเองเมื่อเปิดเครื่อง
#  - เปิดหน้าสแกนแบบเต็มจอ
#
#  วิธีใช้ (Command Prompt / PowerShell):
#    powershell -ExecutionPolicy Bypass -c "irm <URL>/api/public/agent/install.ps1?key=DEVICEKEY | iex"
# =====================================================================

$ErrorActionPreference = "Stop"
if (-not $env:FACEGATE_CLOUD_URL) { $env:FACEGATE_CLOUD_URL = "__CLOUD_URL__" }
if (-not $env:FACEGATE_DEVICE_KEY) { $env:FACEGATE_DEVICE_KEY = "__DEVICE_KEY__" }
if ($env:FACEGATE_DEVICE_KEY -in @("__DEVICE_KEY__", "", "รหัสเครื่อง")) {
  $env:FACEGATE_DEVICE_KEY = Read-Host "ใส่รหัสเครื่อง (Device Key) จากหน้าหลังบ้าน"
}

$root = Join-Path $env:LOCALAPPDATA "FaceGate"
New-Item -ItemType Directory -Force -Path $root | Out-Null
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   FaceGate Setup (Windows x64)"               -ForegroundColor Cyan
Write-Host "   ปลายทาง: $root"                              -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

function Get-Python {
  foreach ($c in @("python", "python3", "py")) {
    try {
      $v = & $c -c "import sys;print('%d.%d' % sys.version_info[:2])" 2>$null
      if ($LASTEXITCODE -eq 0 -and [version]$v -ge [version]"3.9") { return $c }
    } catch {}
  }
  return $null
}

Write-Host "[1/5] ตรวจสอบ Python..." -ForegroundColor Cyan
$py = Get-Python
if (-not $py) {
  Write-Host "      ไม่พบ Python กำลังติดตั้งให้อัตโนมัติ..." -ForegroundColor Yellow
  $exe = Join-Path $env:TEMP "python-3.11.9-amd64.exe"
  Invoke-WebRequest "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe" -OutFile $exe
  Start-Process -FilePath $exe -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1 Include_pip=1" -Wait
  $env:Path = "$env:LOCALAPPDATA\Programs\Python\Python311;$env:LOCALAPPDATA\Programs\Python\Python311\Scripts;$env:Path"
  $py = Get-Python
  if (-not $py) { throw "ติดตั้ง Python ไม่สำเร็จ กรุณาติดตั้งเองจาก python.org แล้วรันคำสั่งนี้ใหม่" }
}

Write-Host "[2/5] ดาวน์โหลดโปรแกรมตรวจใบหน้า..." -ForegroundColor Cyan
Invoke-WebRequest "$($env:FACEGATE_CLOUD_URL)/api/public/agent/agent.py"        -OutFile (Join-Path $root "agent.py")
Invoke-WebRequest "$($env:FACEGATE_CLOUD_URL)/api/public/agent/face_engine.py"  -OutFile (Join-Path $root "face_engine.py")
Invoke-WebRequest "$($env:FACEGATE_CLOUD_URL)/api/public/agent/door.py"         -OutFile (Join-Path $root "door.py")
Invoke-WebRequest "$($env:FACEGATE_CLOUD_URL)/api/public/agent/requirements.txt" -OutFile (Join-Path $root "requirements.txt")

Write-Host "[3/5] ติดตั้งไลบรารี (ครั้งแรกใช้เวลา 5-15 นาที ประมาณ 300 MB)..." -ForegroundColor Cyan
$venv = Join-Path $root ".venv"
if (-not (Test-Path (Join-Path $venv "Scripts\python.exe"))) { & $py -m venv $venv }
$vpy = Join-Path $venv "Scripts\python.exe"
$vpyw = Join-Path $venv "Scripts\pythonw.exe"
& $vpy -m pip install --upgrade pip --quiet
& $vpy -m pip install -r (Join-Path $root "requirements.txt")

Write-Host "[4/5] สร้างตัวเปิดโปรแกรม..." -ForegroundColor Cyan
$run = Join-Path $root "FaceGate.bat"
@"
@echo off
set FACEGATE_CLOUD_URL=$($env:FACEGATE_CLOUD_URL)
set FACEGATE_DEVICE_KEY=$($env:FACEGATE_DEVICE_KEY)
cd /d "$root"
tasklist /fi "imagename eq pythonw.exe" | find /i "pythonw.exe" >nul || start "" "$vpyw" agent.py
timeout /t 6 /nobreak >nul
set BROWSER=
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if defined BROWSER (
  start "" "%BROWSER%" --kiosk "%FACEGATE_CLOUD_URL%/kiosk" --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream --disable-background-timer-throttling
) else (
  start "" "%FACEGATE_CLOUD_URL%/kiosk"
)
"@ | Set-Content -Encoding OEM $run

$ws = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("Startup"))) {
  $sc = $ws.CreateShortcut((Join-Path $dir "FaceGate.lnk"))
  $sc.TargetPath = $run
  $sc.WorkingDirectory = $root
  $sc.WindowStyle = 7
  $sc.Save()
}

Write-Host "[5/5] เริ่มโปรแกรม..." -ForegroundColor Cyan
Start-Process -FilePath $run -WindowStyle Minimized

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host " ติดตั้งเสร็จแล้ว"                                -ForegroundColor Green
Write-Host " เปิดโปรแกรมได้จากไอคอน FaceGate บนเดสก์ท็อป"    -ForegroundColor Green
Write-Host " หน้าสแกน: $($env:FACEGATE_CLOUD_URL)/kiosk"      -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
