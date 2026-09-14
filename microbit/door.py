# FaceGate — โค้ดสำหรับ BBC micro:bit (MicroPython)
# โหมด "ไม้กั้น" (Barrier Gate) ยกขึ้น–ลง ด้วย Servo
# ---------------------------------------------------------------
# การต่อสาย (Servo SG90 / MG90S / MG996R)
#   P2   -> สายสัญญาณ Servo (สีส้ม/เหลือง)
#   3V   -> สายไฟ + ของ Servo (เฉพาะ SG90 ตัวเล็กเท่านั้น)
#          *** แนะนำอย่างยิ่ง: ใช้ไฟเลี้ยงแยก 5V จ่ายให้ Servo
#              แล้วต่อ GND ของไฟเลี้ยงร่วมกับ GND ของ micro:bit ***
#   GND  -> สายไฟ - ของ Servo
#   P1   -> Buzzer (ถ้ามี)  * ค่าเริ่มต้นปิดเสียงไว้ เพราะเสียงกับ Servo ใช้ตัวจับเวลาเดียวกัน
#   P0   -> รีเลย์ (ถ้ายังอยากใช้กลอนไฟฟ้าร่วมด้วย ตั้ง relay=1 ผ่านคำสั่ง CFG)
#
# คำสั่งที่รับ (บรรทัดละคำสั่ง)
#   OPEN 5   -> ยกไม้กั้นขึ้น 5 วินาที แล้วลดลงเอง
#   CLOSE    -> ลดไม้กั้นลงทันที
#   DENY     -> ไม่ยก (กากบาท + เสียงเตือน)
#   PING     -> ตอบ PONG
#   CFG down=10 up=100 step=3 delay=12 hold=1 buzzer=0 relay=0 manual=5 invert=0
#            -> ตั้งค่าจากระบบหลังบ้าน (ไม่ต้องแก้โค้ด ไม่ต้องแฟลชใหม่)
#   GETCFG   -> ตอบค่าที่ใช้อยู่
#
# ปุ่มบนบอร์ด: A = ยกขึ้นชั่วคราว, B = ลดลงทันที (ใช้ได้ทุกเมื่อ)
#
# วิธีลงโค้ด: เปิด https://python.microbit.org วางไฟล์นี้ แล้วกด Send to micro:bit

from microbit import *
import music

CFG = {
    "down": 10,      # องศาเมื่อไม้กั้นลง (ปิด)
    "up": 100,       # องศาเมื่อไม้กั้นยกขึ้น (เปิด)
    "step": 3,       # ยก/ลดทีละกี่องศา (ยิ่งน้อยยิ่งนุ่มนวล)
    "delay": 12,     # หน่วงระหว่างสเต็ป (มิลลิวินาที)
    "hold": 1,       # 1 = จ่ายสัญญาณค้างไว้ ทำให้ไม้กั้นค้างอยู่จริง
    "buzzer": 0,     # 1 = เปิดเสียงเตือน (อาจรบกวนการหมุน Servo)
    "relay": 0,      # 1 = สั่งรีเลย์ที่ P0 ด้วย
    "manual": 5,     # กดปุ่ม A ยกขึ้นกี่วินาที
    "invert": 0,     # 1 = สลับทิศการหมุน (ถ้าประกอบกลับด้าน)
}

uart.init(baudrate=115200)

_angle = None            # องศาที่จ่ายอยู่จริง
_target = None           # องศาเป้าหมาย
_next_step_at = 0        # เวลาที่จะขยับสเต็ปถัดไป
_close_at = 0            # เวลาที่ต้องลดไม้กั้นลงเอง (0 = ไม่ตั้ง)
_pwm_on = False


def angle_down():
    return CFG["up"] if CFG["invert"] else CFG["down"]


def angle_up():
    return CFG["down"] if CFG["invert"] else CFG["up"]


def servo_write(angle):
    """จ่ายพัลส์ให้ Servo และคุมคาบ 20ms ทุกครั้ง (กันค่าคาบหายหลังใช้ digital)"""
    global _pwm_on
    if angle < 0:
        angle = 0
    elif angle > 180:
        angle = 180
    pin2.set_analog_period(20)
    pin2.write_analog(int(26 + (angle / 180) * 102))
    _pwm_on = True


def servo_release():
    """ตัดสัญญาณ (ใช้เมื่อ hold=0 เท่านั้น) — ไม้กั้นจะไม่มีแรงค้าง"""
    global _pwm_on
    if _pwm_on:
        pin2.write_digital(0)
        _pwm_on = False


def move_to(target):
    """ตั้งเป้าหมาย แล้วให้ลูปหลักค่อย ๆ หมุนไปให้ (ไม่บล็อกโปรแกรม)"""
    global _target, _next_step_at
    _target = int(target)
    _next_step_at = running_time()


def tick_servo():
    """ขยับ Servo หนึ่งสเต็ปเมื่อถึงเวลา — เรียกถี่ ๆ จากลูปหลัก"""
    global _angle, _target, _next_step_at
    if _target is None:
        return
    now = running_time()
    if now < _next_step_at:
        return
    if _angle is None:
        _angle = _target
        servo_write(_angle)
        _next_step_at = now + 400
        return
    step = int(CFG["step"]) or 1
    diff = _target - _angle
    if abs(diff) <= step:
        _angle = _target
        servo_write(_angle)
        _target = None
        # ค้างสัญญาณไว้ให้ไม้กั้นอยู่ตำแหน่งเดิม (hold=1) หรือปล่อยฟรี (hold=0)
        if not CFG["hold"]:
            _next_step_at = now + 300
            servo_release()
        return
    _angle += step if diff > 0 else -step
    servo_write(_angle)
    _next_step_at = now + int(CFG["delay"])


def bar_up(seconds):
    global _close_at
    if CFG["relay"]:
        pin0.write_digital(1)
    beep_ok()
    display.show(Image.ARROW_N)
    move_to(angle_up())
    _close_at = running_time() + int(float(seconds) * 1000)


def bar_down():
    global _close_at
    _close_at = 0
    display.show(Image.ARROW_S)
    move_to(angle_down())
    if CFG["relay"]:
        pin0.write_digital(0)


def beep_ok():
    if not CFG["buzzer"]:
        return
    try:
        music.pitch(880, 100, pin1, wait=False)
    except Exception:
        pass


def beep_deny():
    if not CFG["buzzer"]:
        return
    try:
        music.pitch(220, 250, pin1, wait=False)
    except Exception:
        pass


def apply_cfg(text):
    changed = []
    for part in text.split():
        if "=" not in part:
            continue
        key, _, value = part.partition("=")
        key = key.strip().lower()
        if key in CFG:
            try:
                CFG[key] = int(float(value))
                changed.append(key)
            except Exception:
                pass
    uart.write("CFG " + cfg_text() + "\n")
    return changed


def cfg_text():
    keys = ("down", "up", "step", "delay", "hold", "buzzer", "relay", "manual", "invert")
    return " ".join("%s=%d" % (k, CFG[k]) for k in keys)


# เริ่มต้น: ลดไม้กั้นลงให้อยู่ตำแหน่งปิดก่อนเสมอ
servo_write(angle_down())
_angle = angle_down()
move_to(angle_down())
display.show(Image.HAPPY)
uart.write("READY\n")

buf = ""
while True:
    tick_servo()

    if _close_at and running_time() >= _close_at:
        bar_down()
        uart.write("CLOSED\n")

    if uart.any():
        buf += str(uart.read(), "utf-8", "ignore")
        while "\n" in buf:
            line, buf = buf.split("\n", 1)
            cmd = line.strip()
            upper = cmd.upper()
            if upper.startswith("OPEN"):
                parts = upper.split()
                secs = CFG["manual"]
                if len(parts) > 1:
                    try:
                        secs = float(parts[1])
                    except Exception:
                        secs = CFG["manual"]
                uart.write("OK\n")
                bar_up(secs)
            elif upper.startswith("CLOSE") or upper == "LOCK":
                bar_down()
                uart.write("CLOSED\n")
            elif upper == "DENY":
                bar_down()
                display.show(Image.NO)
                beep_deny()
                uart.write("DENIED\n")
            elif upper == "PING":
                uart.write("PONG\n")
            elif upper.startswith("CFG"):
                apply_cfg(cmd[3:])
            elif upper == "GETCFG":
                uart.write("CFG " + cfg_text() + "\n")
            elif cmd:
                uart.write("ERR\n")

    if button_a.was_pressed():
        uart.write("MANUAL\n")
        bar_up(CFG["manual"])

    if button_b.was_pressed():
        bar_down()
        uart.write("LOCKED\n")

    sleep(5)
