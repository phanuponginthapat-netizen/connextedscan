#!/usr/bin/env bash
# =====================================================================
#  FaceGate Setup for Linux (x64)
#  ทำงานเหมือนไฟล์ติดตั้ง .exe บน Windows
#  - ติดตั้ง Python + ไลบรารีตรวจใบหน้า (ArcFace/ONNX)
#  - ติดตั้งตัวโปรแกรม FaceGate ลงเครื่อง
#  - สร้างคำสั่ง `facegate` + ไอคอนในเมนูโปรแกรม
#  - ตั้งให้เปิดเองทุกครั้งที่เปิดเครื่อง แล้วเปิดหน้าสแกนแบบเต็มจอ
#
#  วิธีใช้:
#    bash FaceGate-Setup-linux-x64.sh
#  หรือ:
#    curl -fsSL "<URL>/api/public/agent/install.sh?key=DEVICEKEY" | bash
# =====================================================================
set -euo pipefail

CLOUD_URL="${FACEGATE_CLOUD_URL:-__CLOUD_URL__}"
DEVICE_KEY="${FACEGATE_DEVICE_KEY:-__DEVICE_KEY__}"
ROOT="${FACEGATE_HOME:-$HOME/.facegate}"

if [ "$DEVICE_KEY" = "__DEVICE_KEY__" ] || [ -z "$DEVICE_KEY" ] || [ "$DEVICE_KEY" = "รหัสเครื่อง" ]; then
  if [ -t 0 ]; then
    printf "ใส่รหัสเครื่อง (Device Key) จากหน้าหลังบ้าน: "
    read -r DEVICE_KEY
  else
    DEVICE_KEY=""
  fi
fi

echo "=============================================="
echo "   FaceGate Setup (Linux x64)"
echo "   ปลายทาง: $ROOT"
echo "=============================================="
mkdir -p "$ROOT"

# ---------- 1) Python ----------
PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys;exit(0 if sys.version_info[:2]>=(3,9) else 1)' 2>/dev/null; then
    PY="$c"; break
  fi
done

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi

install_system_deps() {
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update -y
    $SUDO apt-get install -y python3 python3-venv python3-pip libgl1 libglib2.0-0 v4l-utils curl
  elif command -v dnf >/dev/null 2>&1; then
    $SUDO dnf install -y python3 python3-pip mesa-libGL glib2 curl
  elif command -v pacman >/dev/null 2>&1; then
    $SUDO pacman -Sy --noconfirm python python-pip mesa glib2 curl
  else
    echo "กรุณาติดตั้ง Python 3.9+ เองแล้วรันไฟล์นี้ใหม่"; exit 1
  fi
}

if [ -z "$PY" ]; then
  echo "[1/5] ไม่พบ Python 3.9+ กำลังติดตั้งให้อัตโนมัติ..."
  install_system_deps
  PY=python3
else
  echo "[1/5] พบ Python แล้ว ($PY)"
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get install -y python3-venv libgl1 libglib2.0-0 >/dev/null 2>&1 || true
  fi
fi

# ---------- 2) โปรแกรม ----------
echo "[2/5] ดาวน์โหลดโปรแกรมตรวจใบหน้า..."
curl -fsSL "$CLOUD_URL/api/public/agent/agent.py" -o "$ROOT/agent.py"
curl -fsSL "$CLOUD_URL/api/public/agent/face_engine.py" -o "$ROOT/face_engine.py"
curl -fsSL "$CLOUD_URL/api/public/agent/door.py" -o "$ROOT/door.py"
curl -fsSL "$CLOUD_URL/api/public/agent/requirements.txt" -o "$ROOT/requirements.txt"

# ---------- 3) ไลบรารี ----------
echo "[3/5] ติดตั้งไลบรารี (ครั้งแรกใช้เวลา 5-15 นาที ประมาณ 300 MB)..."
[ -x "$ROOT/.venv/bin/python" ] || "$PY" -m venv "$ROOT/.venv"
VPY="$ROOT/.venv/bin/python"
"$VPY" -m pip install --upgrade pip --quiet
"$VPY" -m pip install -r "$ROOT/requirements.txt"

cat > "$ROOT/config.env" <<EOF
FACEGATE_CLOUD_URL=$CLOUD_URL
FACEGATE_DEVICE_KEY=$DEVICE_KEY
EOF

# ---------- 4) ตัวเปิดโปรแกรม ----------
echo "[4/5] สร้างตัวเปิดโปรแกรม..."
cat > "$ROOT/facegate" <<EOF
#!/usr/bin/env bash
set -a; . "$ROOT/config.env"; set +a
export FACEGATE_THREADS="\${FACEGATE_THREADS:-\$(nproc)}"
cd "$ROOT"
# เริ่มตัวประมวลผลใบหน้า ถ้ายังไม่ทำงาน
if ! curl -fsS --max-time 2 http://127.0.0.1:8899/health >/dev/null 2>&1; then
  nohup "$VPY" agent.py >"$ROOT/agent.log" 2>&1 &
fi
# รอให้พร้อมสูงสุด 60 วินาที
for i in \$(seq 1 60); do
  curl -fsS --max-time 2 http://127.0.0.1:8899/health >/dev/null 2>&1 && break
  sleep 1
done
# เปิดหน้าสแกนแบบเต็มจอ
for B in google-chrome chromium chromium-browser microsoft-edge brave-browser; do
  if command -v "\$B" >/dev/null 2>&1; then
    exec "\$B" --kiosk --autoplay-policy=no-user-gesture-required \\
      --use-fake-ui-for-media-stream --disable-background-timer-throttling \\
      "\$FACEGATE_CLOUD_URL/kiosk"
  fi
done
if command -v firefox >/dev/null 2>&1; then exec firefox --kiosk "\$FACEGATE_CLOUD_URL/kiosk"; fi
echo "ไม่พบเบราว์เซอร์ กรุณาติดตั้ง chromium แล้วเปิด \$FACEGATE_CLOUD_URL/kiosk"
EOF
chmod +x "$ROOT/facegate"

mkdir -p "$HOME/.local/bin"
ln -sf "$ROOT/facegate" "$HOME/.local/bin/facegate"

mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/facegate.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=FaceGate
Comment=ตู้สแกนใบหน้าเข้า-ออก
Exec=$ROOT/facegate
Terminal=false
Categories=Utility;
EOF

# ---------- 5) เปิดอัตโนมัติ ----------
echo "[5/5] ตั้งให้เปิดเองเมื่อเปิดเครื่อง..."
if command -v systemctl >/dev/null 2>&1; then
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/facegate-agent.service" <<EOF
[Unit]
Description=FaceGate Face Engine
After=network-online.target

[Service]
EnvironmentFile=$ROOT/config.env
WorkingDirectory=$ROOT
ExecStart=$VPY $ROOT/agent.py
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload || true
  systemctl --user enable --now facegate-agent.service || nohup "$VPY" "$ROOT/agent.py" >"$ROOT/agent.log" 2>&1 &
  command -v loginctl >/dev/null 2>&1 && loginctl enable-linger "$USER" >/dev/null 2>&1 || true
else
  mkdir -p "$HOME/.config/autostart"
  cp "$HOME/.local/share/applications/facegate.desktop" "$HOME/.config/autostart/facegate.desktop"
  nohup "$VPY" "$ROOT/agent.py" >"$ROOT/agent.log" 2>&1 &
fi

echo
echo "=============================================="
echo " ติดตั้งเสร็จแล้ว"
echo " เปิดโปรแกรมด้วยคำสั่ง:  facegate"
echo " หรือเลือก FaceGate ในเมนูโปรแกรม"
echo " หน้าสแกน: $CLOUD_URL/kiosk"
echo "=============================================="

if [ -t 0 ] && command -v "$ROOT/facegate" >/dev/null 2>&1; then
  nohup "$ROOT/facegate" >/dev/null 2>&1 &
fi
