# FaceGate barrier gate for BBC micro:bit (MicroPython)
# P2=Servo signal, GND=Servo -, 3V or external 5V=Servo +
# P0=relay (relay=1), P1=buzzer (buzzer=0 by default)
# Commands: OPEN <s> | CLOSE | DENY | PING | GETCFG | CFG k=v ...
# Buttons: A = up, B = down
from microbit import *

C = {"down": 10, "up": 100, "step": 3, "delay": 12, "hold": 1,
     "buzzer": 0, "relay": 0, "manual": 5, "invert": 0}
K = ("down", "up", "step", "delay", "hold", "buzzer", "relay", "manual", "invert")

uart.init(baudrate=115200)
a = None
t = None
nx = 0
ca = 0
on = False


def w(s):
    try:
        uart.write(s + "\n")
    except Exception:
        pass


def sv(v):
    global on
    if v < 0:
        v = 0
    elif v > 180:
        v = 180
    try:
        pin2.set_analog_period(20)
        pin2.write_analog(int(26 + v * 102 / 180))
        on = True
    except Exception:
        pass


def down():
    return C["up"] if C["invert"] else C["down"]


def up():
    return C["down"] if C["invert"] else C["up"]


def tick():
    global a, t, nx, on
    if t is None:
        return
    n = running_time()
    if n < nx:
        return
    if a is None:
        a = t
        sv(a)
        nx = n + 400
        return
    s = C["step"] or 1
    d = t - a
    if abs(d) <= s:
        a = t
        sv(a)
        t = None
        if not C["hold"] and on:
            try:
                pin2.write_digital(0)
            except Exception:
                pass
            on = False
        return
    a += s if d > 0 else -s
    sv(a)
    nx = n + C["delay"]


def show(i):
    try:
        display.show(i)
    except Exception:
        pass


def raise_bar(s):
    global t, nx, ca
    if C["relay"]:
        pin0.write_digital(1)
    show(Image.ARROW_N)
    t = up()
    nx = running_time()
    if s < 1:
        s = 1
    elif s > 60:
        s = 60
    ca = running_time() + int(s * 1000)


def lower_bar():
    global t, nx, ca
    ca = 0
    show(Image.ARROW_S)
    t = down()
    nx = running_time()
    if C["relay"]:
        pin0.write_digital(0)


def cfg(txt):
    for p in txt.split():
        if "=" in p:
            k, _, v = p.partition("=")
            k = k.strip().lower()
            if k in C:
                try:
                    C[k] = int(float(v))
                except Exception:
                    pass
    w("CFG " + " ".join("%s=%d" % (k, C[k]) for k in K))


def cmd(line):
    u = line.upper()
    if u.startswith("OPEN"):
        p = u.split()
        s = C["manual"]
        if len(p) > 1:
            try:
                s = float(p[1])
            except Exception:
                pass
        w("OK")
        raise_bar(s)
    elif u.startswith("CLOSE") or u == "LOCK":
        lower_bar()
        w("CLOSED")
    elif u == "DENY":
        lower_bar()
        show(Image.NO)
        w("DENIED")
    elif u == "PING":
        w("PONG")
    elif u.startswith("CFG"):
        cfg(line[3:])
    elif u == "GETCFG":
        cfg("")
    elif line:
        w("ERR")


sv(down())
a = down()
show(Image.HAPPY)
w("READY")
b = ""
while True:
    try:
        tick()
        if ca and running_time() >= ca:
            lower_bar()
            w("CLOSED")
        if uart.any():
            r = uart.read()
            if r:
                b += str(r, "utf-8", "ignore")
        while "\n" in b:
            line, b = b.split("\n", 1)
            cmd(line.strip())
        if len(b) > 120:
            b = ""
        if button_a.was_pressed():
            w("MANUAL")
            raise_bar(C["manual"])
        if button_b.was_pressed():
            lower_bar()
            w("LOCKED")
    except Exception:
        b = ""
        t = None
        ca = 0
        w("ERR")
    sleep(5)
