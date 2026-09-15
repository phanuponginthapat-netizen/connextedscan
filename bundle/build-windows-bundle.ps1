# FaceGate -- all-in-one offline bundle builder (Windows x64)
# ---------------------------------------------------------
# Produces FaceGate-AllInOne-windows-x64.zip containing:
#   FaceGate.exe + Electron shell
#   resources/runtime/python   embedded Python interpreter
#   resources/runtime/site     every Python library the scanner needs
#   resources/runtime/models   ArcFace + SCRFD face models
#   resources/app.asar.unpacked/agent  the scanner code
# The kiosk PC only has to unzip and run -- nothing is downloaded at install
# time or at first launch.
#
# Run on Windows with PowerShell 5+ and Node.js 22+:
#   powershell -ExecutionPolicy Bypass -File bundle\build-windows-bundle.ps1

param([switch]$Standalone)

$ErrorActionPreference = "Stop"
$archiveName = if ($Standalone) { "FaceGate-Standalone-windows-x64.zip" } else { "FaceGate-AllInOne-windows-x64.zip" }
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$work = Join-Path $env:TEMP "facegate-work-win"
$runtime = Join-Path $work "runtime"
$pythonDir = Join-Path $runtime "python"
$siteDir = Join-Path $runtime "site"
$modelDir = Join-Path $runtime "models"
$out = Join-Path $root "bundle\dist"

$PYTHON_VERSION = "3.11.9"
$PYTHON_URL = "https://www.python.org/ftp/python/$PYTHON_VERSION/python-$PYTHON_VERSION-embed-amd64.zip"
$GETPIP_URL = "https://bootstrap.pypa.io/get-pip.py"
$MODEL_URL = "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip"

Write-Host "== FaceGate all-in-one bundle (Windows x64) ==" -ForegroundColor Cyan
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $work, $runtime, $siteDir, $modelDir, $out | Out-Null

# ---------- 1. embedded Python ----------
Write-Host "[1/5] embedded Python $PYTHON_VERSION" -ForegroundColor Yellow
$pyZip = Join-Path $work "python-embed.zip"
Invoke-WebRequest -Uri $PYTHON_URL -OutFile $pyZip
Expand-Archive $pyZip -DestinationPath $pythonDir -Force
# The embedded build runs isolated and ignores PYTHONPATH until the ._pth
# file says otherwise; also register the bundled runtime\site folder.
Get-ChildItem $pythonDir -Filter "python*._pth" | ForEach-Object {
    Add-Content $_.FullName "import site"
    Add-Content $_.FullName "..\site"
    Add-Content $_.FullName "Lib\site-packages"
}
Invoke-WebRequest -Uri $GETPIP_URL -OutFile (Join-Path $work "get-pip.py")
& (Join-Path $pythonDir "python.exe") (Join-Path $work "get-pip.py") --no-warn-script-location

# ---------- 2. Python libraries ----------
Write-Host "[2/5] Python libraries into runtime\site" -ForegroundColor Yellow
& (Join-Path $pythonDir "python.exe") -m pip install `
    --no-cache-dir --no-compile `
    --target $siteDir `
    -r (Join-Path $root "agent\requirements.txt")

# ---------- 3. face models ----------
Write-Host "[3/5] face models" -ForegroundColor Yellow
$modelZip = Join-Path $work "buffalo_sc.zip"
Invoke-WebRequest -Uri $MODEL_URL -OutFile $modelZip
$modelTmp = Join-Path $work "models-tmp"
Expand-Archive $modelZip -DestinationPath $modelTmp -Force
foreach ($name in @("det_500m.onnx", "w600k_mbf.onnx")) {
    $found = Get-ChildItem $modelTmp -Recurse -Filter $name | Select-Object -First 1
    if (-not $found) { throw "model $name missing from $MODEL_URL" }
    Copy-Item $found.FullName (Join-Path $modelDir $name) -Force
}

# ---------- 3b. Thai offline voice ----------
Write-Host "[3b/5] Thai offline voice (piper)" -ForegroundColor Yellow
$voiceDir = Join-Path $runtime "voices"
New-Item -ItemType Directory -Force -Path $voiceDir | Out-Null
$piperZip = Join-Path $work "piper.zip"
Invoke-WebRequest -Uri "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip" -OutFile $piperZip
Expand-Archive $piperZip -DestinationPath $voiceDir -Force
Invoke-WebRequest -Uri "https://huggingface.co/rhasspy/piper-voices/resolve/main/th/th_TH/tsync2/medium/th_TH-tsync2-medium.onnx?download=true" -OutFile (Join-Path $voiceDir "th_TH-tsync2-medium.onnx")
Invoke-WebRequest -Uri "https://huggingface.co/rhasspy/piper-voices/resolve/main/th/th_TH/tsync2/medium/th_TH-tsync2-medium.onnx.json?download=true" -OutFile (Join-Path $voiceDir "th_TH-tsync2-medium.onnx.json")

# ---------- 4. Electron shell ----------
Write-Host "[4/5] Electron shell" -ForegroundColor Yellow
Push-Location $root
if (Get-Command bun -ErrorAction SilentlyContinue) {
    & bunx --bun "@electron/packager@20.3.0" . "FaceGate" `
        --platform=win32 --arch=x64 `
        --electron-version=44.3.0 `
        --out="$work\packaged" --overwrite `
        --asar=false `
        --ignore="^/node_modules" --ignore="^/src" --ignore="^/public" `
        --ignore="^/bundle" --ignore="^/mobile" --ignore="^/supabase" `
        --ignore="^/.github" --ignore="^/.git" --ignore="^/electron-release" `
        --ignore="^/dist"
} else {
    & npx --yes "@electron/packager@20.3.0" . "FaceGate" `
        --platform=win32 --arch=x64 `
        --electron-version=44.3.0 `
        --out="$work\packaged" --overwrite `
        --asar=false `
        --ignore="^/node_modules" --ignore="^/src" --ignore="^/public" `
        --ignore="^/bundle" --ignore="^/mobile" --ignore="^/supabase" `
        --ignore="^/.github" --ignore="^/.git" --ignore="^/electron-release" `
        --ignore="^/dist"
}
if ($LASTEXITCODE -ne 0) { throw "Electron packaging failed with exit code $LASTEXITCODE" }
Pop-Location

$appDir = Join-Path $work "packaged\FaceGate-win32-x64"
if (-not (Test-Path (Join-Path $appDir "FaceGate.exe"))) { throw "Electron executable was not created" }
Copy-Item $runtime (Join-Path $appDir "resources\runtime") -Recurse -Force
if ($Standalone) {
    New-Item -ItemType File -Force -Path (Join-Path $appDir "resources\standalone.flag") | Out-Null
    Copy-Item (Join-Path $root "bundle\STANDALONE-README.txt") (Join-Path $appDir "อ่านก่อน-ติดตั้ง.txt") -Force
}
Copy-Item (Join-Path $root "electron\install.ps1") $appDir -Force
Get-ChildItem (Join-Path $root "electron") -Filter "*FaceGate.bat" | Copy-Item -Destination $appDir -Force

# ---------- 5. zip ----------
Write-Host "[5/5] compressing" -ForegroundColor Yellow
$zip = Join-Path $out $archiveName
Remove-Item $zip -Force -ErrorAction SilentlyContinue
$sevenZip = Get-Command 7z -ErrorAction SilentlyContinue
if ($sevenZip) {
    Push-Location $appDir
    & $sevenZip.Source a -tzip -mx=1 -bso0 $zip "*"
    $zipExit = $LASTEXITCODE
    Pop-Location
    if ($zipExit -ne 0) { throw "7z packaging failed with exit code $zipExit" }
} else {
    Compress-Archive -Path (Join-Path $appDir "*") -DestinationPath $zip
}
if (-not (Test-Path $zip)) { throw "final archive was not created" }
Write-Host "done -> $zip" -ForegroundColor Green
