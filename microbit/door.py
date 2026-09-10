# FaceGate — โค้ดสำหรับ BBC micro:bit (MicroPython)
# ---------------------------------------------------------------
# หน้าที่: รับคำสั่งจากโปรแกรม FaceGate บนเครื่องตู้สแกนผ่านสาย USB
# แล้วสั่งเปิด/ปิดล็อกประตู
#
# การต่อสาย
#   P0  -> ขา IN ของรีเลย์ (Relay 5V 1 ช่อง) ที่ต่อกับกลอนไฟฟ้า/มอเตอร์ประตู
#   P1  -> ขาสัญญาณของ Buzzer (ถ้ามี)
#   P2  -> ขาสัญญาณ Servo (ถ้าใช้กลอนแบบ Servo แทนรีเลย์)
#   3V  -> VCC ของรีเลย์      GND -> GND ของรีเลย์ และของแหล่งจ่ายกลอน
#   ใช้ไฟเลี้ยงกลอนประตูแยกจาก micro:bit เสมอ (micro:bit จ่ายได้แค่สัญญาณ)
#
# คำสั่งที่รับ (บรรทัดละคำสั่ง)
#   OPEN 5   -> เปิดประตู 5 วินาที
#   DENY     -> ปฏิเสธ (ขึ้นกากบาท + เสียงเตือน) ประตูยังล็อก
#   PING     -> ตอบ PONG เพื่อเช็คว่าเชื่อมต่ออยู่
#
# วิธีลงโค้ด: เปิด https://python.microbit.org แล้ววางไฟล์นี้ กด Send to micro:bit
# (หรือใช้ MakeCode แล้วเลือกโหมด Python แล้ววางโค้ดนี้)

from microbit import *
import music

USE_SERVO = False       # True = ใช้ Servo ที่ P2 แทนรีเลย์ที่ P0
SERVO_LOCK = 25         # องศาเมื่อล็อก
SERVO_UNLOCK = 125      # องศาเมื่อปลดล็อก
MANUAL_SECONDS = 5      # กดปุ่ม A เพื่อเปิดประตูเอง (กรณีฉุกเฉิน)

uart.init(baudrate=115200)


def servo_write(angle):
    # micro:bit ใช้ analog 0-1023 : ค่า servo อยู่ราว 25-125
    pin2.set_analog_period(20)
    pin2.write_analog(int(25 + (angle / 180) * 100))


def lock():
    if USE_SERVO:
        servo_write(SERVO_LOCK)
    else:
        pin0.write_digital(0)


def unlock():
    if USE_SERVO:
        servo_write(SERVO_UNLOCK)
    else:
        pin0.write_digital(1)


def beep_ok():
    try:
        music.pitch(880, 120, pin1, wait=False)
    except Exception:
        pass


def beep_deny():
    try:
        music.pitch(220, 300, pin1, wait=False)
    except Exception:
        pass


def open_for(seconds):
    unlock()
    beep_ok()
    display.show(Image.YES)
    end = running_time() + int(seconds * 1000)
    while running_time() < end:
        sleep(50)
    lock()
    display.show(Image.HAPPY)
    uart.write("CLOSED\n")


lock()
display.show(Image.HAPPY)
uart.write("READY\n")

buf = ""
while True:
    if uart.any():
        buf += str(uart.read(), "utf-8", "ignore")
        while "\n" in buf:
            line, buf = buf.split("\n", 1)
            cmd = line.strip().upper()
            if cmd.startswith("OPEN"):
                parts = cmd.split()
                secs = 5
                if len(parts) > 1:
                    try:
                        secs = float(parts[1])
                    except Exception:
                        secs = 5
                uart.write("OK\n")
                open_for(secs)
            elif cmd == "DENY":
                lock()
                display.show(Image.NO)
                beep_deny()
                sleep(800)
                display.show(Image.HAPPY)
                uart.write("DENIED\n")
            elif cmd == "PING":
                uart.write("PONG\n")
            elif cmd:
                uart.write("ERR\n")

    if button_a.was_pressed():
        uart.write("MANUAL\n")
        open_for(MANUAL_SECONDS)

    if button_b.was_pressed():
        lock()
        display.show(Image.HAPPY)
        uart.write("LOCKED\n")

    sleep(20)
