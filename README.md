# FaceGate — ระบบสแกนใบหน้าเข้า-ออกโรงเรียน

ระบบประกอบด้วยสองส่วนหลัก:

1. **เว็บแอป / ระบบหลังบ้าน** — จัดการนักเรียน ลงทะเบียนใบหน้า ดูประวัติเข้า-ออก ตั้งค่าเครื่องสแกน และดูรายงาน
2. **โปรแกรมตู้สแกนบนเครื่อง PC** — รับภาพจากเว็บแคม ประมวลผลใบหน้าด้วย ArcFace (InsightFace) แบบ local แล้วส่งผลลัพธ์กลับไปยังเว็บแอป

## ติดตั้งบนเครื่องตู้สแกน (แนะนำ)

ใช้ไฟล์ Electron ที่แพ็กไว้แล้ว ไม่ต้องเปิดเบราว์เซอร์เอง ไม่ต้องรัน Python เอง (แต่ยังต้องติดตั้ง Python บนเครื่องก่อน):

- **Windows:** `FaceGate-win32-x64.zip`
- **Linux:** `FaceGate-linux-x64.tar.gz`

### ขั้นตอน

1. ติดตั้ง Python 3.10+ บนเครื่อง Intel Atom
2. แตกไฟล์ Electron ที่ดาวน์โหลด
3. เปิดโฟลเดอร์ `agent/` แล้วติดตั้งไลบรารี:

   ```bash
   python -m venv .venv
   .venv\Scripts\activate      # Windows
   # source .venv/bin/activate # Linux
   pip install -r requirements.txt
   ```

4. เปิดโปรแกรม `FaceGate.exe` (Windows) หรือ `./FaceGate` (Linux)
5. ใส่ **รหัสเครื่อง** จากหน้า "ตั้งค่าระบบ → เครื่องตู้สแกน" ในครั้งแรก
6. โปรแกรมจะเปิดเต็มจอและเริ่มสแกนอัตโนมัติ

## ติดตั้งแบบ Manual (ไม่ใช้ Electron)

หากต้องการรัน agent ผ่าน command line โดยตรง:

```bash
cd agent
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export FACEGATE_DEVICE_KEY=รหัสเครื่อง
export FACEGATE_CLOUD_URL=https://connextedscan.lovable.app
python agent.py
```

จากนั้นเปิดเบราว์เซอร์ที่ `https://connextedscan.lovable.app/kiosk`

## หมายเหตุเรื่องฮาร์ดแวร์

- ArcFace รันบน **CPU** เป็นหลัก การ์ดจออนบอร์ดของ Intel Atom มักไม่ได้ช่วยเพิ่มความเร็ว
- หากเครื่องช้า ให้ลดความละเอียดภาพที่ส่งเข้าโมเดล หรือพิจารณาอัปเกรดเป็น Celeron/J4125 ขึ้นไป
- แสกนทีละคนเท่านั้น หากกล้องจับได้หลายใบหน้าพร้อมกัน ระบบจะปฏิเสธและขอให้เข้ามาคนเดียว
