# FaceGate — โค้ดสำหรับ BBC micro:bit (MicroPython)
# โหมด "ไม้กั้น" (Barrier Gate) ยกขึ้น–ลง ด้วย Servo
# ---------------------------------------------------------------
# การต่อสาย (Servo SG90 / MG90S / MG996R)
#   P2   -> สายสัญญาณ Servo (สีส้ม/เหลือง)
#   3V   -> สายไฟ + ของ Servo (เฉพาะ SG90 ตัวเล็กเท่านั้น)
#          *** แนะนำอย่างยิ่ง: ใช้ไฟเลี้ยงแยก 5V จ่ายให้ Servo
#              แล้วต่อ GND ของไฟเลี้ยงร่วมกับ GND ของ micro:bit ***
#   GND  -> สายไฟ - ของ Servo
#   P1   -> Buzzer (ถ้ามี)
#   P0   -> รีเลย์ (ถ้ายังอยากใช้กลอนไฟฟ้าร่วมด้วย ตั้ง USE_RELAY = True)
#
# คำสั่งที่รับ (บรรทัดละคำสั่ง)
#   OPEN 5   -> ยกไม้กั้นขึ้น 5 วินาที แล้วลดลงเอง
#   DENY     -> ไม่ยก (กากบาท + เสียงเตือน)
#   PING     -> ตอบ PONG
#
# วิธีลงโค้ด: เปิด https://python.microbit.org วางไฟล์นี้ แล้วกด Send to micro:bit

from microbit import *
import music

ANGLE_DOWN = 10         # องศาเมื่อไม้กั้นลง (ปิด)
ANGLE_UP = 100          # องศาเมื่อไม้กั้นยกขึ้น (เปิด)
LIFT_STEP = 3           # ยก/ลดทีละกี่องศา (ยิ่งน้อยยิ่งนุ่มนวล)
LIFT_DELAY = 12         # หน่วงระหว่างสเต็ป (มิลลิวินาที)
HOLD_POWER = False      # True = จ่ายสัญญาณค้างตลอด (แรงกว่าแต่ร้อน/สั่น)
MANUAL_SECONDS = 5      # กดปุ่ม A เปิดเอง (ฉุกเฉิน)
USE_RELAY = False       # True = สั่งรีเลย์ที่ P0 พร้อมกันด้วย

uart.init(baudrate=115200)
pin2.set_analog_period(20)

_angle = ANGLE_DOWN


def servo_write(angle):
    # ช่วงพัลส์ servo มาตรฐาน ~1-2ms ในคาบ 20ms => analog 26-128
    pin2.write_analog(int(26 + (angle / 180) * 102))


def servo_off():
    if not HOLD_POWER:
        sleep(120)
        pin2.write_digital(0)


def move_to(target):
    """ค่อย ๆ หมุนไปตำแหน่งเป้าหมาย เพื่อไม่ให้ไม้กั้นกระชากและกินไฟพุ่ง"""
    global _angle
    step = LIFT_STEP if target > _angle else -LIFT_STEP
    while abs(target - _angle) > LIFT_STEP:
        _angle += step
        servo_write(_angle)
        sleep(LIFT_DELAY)
    _angle = target
    servo_write(_angle)
    sleep(150)
    servo_off()


def bar_down():
    move_to(ANGLE_DOWN)
    if USE_RELAY:
        pin0.write_digital(0)


def bar_up():
    if USE_RELAY:
        pin0.write_digital(1)
    move_to(ANGLE_UP)


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
    beep_ok()
    display.show(Image.ARROW_N)
    bar_up()
    display.show(Image.YES)
    end = running_time() + int(seconds * 1000)
    while running_time() < end:
        sleep(50)
    display.show(Image.ARROW_S)
    bar_down()
    display.show(Image.HAPPY)
    uart.write("CLOSED\n")


bar_down()
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
                bar_down()
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
        bar_down()
        display.show(Image.HAPPY)
        uart.write("LOCKED\n")

    sleep(20)
