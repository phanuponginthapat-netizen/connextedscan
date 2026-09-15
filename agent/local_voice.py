"""
Offline speech for the standalone build.

The kiosk first tries the voice built into the browser engine. When the PC has
no Thai voice installed (common on fresh Windows installs), the program speaks
the sentence itself with whatever offline engine the machine has:

  1. Piper  — if a voice model was shipped in resources/voices/*.onnx
  2. Windows SAPI (System.Speech) — prefers a Thai voice, else the default one
  3. espeak-ng / spd-say on Linux

Every sentence is rendered once and kept as a .wav file inside the data folder,
so repeated announcements play instantly and need no internet at all.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import sys
import tempfile

import localdb as db

VOICE_DIR = os.path.join(db.DATA_DIR, "voice")


def _cache_path(text: str) -> str:
    key = hashlib.sha1(text.strip().encode("utf-8")).hexdigest()[:24]
    return os.path.join(VOICE_DIR, f"{key}.wav")


def _resources_dir() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(os.path.join(here, "..", "resources", "voices"))


def _piper() -> tuple[str, str] | None:
    """Returns (piper executable, voice model) when both were bundled."""
    folder = _resources_dir()
    if not os.path.isdir(folder):
        return None
    exe = shutil.which("piper") or os.path.join(
        folder, "piper.exe" if os.name == "nt" else "piper"
    )
    if not os.path.isfile(exe) and not shutil.which("piper"):
        return None
    models = [f for f in sorted(os.listdir(folder)) if f.endswith(".onnx")]
    if not models:
        return None
    return exe, os.path.join(folder, models[0])


def _run(cmd: list[str], stdin: bytes | None = None) -> bool:
    try:
        flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0  # type: ignore[attr-defined]
    except AttributeError:
        flags = 0
    try:
        done = subprocess.run(
            cmd,
            input=stdin,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=25,
            creationflags=flags,
        )
        return done.returncode == 0
    except Exception:
        return False


def _synth_piper(text: str, out: str) -> bool:
    found = _piper()
    if not found:
        return False
    exe, model = found
    return _run([exe, "--model", model, "--output_file", out], text.encode("utf-8")) and os.path.getsize(out) > 44


def _synth_windows(text: str, out: str) -> bool:
    if os.name != "nt":
        return False
    script = (
        "Add-Type -AssemblyName System.Speech;"
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;"
        "$thai = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'th*' } |"
        " Select-Object -First 1;"
        "if ($thai) { $s.SelectVoice($thai.VoiceInfo.Name) }"
        f"$s.SetOutputToWaveFile('{out}');"
        f"$s.Speak([Console]::In.ReadToEnd());"
        "$s.Dispose();"
    )
    ok = _run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
        text.encode("utf-8"),
    )
    return ok and os.path.isfile(out) and os.path.getsize(out) > 44


def _synth_espeak(text: str, out: str) -> bool:
    exe = shutil.which("espeak-ng") or shutil.which("espeak")
    if not exe:
        return False
    return _run([exe, "-v", "th", "-w", out, text]) and os.path.isfile(out) and os.path.getsize(out) > 44


def available() -> bool:
    """True when this PC can produce speech without the internet."""
    if _piper():
        return True
    if os.name == "nt":
        return True
    return bool(shutil.which("espeak-ng") or shutil.which("espeak"))


def synthesize(text: str) -> bytes | None:
    """Returns wav audio for a sentence, rendering it only the first time."""
    text = " ".join((text or "").split())
    if not text:
        return None

    os.makedirs(VOICE_DIR, exist_ok=True)
    cached = _cache_path(text)
    if os.path.isfile(cached) and os.path.getsize(cached) > 44:
        with open(cached, "rb") as fh:
            return fh.read()

    tmp = os.path.join(tempfile.gettempdir(), f"fg-voice-{os.getpid()}.wav")
    made = _synth_piper(text, tmp) or _synth_windows(text, tmp) or _synth_espeak(text, tmp)
    if not made:
        return None

    try:
        shutil.move(tmp, cached)
    except Exception:
        cached = tmp
    with open(cached, "rb") as fh:
        data = fh.read()
    if cached == tmp:
        try:
            os.remove(tmp)
        except OSError:
            pass
    return data


if __name__ == "__main__":  # quick manual check
    audio = synthesize(" ".join(sys.argv[1:]) or "ทดสอบเสียงระบบสแกนใบหน้า")
    print("bytes:", len(audio or b""))
