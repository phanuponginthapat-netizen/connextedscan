# FaceGate Electron Shell

โฟลเดอร์นี้รวมตัวหน้าตู้สแกน (Electron) และเรียกใช้งาน Python agent ในพื้นหลัง ทำให้ผู้ใช้เปิดโปรแกรมเดียวจบ ไม่ต้องเปิดเบราว์เซอร์หรือรัน Python เอง

## ไฟล์หลัก

- `main.cjs` — จุดเริ่มต้น Electron: อ่านค่า config, เริ่ม agent, เปิดหน้า `/kiosk` แบบเต็มจอ
- `preload.cjs` — สะพาน IPC ระหว่างหน้าตั้งค่ากับ main process
- `settings.html` — หน้ากรอกรหัสเครื่องในครั้งแรก

## แพ็กไฟล์

```bash
# Windows
bun run electron:package:win

# Linux
bun run electron:package:linux
```

ไฟล์ที่ได้จะอยู่ใน `electron-release/` และถูกบีบอัดเป็น `.zip`/`.tar.gz` ไว้ที่ `/mnt/documents`

## หมายเหตุ

- ตัว Electron ไม่ได้บรรจุ Python หรือไลบรารีหนักของ agent มาด้วย ต้องติดตั้ง Python 3.10+ และ `pip install -r agent/requirements.txt` บนเครื่องก่อน
- รหัสเครื่องเก็บอยู่ในโฟลเดอร์ user data ของ Electron ไม่ได้เก็บใน repo
