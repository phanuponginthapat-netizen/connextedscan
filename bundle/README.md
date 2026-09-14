# FaceGate — ไฟล์ติดตั้งแบบ All-in-One (ออฟไลน์ 100%)

ไฟล์ชุดนี้รวมทุกอย่างที่เครื่องตู้สแกนต้องใช้ไว้ในไฟล์เดียว ติดตั้งแล้วรันได้ทันที
ไม่ต้องติดตั้ง Python ไม่ต้องรอโหลดไลบรารีหรือโมเดลใบหน้าจากอินเทอร์เน็ต

สิ่งที่อยู่ในไฟล์:

| ส่วนประกอบ | ที่อยู่ในไฟล์ |
| --- | --- |
| โปรแกรมหน้าจอตู้สแกน (Electron) | `FaceGate.exe` / `FaceGate` |
| Python พร้อมใช้ในตัว | `resources/runtime/python` |
| ไลบรารีทั้งหมด (fastapi, uvicorn, numpy, opencv, onnxruntime, pyserial) | `resources/runtime/site` |
| โมเดลใบหน้า SCRFD + ArcFace | `resources/runtime/models` |
| โค้ดตัวประมวลผลใบหน้า + โค้ดประตู micro:bit | `resources/app.asar.unpacked/agent` |

โปรแกรมจะใช้ Python และโมเดลในโฟลเดอร์นี้ก่อนตัวที่ติดตั้งในเครื่องเสมอ
(ส่งผ่านตัวแปร `FACEGATE_MODEL_DIR` และ `PYTHONPATH` ให้อัตโนมัติ)

## วิธีสร้างไฟล์

ต้องสร้างบนเครื่องที่ตรงกับระบบปฏิบัติการปลายทาง และต้องมี Node.js 20+ กับอินเทอร์เน็ต
(ดาวน์โหลดครั้งเดียวตอนสร้าง ผู้ใช้ปลายทางไม่ต้องโหลดอะไรอีก)

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File bundle\build-windows-bundle.ps1
# ได้ไฟล์ bundle\dist\FaceGate-AllInOne-windows-x64.zip  (ประมาณ 400–600 MB)
```

Linux:

```bash
bash bundle/build-linux-bundle.sh
# ได้ไฟล์ bundle/dist/FaceGate-AllInOne-linux-x64.tar.gz  (ประมาณ 400–600 MB)
```

หรือสร้างอัตโนมัติผ่าน GitHub Actions: แท็บ **Actions → FaceGate all-in-one bundle → Run workflow**
แล้วดาวน์โหลดไฟล์จาก Artifacts

## วิธีติดตั้งบนเครื่องตู้สแกน

Windows: แตกไฟล์ ZIP → ดับเบิลคลิก `ติดตั้ง-FaceGate.bat` → ใส่รหัสเครื่อง
Linux: แตกไฟล์ → `bash install.sh` → เปิดด้วยคำสั่ง `facegate`

## นำไฟล์ขึ้นให้ดาวน์โหลดจากเว็บ

ไฟล์ใหญ่เกินกว่าจะเก็บในโค้ด ให้อัปโหลดขึ้นที่เก็บไฟล์ (GitHub Release, Google Drive, ไดรฟ์ของโรงเรียน)
แล้วใส่ลิงก์ในระบบหลังบ้าน → ตั้งค่า → เนื้อหา:

- `ลิงก์ไฟล์ติดตั้งแบบครบชุด (Windows)`
- `ลิงก์ไฟล์ติดตั้งแบบครบชุด (Linux)`
- `เวอร์ชันไฟล์ติดตั้งแบบครบชุด`
