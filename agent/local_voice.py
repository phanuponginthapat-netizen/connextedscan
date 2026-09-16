"""
Thai speech for the standalone build.

The kiosk first tries a Thai voice built into the browser engine. When the PC
has none (common on fresh Windows/Linux installs) the program speaks the
sentence itself — but only with a *Thai* voice, never an English one, because
an English voice reading Thai text sounds like nonsense.

Sources, best first:

  1. Sentences already rendered and stored in the data folder (fully offline).
  2. The same natural Thai voice the online FaceGate uses — fetched once per
     sentence while the PC has internet, then kept forever as an audio file.
     The admin page can pre-render every student's sentence in one go, so the
     kiosk sounds identical to the online system with no internet afterwards.
  3. A Thai voice installed in Windows (OneCore Pattara/Premwadee, or SAPI).
  4. espeak-ng with its Thai voice (robotic, last resort).

Nothing is ever spoken with a non-Thai voice.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request

import localdb as db

VOICE_DIR = os.path.join(db.DATA_DIR, "voice")
CLOUD_TTS_URL = os.environ.get(
    "FACEGATE_TTS_URL", "https://connextedscan.lovable.app/api/public/kiosk/tts"
)
MIME = {".mp3": "audio/mpeg", ".wav": "audio/wav"}


def _key(text: str) -> str:
    return hashlib.sha1(text.strip().encode("utf-8")).hexdigest()[:24]


def _cached(text: str) -> tuple[bytes, str] | None:
    for ext in (".mp3", ".wav"):
        path = os.path.join(VOICE_DIR, _key(text) + ext)
        if os.path.isfile(path) and os.path.getsize(path) > 1024:
            with open(path, "rb") as fh:
                return fh.read(), MIME[ext]
    return None


def _store(text: str, data: bytes, ext: str) -> None:
    os.makedirs(VOICE_DIR, exist_ok=True)
    path = os.path.join(VOICE_DIR, _key(text) + ext)
    tmp = path + ".part"
    with open(tmp, "wb") as fh:
        fh.write(data)
    os.replace(tmp, path)


# ------------------------------------------------------------- online voice


def _fetch_cloud(text: str, timeout: int = 20) -> bytes | None:
    """Natural Thai voice from the FaceGate service (internet needed once)."""
    try:
        request = urllib.request.Request(
            CLOUD_TTS_URL,
            data=json.dumps({"text": text[:300]}).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "FaceGate"},
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = response.read()
        return data if data and len(data) > 1024 else None
    except Exception:
        return None


def online_available() -> bool:
    return _fetch_cloud("ทดสอบ", timeout=8) is not None


# --------------------------------------------------------- on-device voices


def _run(cmd: list[str], stdin: bytes | None = None, timeout: int = 40) -> bool:
    try:
        flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0  # type: ignore[attr-defined]
    except AttributeError:
        flags = 0
    try:
        done = subprocess.run(
            cmd, input=stdin, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=timeout, creationflags=flags,
        )
        return done.returncode == 0
    except Exception:
        return False


def _powershell(script: str, stdin: bytes | None = None, timeout: int = 40) -> str:
    try:
        flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0  # type: ignore[attr-defined]
    except AttributeError:
        flags = 0
    try:
        done = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            input=stdin, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            timeout=timeout, creationflags=flags,
        )
        return (done.stdout or b"").decode("utf-8", "ignore")
    except Exception:
        return ""


def _ok(path: str) -> bool:
    return os.path.isfile(path) and os.path.getsize(path) > 1024


_WIN_CACHE: dict[str, list[str]] | None = None


def _windows_thai_voices(refresh: bool = False) -> dict[str, list[str]]:
    """Thai voices installed on this PC, per Windows speech API."""
    global _WIN_CACHE
    if os.name != "nt":
        return {"onecore": [], "sapi": []}
    if _WIN_CACHE is not None and not refresh:
        return _WIN_CACHE
    script = (
        "$r = @{ onecore = @(); sapi = @() };"
        "try { Add-Type -AssemblyName System.Speech;"
        " $s = New-Object System.Speech.Synthesis.SpeechSynthesizer;"
        " $r.sapi = @($s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'th*' }"
        "   | ForEach-Object { $_.VoiceInfo.Name }); $s.Dispose() } catch {}"
        "try { [void][Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media,ContentType=WindowsRuntime];"
        " $r.onecore = @([Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices"
        "   | Where-Object { $_.Language -like 'th*' } | ForEach-Object { $_.DisplayName }) } catch {}"
        "$r | ConvertTo-Json -Compress"
    )
    try:
        data = json.loads(_powershell(script) or "{}")
    except Exception:
        data = {}

    def _as_list(value) -> list[str]:
        if not value:
            return []
        return [str(v) for v in (value if isinstance(value, list) else [value])]

    _WIN_CACHE = {"onecore": _as_list(data.get("onecore")), "sapi": _as_list(data.get("sapi"))}
    return _WIN_CACHE


def _synth_winrt(text: str, out: str) -> bool:
    """Windows OneCore Thai voice (Pattara / Premwadee)."""
    if os.name != "nt" or not _windows_thai_voices()["onecore"]:
        return False
    safe = text.replace("'", "''")
    target = out.replace("'", "''")
    script = (
        "[void][Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media,ContentType=WindowsRuntime];"
        "[void][Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime];"
        "Add-Type -AssemblyName System.Runtime.WindowsRuntime;"
        "$await = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {"
        " $_.Name -eq 'GetAwaiter' -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' }"
        " | Select-Object -First 1;"
        "function Wait-Rt($op, $type) {"
        " $m = $await.MakeGenericMethod($type); $aw = $m.Invoke($null, @($op)); $aw.GetResult() }"
        "$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer;"
        "$voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices |"
        " Where-Object { $_.Language -like 'th*' } | Select-Object -First 1;"
        "if (-not $voice) { exit 1 }"
        "$synth.Voice = $voice;"
        f"$stream = Wait-Rt $synth.SynthesizeTextToStreamAsync('{safe}')"
        " ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream]);"
        "$reader = New-Object Windows.Storage.Streams.DataReader($stream);"
        "[void](Wait-Rt $reader.LoadAsync([uint32]$stream.Size) ([uint32]));"
        "$bytes = New-Object byte[] $stream.Size;"
        "$reader.ReadBytes($bytes);"
        f"[System.IO.File]::WriteAllBytes('{target}', $bytes);"
    )
    _powershell(script, timeout=60)
    return _ok(out)


def _synth_sapi(text: str, out: str) -> bool:
    """Windows SAPI — used only when a Thai SAPI voice is registered."""
    thai = _windows_thai_voices()["sapi"]
    if os.name != "nt" or not thai:
        return False
    name = thai[0].replace("'", "''")
    target = out.replace("'", "''")
    script = (
        "Add-Type -AssemblyName System.Speech;"
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;"
        f"$s.SelectVoice('{name}');"
        f"$s.SetOutputToWaveFile('{target}');"
        "$s.Speak([Console]::In.ReadToEnd());"
        "$s.Dispose();"
    )
    _powershell(script, text.encode("utf-8"), timeout=60)
    return _ok(out)


def _espeak_thai() -> str | None:
    exe = shutil.which("espeak-ng") or shutil.which("espeak")
    if not exe:
        return None
    try:
        done = subprocess.run([exe, "--voices=th"], stdout=subprocess.PIPE, timeout=10)
        if done.returncode == 0 and b"th" in (done.stdout or b"").lower():
            return exe
    except Exception:
        return None
    return None


def _synth_espeak(text: str, out: str) -> bool:
    exe = _espeak_thai()
    if not exe:
        return False
    return _run([exe, "-v", "th", "-w", out, text]) and _ok(out)


def device_engine() -> str | None:
    """Thai voice engine on this PC, ignoring the internet."""
    if os.name == "nt":
        voices = _windows_thai_voices()
        if voices["onecore"]:
            return "windows-onecore-th"
        if voices["sapi"]:
            return "windows-sapi-th"
    if _espeak_thai():
        return "espeak-th"
    return None


def available() -> bool:
    """True when a Thai sentence can be produced somehow."""
    return device_engine() is not None or online_available()


def cached_count() -> int:
    if not os.path.isdir(VOICE_DIR):
        return 0
    return len([f for f in os.listdir(VOICE_DIR) if f.endswith((".mp3", ".wav"))])


def status() -> dict:
    engine = device_engine()
    online = online_available()
    labels = {
        "windows-onecore-th": "ใช้เสียงไทยของ Windows ที่ติดตั้งไว้",
        "windows-sapi-th": "ใช้เสียงไทยของ Windows ที่ติดตั้งไว้",
        "espeak-th": "ใช้เสียงไทยของ espeak-ng (เสียงหุ่นยนต์)",
    }
    saved = cached_count()
    if online:
        message = "ใช้เสียงพูดไทยธรรมชาติแบบเดียวกับระบบออนไลน์ และเก็บไว้ใช้ตอนไม่มีเน็ต"
    elif saved:
        message = f"ใช้เสียงไทยที่บันทึกไว้แล้ว {saved} ประโยค (ออฟไลน์)"
    else:
        message = labels.get(engine or "", "ยังไม่มีเสียงพูดไทยในเครื่องนี้")
    return {
        "engine": "cloud-th" if online else engine,
        "device_engine": engine,
        "online": online,
        "thai_ready": bool(online or engine or saved),
        "cached_clips": saved,
        "message": message,
    }


def synthesize(text: str) -> tuple[bytes, str] | None:
    """Audio for one sentence: cache first, then online, then device voices."""
    text = " ".join((text or "").split())
    if not text:
        return None

    found = _cached(text)
    if found:
        return found

    data = _fetch_cloud(text)
    if data:
        _store(text, data, ".mp3")
        return data, "audio/mpeg"

    tmp = os.path.join(tempfile.gettempdir(), f"fg-voice-{os.getpid()}.wav")
    if _synth_winrt(text, tmp) or _synth_sapi(text, tmp) or _synth_espeak(text, tmp):
        with open(tmp, "rb") as fh:
            wav = fh.read()
        _store(text, wav, ".wav")
        try:
            os.remove(tmp)
        except OSError:
            pass
        return wav, "audio/wav"
    return None


# --------------------------------------------------------------- pre-render


def sentences_to_prepare() -> list[str]:
    """Every sentence the kiosk may speak: fixed messages plus each name."""
    settings = db.get_settings()
    fixed = [
        settings.get("voice_denied_text") or "",
        settings.get("voice_out_of_window_text") or "",
        "พบหลายใบหน้า กรุณาเข้ามาคนเดียว",
        "กรุณาเข้ามาคนเดียว",
        "ไม่สามารถยืนยันตัวตนได้ กรุณามองกล้องอีกครั้ง",
        "ยังไม่มีข้อมูลใบหน้าในระบบ",
        "กรุณามองกล้องอีกครั้ง",
        "ทดสอบเสียง สแกนสำเร็จ ยินดีต้อนรับ",
    ]
    template = settings.get("voice_template") or "สแกนสำเร็จ {name} {direction}"
    duplicate = settings.get("voice_duplicate_template") or "สแกนซ้ำ {name} บันทึกเวลาไปแล้ว"
    late = (settings.get("voice_late_suffix") or "").strip()

    people = db.query(
        "SELECT full_name, nickname, student_code, IFNULL(class_room,'') AS class_room"
        " FROM students WHERE is_active = 1 ORDER BY full_name LIMIT 2000"
    )
    out: list[str] = [s for s in fixed if s.strip()]
    for person in people:
        # Spoken name matches the kiosk: full name first, nickname via {nickname}.
        name = (person["full_name"] or "").strip() or (person["nickname"] or "").strip()
        nick = (person["nickname"] or "").strip()
        if not name:
            continue
        for direction in ("เข้าโรงเรียน", "ออกโรงเรียน"):
            base = (
                template.replace("{name}", name)
                .replace("{nickname}", nick)
                .replace("{direction}", direction)
                .replace("{code}", person["student_code"] or "")
                .replace("{class}", person["class_room"] or "")
            ).strip()
            out.append(base)
            if late:
                out.append(f"{base} {late}".strip())
        out.append(
            duplicate.replace("{name}", name).replace("{nickname}", nick)
            .replace("{direction}", "เข้าโรงเรียน").strip()
        )

    seen: list[str] = []
    for sentence in out:
        clean = " ".join(sentence.split())
        if clean and clean not in seen:
            seen.append(clean)
    return seen


def prepare_offline_voice(limit: int = 4000) -> dict:
    """Downloads every sentence once so the kiosk speaks Thai without internet."""
    sentences = sentences_to_prepare()[:limit]
    made = skipped = failed = 0
    for sentence in sentences:
        if _cached(sentence):
            skipped += 1
            continue
        data = _fetch_cloud(sentence)
        if data:
            _store(sentence, data, ".mp3")
            made += 1
        else:
            failed += 1
            if failed >= 5 and made == 0:
                break
    return {
        "total": len(sentences),
        "downloaded": made,
        "already": skipped,
        "failed": failed,
        **status(),
    }


def clear_cache() -> int:
    """Removes stored sentences so new ones are rendered again."""
    if not os.path.isdir(VOICE_DIR):
        return 0
    removed = 0
    for name in os.listdir(VOICE_DIR):
        if name.endswith((".mp3", ".wav")):
            try:
                os.remove(os.path.join(VOICE_DIR, name))
                removed += 1
            except OSError:
                pass
    return removed


if __name__ == "__main__":  # quick manual check
    print("status:", status())
    clip = synthesize(" ".join(sys.argv[1:]) or "ทดสอบเสียงระบบสแกนใบหน้า")
    print("bytes:", len(clip[0]) if clip else 0, clip[1] if clip else "-")
