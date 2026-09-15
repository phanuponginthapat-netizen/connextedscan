"""
Thai offline speech for the standalone build.

The kiosk first tries a Thai voice built into the browser engine. When the PC
has none (common on fresh Windows/Linux installs) the program speaks the
sentence itself — but only with a *Thai* voice, never with an English one,
because an English voice reading Thai text sounds like nonsense.

Engines, in order:

  1. Piper + the Thai voice model (th_TH-tsync2) — bundled in the installer or
     downloaded once from the admin page. Works fully offline afterwards.
  2. Windows OneCore Thai voice (Pattara / Premwadee), if the Thai language
     speech pack is installed.
  3. Windows SAPI, only when a Thai voice is registered.
  4. espeak-ng, only when it ships the Thai voice.

Every sentence is rendered once and kept as a .wav file inside the data folder,
so repeated announcements play instantly and need no internet at all.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile

import localdb as db

VOICE_DIR = os.path.join(db.DATA_DIR, "voice")
ENGINE_DIR = os.path.join(db.DATA_DIR, "voice-engine")

PIPER_URLS = {
    "nt": "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip",
    "posix": "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz",
}
MODEL_URL = (
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
    "th/th_TH/tsync2/medium/th_TH-tsync2-medium.onnx?download=true"
)
MODEL_CONFIG_URL = (
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
    "th/th_TH/tsync2/medium/th_TH-tsync2-medium.onnx.json?download=true"
)


def _cache_path(text: str) -> str:
    key = hashlib.sha1(text.strip().encode("utf-8")).hexdigest()[:24]
    return os.path.join(VOICE_DIR, f"{key}.wav")


def _voice_dirs() -> list[str]:
    """Folders that may hold the piper program and the Thai voice model."""
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.environ.get("FACEGATE_VOICE_DIR") or "",
        ENGINE_DIR,
        os.path.join(here, "..", "resources", "voices"),
        os.path.join(here, "..", "..", "voices"),
        os.path.join(here, "..", "..", "runtime", "voices"),
        os.path.join(here, "..", "runtime", "voices"),
    ]
    seen: list[str] = []
    for path in candidates:
        if not path:
            continue
        full = os.path.abspath(path)
        if os.path.isdir(full) and full not in seen:
            seen.append(full)
    return seen


def _find_file(names: tuple[str, ...]) -> str | None:
    for folder in _voice_dirs():
        for root, _dirs, files in os.walk(folder):
            for name in files:
                if name in names:
                    return os.path.join(root, name)
    return None


def _find_thai_model() -> str | None:
    for folder in _voice_dirs():
        for root, _dirs, files in os.walk(folder):
            for name in sorted(files):
                if name.endswith(".onnx") and ("th_TH" in name or name.startswith("th")):
                    return os.path.join(root, name)
    return None


def _piper() -> tuple[str, str] | None:
    """Returns (piper executable, Thai voice model) when both are present."""
    model = _find_thai_model()
    if not model:
        return None
    exe = _find_file(("piper.exe",) if os.name == "nt" else ("piper",))
    if exe and not os.access(exe, os.X_OK) and os.name != "nt":
        try:
            os.chmod(exe, 0o755)
        except OSError:
            pass
    if not exe:
        exe = shutil.which("piper")
    if not exe:
        return None
    return exe, model


def _run(cmd: list[str], stdin: bytes | None = None, timeout: int = 25) -> bool:
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
            timeout=timeout,
            creationflags=flags,
        )
        return done.returncode == 0
    except Exception:
        return False


def _powershell(script: str, stdin: bytes | None = None, timeout: int = 30) -> str:
    try:
        flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0  # type: ignore[attr-defined]
    except AttributeError:
        flags = 0
    try:
        done = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            input=stdin,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
            creationflags=flags,
        )
        return (done.stdout or b"").decode("utf-8", "ignore")
    except Exception:
        return ""


def _ok(out: str) -> bool:
    return os.path.isfile(out) and os.path.getsize(out) > 1024


def _synth_piper(text: str, out: str) -> bool:
    found = _piper()
    if not found:
        return False
    exe, model = found
    env_dir = os.path.dirname(exe)
    cmd = [exe, "--model", model, "--output_file", out]
    old = os.environ.get("LD_LIBRARY_PATH")
    if os.name != "nt":
        os.environ["LD_LIBRARY_PATH"] = env_dir + (f":{old}" if old else "")
    try:
        return _run(cmd, text.encode("utf-8"), timeout=60) and _ok(out)
    finally:
        if os.name != "nt":
            if old is None:
                os.environ.pop("LD_LIBRARY_PATH", None)
            else:
                os.environ["LD_LIBRARY_PATH"] = old


def _windows_thai_voices() -> dict[str, list[str]]:
    """Thai voices this PC has, split by Windows speech API."""
    if os.name != "nt":
        return {"onecore": [], "sapi": []}
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
        return {"onecore": [], "sapi": []}

    def _as_list(value) -> list[str]:
        if not value:
            return []
        return [str(v) for v in (value if isinstance(value, list) else [value])]

    return {"onecore": _as_list(data.get("onecore")), "sapi": _as_list(data.get("sapi"))}


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
        "[void](Wait-Rt $reader.LoadAsync([uint32]$stream.Size) ([uint32]);)"
        "$bytes = New-Object byte[] $stream.Size;"
        "$reader.ReadBytes($bytes);"
        f"[System.IO.File]::WriteAllBytes('{target}', $bytes);"
    )
    _powershell(script, timeout=60)
    return _ok(out)


def _synth_windows(text: str, out: str) -> bool:
    """Windows SAPI — used only when a Thai SAPI voice exists."""
    if os.name != "nt":
        return False
    thai = _windows_thai_voices()["sapi"]
    if not thai:
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


def engine() -> str | None:
    """Name of the Thai engine this PC can use, or None."""
    if _piper():
        return "piper-th"
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
    """True when this PC can produce *Thai* speech without the internet."""
    return engine() is not None


def status() -> dict:
    found = engine()
    labels = {
        "piper-th": "เสียงพูดไทยแบบออฟไลน์ (Piper th_TH) พร้อมใช้งาน",
        "windows-onecore-th": "ใช้เสียงไทยของ Windows ที่ติดตั้งไว้",
        "windows-sapi-th": "ใช้เสียงไทยของ Windows ที่ติดตั้งไว้",
        "espeak-th": "ใช้เสียงไทยของ espeak-ng",
    }
    return {
        "engine": found,
        "thai_ready": bool(found),
        "cached_clips": len(
            [f for f in os.listdir(VOICE_DIR) if f.endswith(".wav")]
        )
        if os.path.isdir(VOICE_DIR)
        else 0,
        "message": labels.get(found or "", "ยังไม่มีเสียงพูดไทยในเครื่องนี้"),
    }


# ------------------------------------------------------------- install voice


def _download(url: str, dest: str) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "FaceGate"})
    with urllib.request.urlopen(request, timeout=600) as response, open(dest, "wb") as fh:
        shutil.copyfileobj(response, fh)


def install_thai_voice() -> dict:
    """Downloads the Thai Piper voice once; afterwards everything is offline."""
    if _piper():
        return {"installed": True, **status()}

    os.makedirs(ENGINE_DIR, exist_ok=True)
    key = "nt" if os.name == "nt" else "posix"
    tmp = tempfile.mkdtemp(prefix="fg-voice-")
    try:
        if not _find_file(("piper.exe",) if os.name == "nt" else ("piper",)) and not shutil.which("piper"):
            archive = os.path.join(tmp, "piper.zip" if key == "nt" else "piper.tar.gz")
            _download(PIPER_URLS[key], archive)
            if key == "nt":
                with zipfile.ZipFile(archive) as zf:
                    zf.extractall(ENGINE_DIR)
            else:
                with tarfile.open(archive) as tf:
                    tf.extractall(ENGINE_DIR)
            exe = _find_file(("piper.exe",) if os.name == "nt" else ("piper",))
            if exe and os.name != "nt":
                try:
                    os.chmod(exe, 0o755)
                except OSError:
                    pass

        model = _find_thai_model()
        if not model:
            model_dir = os.path.join(ENGINE_DIR, "th_TH")
            os.makedirs(model_dir, exist_ok=True)
            _download(MODEL_URL, os.path.join(model_dir, "th_TH-tsync2-medium.onnx"))
            _download(MODEL_CONFIG_URL, os.path.join(model_dir, "th_TH-tsync2-medium.onnx.json"))
    except Exception as exc:  # network or disk problem
        return {"installed": False, "error": str(exc)[:200], **status()}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    clear_cache()
    ready = status()
    return {"installed": bool(ready["thai_ready"]), **ready}


def clear_cache() -> int:
    """Removes rendered sentences so the new voice is used from now on."""
    if not os.path.isdir(VOICE_DIR):
        return 0
    removed = 0
    for name in os.listdir(VOICE_DIR):
        if name.endswith(".wav"):
            try:
                os.remove(os.path.join(VOICE_DIR, name))
                removed += 1
            except OSError:
                pass
    return removed


def synthesize(text: str) -> bytes | None:
    """Returns wav audio for a sentence, rendering it only the first time."""
    text = " ".join((text or "").split())
    if not text:
        return None

    os.makedirs(VOICE_DIR, exist_ok=True)
    cached = _cache_path(text)
    if os.path.isfile(cached) and os.path.getsize(cached) > 1024:
        with open(cached, "rb") as fh:
            return fh.read()

    tmp = os.path.join(tempfile.gettempdir(), f"fg-voice-{os.getpid()}.wav")
    made = (
        _synth_piper(text, tmp)
        or _synth_winrt(text, tmp)
        or _synth_windows(text, tmp)
        or _synth_espeak(text, tmp)
    )
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
    print("engine:", status())
    audio = synthesize(" ".join(sys.argv[1:]) or "ทดสอบเสียงระบบสแกนใบหน้า")
    print("bytes:", len(audio or b""))
