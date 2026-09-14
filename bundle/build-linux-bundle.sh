#!/usr/bin/env bash
# FaceGate — all-in-one offline bundle builder (Linux x64)
# -------------------------------------------------------
# Produces FaceGate-AllInOne-linux-x64.tar.gz containing the Electron shell,
# a self-contained Python runtime, every Python library, and the face models.
# The kiosk PC only unpacks and runs it: nothing is downloaded afterwards.
#
# Run on Ubuntu 20.04+ with Node.js 20+:
#   bash bundle/build-linux-bundle.sh
set -euo pipefail

CURRENT_STEP="startup"
trap 'code=$?; echo "ERROR: Linux bundle failed during: $CURRENT_STEP (exit $code)" >&2; df -h . /tmp 2>/dev/null || true; exit $code' ERR

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${TMPDIR:-/tmp}/facegate-work-linux"
RUNTIME="$WORK/runtime"
OUT="$ROOT/bundle/dist"

PYTHON_BUILD="https://github.com/astral-sh/python-build-standalone/releases/download/20240814/cpython-3.11.9+20240814-x86_64-unknown-linux-gnu-install_only.tar.gz"
MODEL_URL="https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip"

echo "== FaceGate all-in-one bundle (Linux x64) =="
rm -rf "$WORK"
mkdir -p "$RUNTIME/site" "$RUNTIME/models" "$OUT"

echo "[1/5] self-contained Python"
CURRENT_STEP="downloading embedded Python"
curl -fsSL "$PYTHON_BUILD" -o "$WORK/python.tar.gz"
tar xzf "$WORK/python.tar.gz" -C "$RUNTIME"
# the archive unpacks as "python/"
PY="$RUNTIME/python/bin/python3"
"$PY" -m ensurepip --upgrade >/dev/null 2>&1 || true

echo "[2/5] Python libraries into runtime/site"
CURRENT_STEP="installing Python libraries"
"$PY" -m pip install --no-cache-dir --no-compile \
  --target "$RUNTIME/site" -r "$ROOT/agent/requirements.txt"

echo "[3/5] face models"
CURRENT_STEP="downloading face models"
curl -fsSL "$MODEL_URL" -o "$WORK/buffalo_sc.zip"
mkdir -p "$WORK/models-tmp"
(cd "$WORK/models-tmp" && (unzip -oq "$WORK/buffalo_sc.zip" || python3 -c "import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall('.')" "$WORK/buffalo_sc.zip"))
for name in det_500m.onnx w600k_mbf.onnx; do
  found="$(find "$WORK/models-tmp" -name "$name" | head -1)"
  [ -n "$found" ] || { echo "model $name missing"; exit 1; }
  cp "$found" "$RUNTIME/models/$name"
done

echo "[4/5] Electron shell"
CURRENT_STEP="installing Electron build tools"
cd "$ROOT"
if command -v bun >/dev/null 2>&1; then
  bun install
else
  npm install --no-audit --no-fund --legacy-peer-deps --no-package-lock
fi
CURRENT_STEP="packaging Electron"
./node_modules/.bin/electron-packager . "FaceGate" \
  --platform=linux --arch=x64 \
  --out="$WORK/packaged" --overwrite \
  --asar.unpackDir=agent \
  --ignore="^/node_modules" --ignore="^/src" --ignore="^/public" \
  --ignore="^/bundle" --ignore="^/mobile" --ignore="^/supabase" \
  --ignore="^/.github" --ignore="^/.git" --ignore="^/electron-release" \
  --ignore="^/dist"

APP="$WORK/packaged/FaceGate-linux-x64"
CURRENT_STEP="copying offline runtime"
[ -x "$APP/FaceGate" ] || { echo "Electron executable was not created: $APP/FaceGate" >&2; exit 1; }
cp -r "$RUNTIME" "$APP/resources/runtime"
cp "$ROOT/bundle/facegate-install.sh" "$APP/install.sh"
chmod +x "$APP/install.sh"

echo "[5/5] compressing"
CURRENT_STEP="compressing final archive"
tar czf "$OUT/FaceGate-AllInOne-linux-x64.tar.gz" -C "$WORK/packaged" "FaceGate-linux-x64"
test -s "$OUT/FaceGate-AllInOne-linux-x64.tar.gz"
CURRENT_STEP="complete"
echo "done -> $OUT/FaceGate-AllInOne-linux-x64.tar.gz"
