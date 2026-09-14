"""
FaceGate door controller (micro:bit)
------------------------------------
Talks to a BBC micro:bit plugged into the kiosk PC over USB serial.
The micro:bit drives a relay / electric strike / servo lock.

Wire protocol (plain text lines, 115200 baud):

    PC  -> micro:bit : OPEN <seconds>   open the door for N seconds
    PC  -> micro:bit : DENY             refuse (red X + buzzer), keep locked
    PC  -> micro:bit : PING             connection check
    micro:bit -> PC  : READY | OK | DENIED | CLOSED | PONG

Everything fails soft: if no micro:bit is connected the kiosk keeps working
and simply reports that the door hardware is offline.
"""

from __future__ import annotations

import os
import threading
import time

try:  # pyserial is optional — the kiosk still works without door hardware
    import serial
    from serial.tools import list_ports
except Exception:  # noqa: BLE001
    serial = None
    list_ports = None

ENABLED = (os.environ.get("FACEGATE_DOOR_ENABLED", "auto") or "auto").lower()
PORT = os.environ.get("FACEGATE_DOOR_PORT", "")  # e.g. COM5 or /dev/ttyACM0
BAUD = int(os.environ.get("FACEGATE_DOOR_BAUD", "115200"))
OPEN_SECONDS = float(os.environ.get("FACEGATE_DOOR_SECONDS", "5"))

# USB ids of the micro:bit (NXP/ARM mbed interface chip)
MICROBIT_VID = 0x0D28
MICROBIT_PID = 0x0204

_lock = threading.Lock()
_state: dict[str, object] = {
    "port": None,
    "connected": False,
    "last_error": None,
    "last_open": None,
    "opens": 0,
}
_serial = None


def _find_port() -> str | None:
    if PORT:
        return PORT
    if list_ports is None:
        return None
    for info in list_ports.comports():
        if info.vid == MICROBIT_VID and info.pid == MICROBIT_PID:
            return info.device
    for info in list_ports.comports():
        text = f"{info.manufacturer or ''} {info.description or ''}".lower()
        if "micro:bit" in text or "microbit" in text or "mbed" in text:
            return info.device
    return None


def _connect() -> bool:
    """Open the serial port. Caller holds the lock."""
    global _serial
    if serial is None:
        _state["last_error"] = "ยังไม่ได้ติดตั้ง pyserial"
        return False
    port = _find_port()
    if not port:
        _state["connected"] = False
        _state["port"] = None
        _state["last_error"] = "ไม่พบ micro:bit ที่เสียบอยู่"
        return False
    try:
        _serial = serial.Serial(port, BAUD, timeout=1, write_timeout=2)
        time.sleep(0.4)  # let the micro:bit reset after the port opens
        _serial.reset_input_buffer()
        _state.update({"port": port, "connected": True, "last_error": None})
        print(f"[door] connected to micro:bit on {port}")
        return True
    except Exception as exc:  # noqa: BLE001
        _serial = None
        _state.update({"connected": False, "port": None, "last_error": str(exc)[:200]})
        return False


def _send(line: str) -> str | None:
    """Send one command, returning the micro:bit reply (or None)."""
    global _serial
    if ENABLED == "off":
        return None
    with _lock:
        if _serial is None and not _connect():
            return None
        try:
            _serial.write((line + "\n").encode("ascii"))
            _serial.flush()
            reply = _serial.readline().decode("ascii", "ignore").strip()
            _state["last_error"] = None
            return reply or "OK"
        except Exception as exc:  # noqa: BLE001
            _state.update({"connected": False, "last_error": str(exc)[:200]})
            try:
                _serial.close()
            except Exception:  # noqa: BLE001
                pass
            _serial = None
            return None


def open_door(seconds: float | None = None) -> bool:
    """Unlock the door for a few seconds. Returns True when the micro:bit acked."""
    secs = float(seconds or OPEN_SECONDS)
    secs = max(1.0, min(secs, 30.0))
    reply = _send(f"OPEN {secs:.1f}")
    if reply is None:
        return False
    _state["last_open"] = time.time()
    _state["opens"] = int(_state.get("opens") or 0) + 1
    return True


def close_door() -> bool:
    """Lower the barrier right away."""
    return _send("CLOSE") is not None


def deny() -> bool:
    """Tell the micro:bit the person was refused (red X + short buzz)."""
    return _send("DENY") is not None


_SERVO_KEYS = ("down", "up", "step", "delay", "hold", "buzzer", "relay", "manual", "invert")


def configure(cfg: dict) -> bool:
    """Push servo settings (angles, speed, hold power) to the micro:bit.

    Settings come from the cloud, so the barrier can be tuned from the admin
    site without re-flashing the micro:bit.
    """
    clean: dict[str, int] = {}
    for key in _SERVO_KEYS:
        if cfg.get(key) is None:
            continue
        try:
            clean[key] = int(float(cfg[key]))
        except Exception:  # noqa: BLE001
            continue
    if not clean:
        return False
    with _lock:
        _state["config"] = clean
    line = "CFG " + " ".join(f"{k}={v}" for k, v in clean.items())
    return _send(line) is not None


def _push_config() -> None:
    cfg = _state.get("config") or {}
    if not cfg or _serial is None:
        return
    line = "CFG " + " ".join(f"{k}={v}" for k, v in cfg.items())  # type: ignore[union-attr]
    try:
        _serial.write((line + "\n").encode("ascii"))
        _serial.flush()
        _serial.readline()
    except Exception:  # noqa: BLE001
        pass


def ping() -> bool:
    return _send("PING") is not None


def status() -> dict:
    connected = bool(_state.get("connected"))
    if ENABLED == "off":
        return {"enabled": False, "connected": False, "port": None}
    if not connected:
        # cheap re-probe so the kiosk shows the door coming back on its own
        with _lock:
            if _serial is None:
                _connect()
        connected = bool(_state.get("connected"))
    return {
        "enabled": True,
        "connected": connected,
        "port": _state.get("port"),
        "opens": _state.get("opens"),
        "last_open": _state.get("last_open"),
        "error": _state.get("last_error"),
    }


def start() -> None:
    """Connect in the background so start-up is never blocked by hardware."""
    if ENABLED == "off":
        print("[door] disabled (FACEGATE_DOOR_ENABLED=off)")
        return

    def worker() -> None:
        while True:
            with _lock:
                connected = _serial is not None
                if not connected:
                    connected = _connect()
            if connected:
                ping()
            time.sleep(15)

    threading.Thread(target=worker, daemon=True).start()
