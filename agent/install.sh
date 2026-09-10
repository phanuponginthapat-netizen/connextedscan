#!/usr/bin/env bash
# FaceGate agent installer (Linux)
# Usage: curl -fsSL "<URL>/api/public/agent/install.sh?key=DEVICEKEY" | bash
set -euo pipefail

CLOUD_URL="${FACEGATE_CLOUD_URL:-__CLOUD_URL__}"
DEVICE_KEY="${FACEGATE_DEVICE_KEY:-__DEVICE_KEY__}"
ROOT="${FACEGATE_HOME:-$HOME/.facegate}"

echo "ติดตั้ง FaceGate ที่ $ROOT"
mkdir -p "$ROOT"

PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys;exit(0 if sys.version_info[:2]>=(3,9) else 1)'; then PY="$c"; break; fi
done
if [ -z "$PY" ]; then
  echo "ไม่พบ Python 3.9+ กำลังติดตั้ง..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -y && sudo apt-get install -y python3 python3-venv python3-pip libgl1 libglib2.0-0
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y python3 python3-pip mesa-libGL
  else
    echo "กรุณาติดตั้ง Python 3.9+ เองแล้วรันคำสั่งนี้ใหม่"; exit 1
  fi
  PY=python3
fi

echo "ดาวน์โหลดโปรแกรมตรวจใบหน้า..."
curl -fsSL "$CLOUD_URL/api/public/agent/agent.py" -o "$ROOT/agent.py"
curl -fsSL "$CLOUD_URL/api/public/agent/requirements.txt" -o "$ROOT/requirements.txt"

[ -x "$ROOT/.venv/bin/python" ] || "$PY" -m venv "$ROOT/.venv"
VPY="$ROOT/.venv/bin/python"

echo "ติดตั้งไลบรารี (ครั้งแรกใช้เวลาสักครู่)..."
"$VPY" -m pip install --upgrade pip --quiet
"$VPY" -m pip install -r "$ROOT/requirements.txt"

cat > "$ROOT/run-agent.sh" <<EOF
#!/usr/bin/env bash
export FACEGATE_CLOUD_URL="$CLOUD_URL"
export FACEGATE_DEVICE_KEY="$DEVICE_KEY"
cd "$ROOT"
exec "$VPY" agent.py
EOF
chmod +x "$ROOT/run-agent.sh"

# เปิดอัตโนมัติเมื่อเข้าเครื่อง (systemd user service)
if command -v systemctl >/dev/null 2>&1; then
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/facegate-agent.service" <<EOF
[Unit]
Description=FaceGate Agent
After=network-online.target

[Service]
ExecStart=$ROOT/run-agent.sh
Restart=always

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now facegate-agent.service || "$ROOT/run-agent.sh" &
else
  nohup "$ROOT/run-agent.sh" >"$ROOT/agent.log" 2>&1 &
fi

echo "ติดตั้งเสร็จแล้ว เปิดหน้าสแกนได้ที่ $CLOUD_URL/kiosk"
