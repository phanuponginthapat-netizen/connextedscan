#!/usr/bin/env bash
# สร้างไฟล์ APK สำหรับแท็บเล็ต (FaceGate Scanner)
# ต้องมี: Node.js 20+, JDK 17, Android SDK (ANDROID_HOME)
# วิธีใช้: bash mobile/apk/build-apk.sh [https://your-site.lovable.app]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

SITE_URL="${1:-https://connextedscan.lovable.app}"
SCAN_URL="${SITE_URL%/}/tablet"

echo "==> เว็บที่แอปจะเปิด: $SCAN_URL"
node -e "const f='capacitor.config.json',c=require('./'+f);c.server.url=process.argv[1];require('fs').writeFileSync(f,JSON.stringify(c,null,2)+'\n')" "$SCAN_URL"

echo "==> ติดตั้ง dependencies"
npm install --no-audit --no-fund

if [ ! -d android ]; then
  echo "==> สร้างโปรเจกต์ Android"
  npx cap add android
fi

echo "==> ตั้งค่า permission กล้อง / หน้าจอเต็ม"
node ./configure-android.mjs

echo "==> sync"
npx cap sync android

echo "==> build APK"
cd android
chmod +x ./gradlew
./gradlew assembleDebug

OUT="$HERE/android/app/build/outputs/apk/debug/app-debug.apk"
DEST="$HERE/FaceGate-Scanner.apk"
cp "$OUT" "$DEST"
echo
echo "เสร็จแล้ว: $DEST"
echo "คัดลอกไฟล์นี้ไปวางที่ public/downloads/FaceGate-Scanner.apk เพื่อให้ดาวน์โหลดจากหน้าเว็บได้"
