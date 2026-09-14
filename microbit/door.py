# FaceGate — โค้ดสำหรับ BBC micro:bit (MicroPython)
# โหมด "ไม้กั้น" (Barrier Gate) ยกขึ้น–ลง ด้วย Servo
# รุ่นนี้กันโปรแกรมหยุดกลางทาง (ไม่มีตัวอักษรอังกฤษวิ่งบนจอ LED อีก)
# ---------------------------------------------------------------
# การต่อสาย (Servo SG90 / MG90S / MG996R)
#   P2   -> สายสัญญาณ Servo (สีส้ม/เหลือง)
#   3V   -> สายไฟ + ของ Servo (เฉพาะ SG90 ตัวเล็กเท่านั้น)
#          *** แนะนำ: ใช้ไฟเลี้ยงแยก 5V จ่ายให้ Servo แล้วต่อ GND ร่วมกัน ***
#   GND  -> สายไฟ - ของ Servo
#   P1   -> Buzzer (ถ้ามี)
#   P0   -> รีเลย์ (ถ้าใช้กลอนไฟฟ้าร่วม ตั้ง relay=1 ผ่านคำสั่ง CFG)
#
# คำสั่งที่รับ (บรรทัดละคำสั่ง)
#   OPEN 5 / CLOSE / DENY / PING / GETCFG
#   CFG down=10 up=100 step=3 delay=12 hold=1 buzzer=0 relay=0 manual=5 invert=0
#
# ปุ่มบนบอร์ด: A = ยกขึ้นชั่วคราว, B = ลดลงทันที (ใช้ได้ทุกเมื่อ)
#
# วิธีลงโค้ด: เปิด https://python.microbit.org วางไฟล์นี้ แล้วกด Send to micro:bit

from microbit import *

try:
    import music
except Exception:
    music = None

CFG = {
    "down": 10,      # องศาเมื่อไม้กั้นลง (ปิด)
    "up": 100,       # องศาเมื่อไม้กั้นยกขึ้น (เปิด)
    "step": 3,       # ยก/ลดทีละกี่องศา
    "delay": 12,     # หน่วงระหว่างสเต็ป (มิลลิวินาที)
    "hold": 1,       # 1 = จ่ายสัญญาณค้างไว้ ให้ไม้กั้นค้างอยู่จริง
    "buzzer": 0,     # 1 = เปิดเสียงเตือน
    "relay": 0,      # 1 = สั่งรีเลย์ที่ P0 ด้วย
    "manual": 5,     # กดปุ่ม A ยกขึ้นกี่วินาที
    "invert": 0,     # 1 = สลับทิศการหมุน
}

uart.init(baudrate=115200)

_angle = None
_target = None
_next_step_at = 0
_close_at = 0
_pwm_on = False


def say(text):
    """ส่งข้อความออก serial (ไม่โชว์บนจอ LED เพื่อไม่ให้โปรแกรมสะดุด)"""
    try:
        uart.write(text + "\n")
    except Exception:
        pass


def cfg_int(key, fallback):
    try:
        return int(CFG.get(key, fallback))
    except Exception:
        return fallback


def angle_down():
    return cfg_int("up", 100) if cfg_int("invert", 0) else cfg_int("down", 10)


def angle_up():
    return cfg_int("down", 10) if cfg_int("invert", 0) else cfg_int("up", 100)


def servo_write(angle):
    global _pwm_on
    try:
        angle = int(angle)
    except Exception:
        return
    if angle < 0:
        angle = 0
    elif angle > 180:
        angle = 180
    try:
        pin2.set_analog_period(20)
        pin2.write_analog(int(26 + (angle / 180) * 102))
        _pwm_on = True
    except Exception:
        pass


def servo_release():
    global _pwm_on
    if _pwm_on:
        try:
            pin2.write_digital(0)
        except Exception:
            pass
        _pwm_on = False


def move_to(target):
    global _target, _next_step_at
    try:
        _target = int(target)
    except Exception:
        return
    _next_step_at = running_time()


def tick_servo():
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
    step = cfg_int("step", 3)
    if step < 1:
        step = 1
    diff = _target - _angle
    if abs(diff) <= step:
        _angle = _target
        servo_write(_angle)
        _target = None
        if not cfg_int("hold", 1):
            _next_step_at = now + 300
            servo_release()
        return
    _angle += step if diff > 0 else -step
    servo_write(_angle)
    _next_step_at = now + cfg_int("delay", 12)


def show(image):
    try:
        display.show(image)
    except Exception:
        pass


def bar_up(seconds):
    global _close_at
    if cfg_int("relay", 0):
        try:
            pin0.write_digital(1)
        except Exception:
            pass
    beep_ok()
    show(Image.ARROW_N)
    move_to(angle_up())
    try:
        secs = float(seconds)
    except Exception:
        secs = float(cfg_int("manual", 5))
    if secs < 1:
        secs = 1.0
    elif secs > 60:
        secs = 60.0
    _close_at = running_time() + int(secs * 1000)


def bar_down():
    global _close_at
    _close_at = 0
    show(Image.ARROW_S)
    move_to(angle_down())
    if cfg_int("relay", 0):
        try:
            pin0.write_digital(0)
        except Exception:
            pass


def beep_ok():
    if not cfg_int("buzzer", 0) or music is None:
        return
    try:
        music.pitch(880, 100, pin1, wait=False)
    except Exception:
        pass


def beep_deny():
    if not cfg_int("buzzer", 0) or music is None:
        return
    try:
        music.pitch(220, 250, pin1, wait=False)
    except Exception:
        pass


def apply_cfg(text):
    for part in text.split():
        if "=" not in part:
            continue
        key, _, value = part.partition("=")
        key = key.strip().lower()
        if key in CFG:
            try:
                CFG[key] = int(float(value))
            except Exception:
                pass
    say("CFG " + cfg_text())


def cfg_text():
    keys = ("down", "up", "step", "delay", "hold", "buzzer", "relay", "manual", "invert")
    return " ".join("%s=%d" % (k, cfg_int(k, 0)) for k in keys)


def handle_line(cmd):
    upper = cmd.upper()
    if upper.startswith("OPEN"):
        parts = upper.split()
        secs = cfg_int("manual", 5)
        if len(parts) > 1:
            try:
                secs = float(parts[1])
            except Exception:
                secs = cfg_int("manual", 5)
        say("OK")
        bar_up(secs)
    elif upper.startswith("CLOSE") or upper == "LOCK":
        bar_down()
        say("CLOSED")
    elif upper == "DENY":
        bar_down()
        show(Image.NO)
        beep_deny()
        say("DENIED")
    elif upper == "PING":
        say("PONG")
    elif upper.startswith("CFG"):
        apply_cfg(cmd[3:])
    elif upper == "GETCFG":
        say("CFG " + cfg_text())
    elif cmd:
        say("ERR")


def read_uart():
    """อ่าน serial อย่างปลอดภัย (uart.read() อาจคืน None ได้)"""
    try:
        if not uart.any():
            return ""
        raw = uart.read()
        if not raw:
            return ""
        return str(raw, "utf-8", "ignore")
    except Exception:
        return ""


# เริ่มต้น: ลดไม้กั้นลงให้อยู่ตำแหน่งปิดก่อนเสมอ
servo_write(angle_down())
_angle = angle_down()
move_to(angle_down())
show(Image.HAPPY)
say("READY")

buf = ""
while True:
    try:
        tick_servo()

        if _close_at and running_time() >= _close_at:
            bar_down()
            say("CLOSED")

        buf += read_uart()
        while "\n" in buf:
            line, buf = buf.split("\n", 1)
            handle_line(line.strip())
        if len(buf) > 200:
            buf = ""

        if button_a.was_pressed():
            say("MANUAL")
            bar_up(cfg_int("manual", 5))

        if button_b.was_pressed():
            bar_down()
            say("LOCKED")
    except Exception as exc:
        # อย่าให้โปรแกรมหยุด: แจ้งทาง serial แล้วทำงานต่อ
        try:
            say("ERR " + str(exc)[:60])
        except Exception:
            pass
        buf = ""
        _target = None
        _close_at = 0

    sleep(5)
