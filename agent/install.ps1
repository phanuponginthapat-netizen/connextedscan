# FaceGate agent installer (Windows)
# Usage: powershell -ExecutionPolicy Bypass -c "irm <URL>/api/public/agent/install.ps1?key=DEVICEKEY | iex"

$ErrorActionPreference = "Stop"
if (-not $env:FACEGATE_CLOUD_URL) { $env:FACEGATE_CLOUD_URL = "__CLOUD_URL__" }
if (-not $env:FACEGATE_DEVICE_KEY) { $env:FACEGATE_DEVICE_KEY = "__DEVICE_KEY__" }

$root = Join-Path $env:LOCALAPPDATA "FaceGate"
New-Item -ItemType Directory -Force -Path $root | Out-Null
Write-Host "ติดตั้ง FaceGate ที่ $root" -ForegroundColor Cyan

function Get-Python {
  foreach ($c in @("python", "python3", "py")) {
    try {
      $v = & $c -c "import sys;print('%d.%d' % sys.version_info[:2])" 2>$null
      if ($LASTEXITCODE -eq 0 -and [version]$v -ge [version]"3.9") { return $c }
    } catch {}
  }
  return $null
}

$py = Get-Python
if (-not $py) {
  Write-Host "ไม่พบ Python กำลังดาวน์โหลดและติดตั้งให้อัตโนมัติ..." -ForegroundColor Yellow
  $exe = Join-Path $env:TEMP "python-3.11.9-amd64.exe"
  Invoke-WebRequest "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe" -OutFile $exe
  Start-Process -FilePath $exe -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1 Include_pip=1" -Wait
  $env:Path = "$env:LOCALAPPDATA\Programs\Python\Python311;$env:LOCALAPPDATA\Programs\Python\Python311\Scripts;$env:Path"
  $py = Get-Python
  if (-not $py) { throw "ติดตั้ง Python ไม่สำเร็จ กรุณาติดตั้งเองจาก python.org แล้วรันคำสั่งนี้ใหม่" }
}

Write-Host "ดาวน์โหลดโปรแกรมตรวจใบหน้า..." -ForegroundColor Cyan
Invoke-WebRequest "$($env:FACEGATE_CLOUD_URL)/api/public/agent/agent.py" -OutFile (Join-Path $root "agent.py")
Invoke-WebRequest "$($env:FACEGATE_CLOUD_URL)/api/public/agent/requirements.txt" -OutFile (Join-Path $root "requirements.txt")

$venv = Join-Path $root ".venv"
if (-not (Test-Path (Join-Path $venv "Scripts\python.exe"))) { & $py -m venv $venv }
$vpy = Join-Path $venv "Scripts\python.exe"

Write-Host "ติดตั้งไลบรารี (ครั้งแรกใช้เวลาสักครู่)..." -ForegroundColor Cyan
& $vpy -m pip install --upgrade pip --quiet
& $vpy -m pip install -r (Join-Path $root "requirements.txt")

$run = Join-Path $root "run-agent.bat"
@"
@echo off
set FACEGATE_CLOUD_URL=$($env:FACEGATE_CLOUD_URL)
set FACEGATE_DEVICE_KEY=$($env:FACEGATE_DEVICE_KEY)
cd /d "$root"
"$vpy" agent.py
"@ | Set-Content -Encoding OEM $run

# เปิดอัตโนมัติเมื่อเข้าเครื่อง
$startup = [Environment]::GetFolderPath("Startup")
$lnk = Join-Path $startup "FaceGate Agent.lnk"
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnk)
$sc.TargetPath = $run
$sc.WorkingDirectory = $root
$sc.WindowStyle = 7
$sc.Save()

Write-Host "ติดตั้งเสร็จแล้ว กำลังเริ่มโปรแกรม..." -ForegroundColor Green
Start-Process -FilePath $run -WindowStyle Minimized
Start-Sleep -Seconds 5
Start-Process "$($env:FACEGATE_CLOUD_URL)/kiosk"
