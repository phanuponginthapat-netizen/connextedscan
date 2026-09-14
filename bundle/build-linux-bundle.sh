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

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$ROOT/bundle/.work-linux"
RUNTIME="$WORK/runtime"
OUT="$ROOT/bundle/dist"

PYTHON_BUILD="https://github.com/astral-sh/python-build-standalone/releases/download/20240814/cpython-3.11.9+20240814-x86_64-unknown-linux-gnu-install_only.tar.gz"
MODEL_URL="https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip"

echo "== FaceGate all-in-one bundle (Linux x64) =="
rm -rf "$WORK"
mkdir -p "$RUNTIME/site" "$RUNTIME/models" "$OUT"

echo "[1/5] self-contained Python"
curl -fsSL "$PYTHON_BUILD" -o "$WORK/python.tar.gz"
tar xzf "$WORK/python.tar.gz" -C "$RUNTIME"
# the archive unpacks as "python/"
PY="$RUNTIME/python/bin/python3"
"$PY" -m ensurepip --upgrade >/dev/null 2>&1 || true

echo "[2/5] Python libraries into runtime/site"
"$PY" -m pip install --no-cache-dir --no-compile \
  --target "$RUNTIME/site" -r "$ROOT/agent/requirements.txt"

echo "[3/5] face models"
curl -fsSL "$MODEL_URL" -o "$WORK/buffalo_sc.zip"
mkdir -p "$WORK/models-tmp"
(cd "$WORK/models-tmp" && (unzip -oq "$WORK/buffalo_sc.zip" || python3 -c "import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall('.')" "$WORK/buffalo_sc.zip"))
for name in det_500m.onnx w600k_mbf.onnx; do
  found="$(find "$WORK/models-tmp" -name "$name" | head -1)"
  [ -n "$found" ] || { echo "model $name missing"; exit 1; }
  cp "$found" "$RUNTIME/models/$name"
done

echo "[4/5] Electron shell"
cd "$ROOT"
if command -v bun >/dev/null 2>&1; then
  bun install
else
  npm install --no-audit --no-fund --legacy-peer-deps --no-package-lock
fi
npx --yes @electron/packager . "FaceGate" \
  --platform=linux --arch=x64 \
  --out="$WORK/packaged" --overwrite \
  --asar.unpackDir=agent \
  --ignore="^/src" --ignore="^/public" --ignore="^/bundle" \
  --ignore="^/mobile" --ignore="^/supabase" --ignore="^/.github"

APP="$WORK/packaged/FaceGate-linux-x64"
cp -r "$RUNTIME" "$APP/resources/runtime"
cp "$ROOT/bundle/facegate-install.sh" "$APP/install.sh"
chmod +x "$APP/install.sh"

echo "[5/5] compressing"
tar czf "$OUT/FaceGate-AllInOne-linux-x64.tar.gz" -C "$WORK/packaged" "FaceGate-linux-x64"
echo "done -> $OUT/FaceGate-AllInOne-linux-x64.tar.gz"
