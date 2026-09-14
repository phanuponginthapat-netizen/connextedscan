#!/usr/bin/env bash
# ติดตั้ง FaceGate แบบออฟไลน์ (รันจากในโฟลเดอร์ที่แตกไฟล์แล้ว)
# ไม่มีการดาวน์โหลดอะไรเพิ่ม ทุกอย่างอยู่ในโฟลเดอร์นี้แล้ว
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$HOME/.local/share/facegate"

if [ ! -x "$SRC/FaceGate" ]; then
  echo "[ผิดพลาด] ไม่พบไฟล์โปรแกรม FaceGate ในโฟลเดอร์นี้ กรุณาแตกไฟล์ให้ครบก่อน"
  exit 1
fi

echo "กำลังติดตั้ง FaceGate ไปที่ $TARGET"
rm -rf "$TARGET"
mkdir -p "$TARGET"
cp -r "$SRC/." "$TARGET/"
chmod +x "$TARGET/FaceGate"

mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications" "$HOME/.config/autostart"
ln -sf "$TARGET/FaceGate" "$HOME/.local/bin/facegate"

DESKTOP="$HOME/.local/share/applications/facegate.desktop"
cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=FaceGate
Comment=ระบบสแกนใบหน้าเข้า-ออกโรงเรียน
Exec=$TARGET/FaceGate
Terminal=false
Categories=Utility;
EOF
cp "$DESKTOP" "$HOME/.config/autostart/facegate.desktop"

echo ""
echo "ติดตั้งเสร็จเรียบร้อย เปิดโปรแกรมได้จากเมนูแอป หรือพิมพ์คำสั่ง: facegate"
echo "ครั้งแรกให้ใส่รหัสเครื่องที่ได้จากระบบหลังบ้าน"
