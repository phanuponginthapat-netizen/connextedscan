# โปรแกรมตู้สแกน FaceGate (เครื่อง Intel Atom + เว็บแคม)

## ติดตั้ง

```bash
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## ตั้งค่า

นำรหัสเครื่องจากหน้า "ตั้งค่าระบบ → เครื่องตู้สแกน" มาใส่:

```bash
export FACEGATE_DEVICE_KEY=รหัสเครื่องที่คัดลอกมา
export FACEGATE_CLOUD_URL=https://project--8a2237fd-d733-4dca-9c68-fe5d05c002f8.lovable.app
python agent.py
```

โปรแกรมจะเปิดที่ `http://127.0.0.1:8899` แล้วเปิดหน้าเว็บ `/kiosk` บนเครื่องเดียวกัน (โหมดเต็มจอ)

## การทำงาน

- ดึงรายชื่อนักเรียน ค่าตั้งค่า และข้อมูลใบหน้าจากระบบทุก 30 วินาที
- คำนวณใบหน้าจากรูปที่ลงทะเบียนใหม่ด้วย ArcFace (InsightFace buffalo_l) แล้วส่งกลับ
- รับภาพจากหน้าเว็บ เทียบใบหน้า ตรวจว่าเป็นคนจริง แล้วบันทึกเข้า-ออกให้อัตโนมัติ
- คนที่ไม่ได้ลงทะเบียนหรือถูกระงับจะไม่ถูกบันทึกและระบบจะแจ้งเสียงปฏิเสธ
