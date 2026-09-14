// เพิ่ม permission กล้อง / อินเทอร์เน็ต / ป้องกันจอดับ และตั้งชื่อแอปในโปรเจกต์ Android
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const manifestPath = "android/app/src/main/AndroidManifest.xml";
const stringsPath = "android/app/src/main/res/values/strings.xml";

if (!existsSync(manifestPath)) {
  console.error("ยังไม่มีโปรเจกต์ Android — รัน `npx cap add android` ก่อน");
  process.exit(1);
}

let manifest = readFileSync(manifestPath, "utf8");

const permissions = [
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-permission android:name="android.permission.INTERNET" />',
  '<uses-permission android:name="android.permission.WAKE_LOCK" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
];

for (const line of permissions) {
  const marker = line.match(/android:name="([^"]+)"/)?.[1] ?? "";
  if (!manifest.includes(marker)) {
    manifest = manifest.replace("</manifest>", `    ${line}\n</manifest>`);
  }
}

// ล็อกแนวนอน + เปิดเต็มจอ + คงหน้าจอไว้เสมอ
manifest = manifest.replace(
  /android:name="\.MainActivity"/,
  'android:name=".MainActivity"\n            android:screenOrientation="fullSensor"\n            android:keepScreenOn="true"',
);

writeFileSync(manifestPath, manifest);

if (existsSync(stringsPath)) {
  let strings = readFileSync(stringsPath, "utf8");
  strings = strings
    .replace(/(<string name="app_name">)[^<]*/, "$1FaceGate Scanner")
    .replace(/(<string name="title_activity_main">)[^<]*/, "$1FaceGate Scanner");
  writeFileSync(stringsPath, strings);
}

console.log("ตั้งค่า AndroidManifest เรียบร้อย");
