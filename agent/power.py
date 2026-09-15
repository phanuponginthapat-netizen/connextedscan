"""
Power saving helpers for the FaceGate kiosk PC.

Everything here is best-effort: the kiosk must keep scanning faces even when
the machine refuses to blank its screen or is not allowed to power off.

Supported actions
  screen_off / screen_on   blank or wake the monitor
  sleep                    suspend the machine (wakes on key press / Wake-on-LAN)
  shutdown                 power the machine off
"""

from __future__ import annotations

import os
import platform
import subprocess
import threading
import time

IS_WINDOWS = platform.system().lower().startswith("win")

_state: dict[str, object] = {
    "screen_off": False,
    "last_action": None,
    "last_action_at": None,
    "last_error": None,
    "pending": None,  # {"action": "shutdown", "at": epoch}
}
_lock = threading.Lock()

_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0


def _run(cmd: list[str]) -> bool:
    try:
        subprocess.run(
            cmd,
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=_NO_WINDOW,
        )
        return True
    except Exception as exc:  # noqa: BLE001
        with _lock:
            _state["last_error"] = f"{cmd[0]}: {exc}"
        return False


def _remember(action: str, ok: bool) -> bool:
    with _lock:
        _state["last_action"] = action
        _state["last_action_at"] = time.time()
        if ok:
            _state["last_error"] = None
    return ok


def screen_off() -> bool:
    """Blank the monitor (the PC stays awake and keeps scanning nothing)."""
    ok = False
    if IS_WINDOWS:
        try:
            import ctypes

            # WM_SYSCOMMAND / SC_MONITORPOWER / power off
            ctypes.windll.user32.SendMessageW(0xFFFF, 0x0112, 0xF170, 2)
            ok = True
        except Exception as exc:  # noqa: BLE001
            with _lock:
                _state["last_error"] = str(exc)
    else:
        ok = _run(["xset", "dpms", "force", "off"])
        if not ok:
            ok = _run(["vbetool", "dpms", "off"])
    with _lock:
        _state["screen_off"] = True
    return _remember("screen_off", ok)


def screen_on() -> bool:
    """Wake the monitor back up."""
    ok = False
    if IS_WINDOWS:
        try:
            import ctypes

            ctypes.windll.user32.SendMessageW(0xFFFF, 0x0112, 0xF170, -1)
            # A tiny mouse nudge is what actually wakes some Atom boards.
            ctypes.windll.user32.mouse_event(1, 1, 0, 0, 0)
            ctypes.windll.user32.mouse_event(1, -1, 0, 0, 0)
            ok = True
        except Exception as exc:  # noqa: BLE001
            with _lock:
                _state["last_error"] = str(exc)
    else:
        ok = _run(["xset", "dpms", "force", "on"])
    with _lock:
        _state["screen_off"] = False
    return _remember("screen_on", ok)


def wake_lan(mac: str, broadcast: str = "255.255.255.255", port: int = 9) -> bool:
    """Send a Wake-on-LAN magic packet.

    Works from any machine that shares the LAN with the sleeping kiosk, and from
    the internet when the school router forwards this UDP port to the kiosk
    (Wake-on-WAN).
    """
    import socket

    clean = "".join(ch for ch in str(mac or "") if ch in "0123456789abcdefABCDEF")
    if len(clean) != 12:
        with _lock:
            _state["last_error"] = f"bad mac: {mac}"
        return False
    packet = b"\xff" * 6 + bytes.fromhex(clean) * 16
    ok = False
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            sock.sendto(packet, (broadcast or "255.255.255.255", int(port or 9)))
            # Port 7 is the other common WoL port; harmless to try both.
            try:
                sock.sendto(packet, (broadcast or "255.255.255.255", 7))
            except Exception:  # noqa: BLE001
                pass
        ok = True
    except Exception as exc:  # noqa: BLE001
        with _lock:
            _state["last_error"] = str(exc)
    return _remember("wake_lan", ok)


def sleep_machine() -> bool:
    if IS_WINDOWS:
        ok = _run(["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"])
    else:
        ok = _run(["systemctl", "suspend"])
    return _remember("sleep", ok)


def shutdown_machine() -> bool:
    if IS_WINDOWS:
        ok = _run(["shutdown", "/s", "/t", "5", "/f"])
    else:
        ok = _run(["systemctl", "poweroff"]) or _run(["shutdown", "-h", "now"])
    return _remember("shutdown", ok)


def cancel_shutdown() -> bool:
    """Abort a countdown, including one already handed to the OS."""
    with _lock:
        _state["pending"] = None
    if IS_WINDOWS:
        _run(["shutdown", "/a"])
    else:
        _run(["shutdown", "-c"])
    return _remember("cancel", True)


def schedule(action: str, seconds: int) -> None:
    """Start a visible countdown before sleeping or powering off."""
    if action not in ("shutdown", "sleep"):
        return
    with _lock:
        _state["pending"] = {"action": action, "at": time.time() + max(seconds, 0)}


def pending() -> dict | None:
    with _lock:
        value = _state.get("pending")
    return dict(value) if isinstance(value, dict) else None


def tick() -> None:
    """Run a due countdown. Call this from the agent's power loop."""
    item = pending()
    if not item:
        return
    if time.time() < float(item.get("at") or 0):
        return
    with _lock:
        _state["pending"] = None
    if item.get("action") == "sleep":
        sleep_machine()
    else:
        shutdown_machine()


def apply(command: str, seconds: int = 60) -> bool:
    """Run one remote command coming from the admin site."""
    if command == "screen_off":
        return screen_off()
    if command == "screen_on":
        return screen_on()
    if command == "cancel":
        return cancel_shutdown()
    if command in ("sleep", "shutdown"):
        schedule(command, seconds)
        return True
    if command == "restart_app":
        # The Electron shell watches this file; touching it asks for a restart.
        try:
            path = os.path.join(os.path.dirname(__file__), ".restart-requested")
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(str(time.time()))
            return _remember("restart_app", True)
        except Exception as exc:  # noqa: BLE001
            with _lock:
                _state["last_error"] = str(exc)
            return False
    return False


def status() -> dict:
    with _lock:
        return {
            "screen_off": bool(_state.get("screen_off")),
            "last_action": _state.get("last_action"),
            "last_action_at": _state.get("last_action_at"),
            "last_error": _state.get("last_error"),
            "pending": dict(_state["pending"]) if isinstance(_state.get("pending"), dict) else None,
            "platform": platform.system(),
        }
