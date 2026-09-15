/**
 * FaceGate Electron shell
 * -------------------------
 * Bundles the browser kiosk and the local Python/ArcFace agent into one
 * desktop program. On launch it starts the agent in the background and opens
 * the cloud kiosk page in full-screen mode.
 */

const { app, BrowserWindow, ipcMain, globalShortcut, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { spawn, spawnSync } = require("child_process");
const { syncAgent } = require("./updater.cjs");

const CONFIG_PATH = path.join(app.getPath("userData"), "facegate-config.json");
const UPDATE_DIR = path.join(app.getPath("userData"), "agent");
const AGENT_LOG_PATH = path.join(app.getPath("userData"), "facegate-agent.log");
const UPDATE_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_CLOUD_URL =
  "https://connextedscan.lovable.app";

// Let the kiosk page speak the moment it loads — no "enable sound" tap needed.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
// Give the kiosk everything this PC has: no throttling, full GPU use.
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("canvas-oop-rasterization");
app.commandLine.appendSwitch("force_high_performance_gpu");
app.commandLine.appendSwitch("enable-features", "CanvasOopRasterization,WebAssemblySimd,WebAssemblyLazyCompilation");
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=2048");

let kioskWindow = null;
let settingsWindow = null;
let agentProcess = null;
let currentAppVersion = null;
let agentRestartTimer = null;
let appIsQuitting = false;
let healthTimer = null;
let agentStatus = {
  state: "stopped",
  message: "ยังไม่ได้เริ่มตัวประมวลผลใบหน้า",
  lastError: "",
  startedAt: null,
  python: "",
  script: "",
  logPath: AGENT_LOG_PATH,
  attempts: 0,
};

/**
 * The kiosk page can only scan once the local engine answers on 127.0.0.1.
 * Asking it directly from the main process is far more reliable than guessing
 * from the log lines Python happens to print.
 */
function probeAgentHealth() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: 8899, path: "/health", timeout: 2500 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

function startHealthWatch() {
  if (healthTimer) return;
  healthTimer = setInterval(async () => {
    const ok = await probeAgentHealth();
    if (ok) {
      if (agentStatus.state !== "running") {
        agentStatus = {
          ...agentStatus,
          state: "running",
          message: "ตัวประมวลผลใบหน้าพร้อมใช้งาน",
        };
      }
      return;
    }
    if (agentStatus.state === "running") {
      agentStatus = {
        ...agentStatus,
        state: "error",
        message: "ตัวประมวลผลใบหน้าหยุดตอบสนอง กำลังเปิดใหม่",
      };
    }
    // Nothing is running at all: bring it back instead of waiting forever.
    if (
      !agentProcess &&
      !agentRestartTimer &&
      !appIsQuitting &&
      agentStatus.state !== "configuration_required" &&
      agentStatus.state !== "python_missing"
    ) {
      startAgent();
    }
  }, 2000);
}

function loadConfig() {
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return { cloudUrl: DEFAULT_CLOUD_URL, deviceKey: "" };
  }
  // Older installs saved an internal preview address that now refuses
  // connections and left the window black. Move them to the live site.
  const saved = (cfg.cloudUrl || "").trim();
  if (!saved || /project--[0-9a-f-]+(-dev)?\.lovable\.app/.test(saved) || /id-preview/.test(saved)) {
    cfg.cloudUrl = DEFAULT_CLOUD_URL;
    try {
      saveConfig(cfg);
    } catch {
      // read-only profile: keep the corrected value in memory
    }
  }
  return cfg;
}

function saveConfig(cfg) {
  const rawUrl = String(cfg.cloudUrl || "").trim();
  let cloudUrl;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("unsupported protocol");
    }
    cloudUrl = parsed.origin + parsed.pathname.replace(/\/+$/, "");
  } catch {
    throw new Error("ที่อยู่ระบบไม่ถูกต้อง กรุณาใส่ URL ที่ขึ้นต้นด้วย https://");
  }
  fs.writeFileSync(
    CONFIG_PATH,
    JSON.stringify({ ...cfg, cloudUrl }, null, 2),
  );
}

function stopAgent({ restart = false } = {}) {
  if (agentRestartTimer) {
    clearTimeout(agentRestartTimer);
    agentRestartTimer = null;
  }
  if (agentProcess) {
    agentProcess._faceGateRestart = restart;
    try {
      agentProcess.kill();
    } catch {
      // ignore
    }
    agentProcess = null;
  }
}

/**
 * Finds a Python that can actually run on this PC. The packaged build ships
 * its own runtime, but on machines where it is missing we try the usual
 * commands instead of failing silently.
 */
let lastPythonTried = [];

function resolvePython(runtimeDir, agentDir) {
  const win = process.platform === "win32";
  const candidates = [];
  const push = (command, args = []) => candidates.push({ command, args });

  push(win
    ? path.join(runtimeDir, "python", "python.exe")
    : path.join(runtimeDir, "python", "bin", "python3"));
  push(win
    ? path.join(runtimeDir, "python", "bin", "python3.11")
    : path.join(runtimeDir, "python", "bin", "python3.11"));
  push(win
    ? path.join(agentDir, ".venv", "Scripts", "python.exe")
    : path.join(agentDir, ".venv", "bin", "python"));
  if (win) {
    push(path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python311", "python.exe"));
    push("py", ["-3"]);
    push("python");
    push("python3");
  } else {
    push("python3");
    push("python");
    push("/usr/bin/python3");
  }

  lastPythonTried = [];
  for (const candidate of candidates) {
    if (!candidate.command) continue;
    const absolute = path.isAbsolute(candidate.command);
    if (absolute && !fs.existsSync(candidate.command)) {
      lastPythonTried.push(`${candidate.command} (ไม่พบไฟล์)`);
      continue;
    }
    try {
      const probe = spawnSync(candidate.command, [...candidate.args, "--version"], {
        timeout: 8000,
        windowsHide: true,
      });
      if (!probe.error && probe.status === 0) return candidate;
      lastPythonTried.push(
        `${candidate.command} (${probe.error ? probe.error.code || probe.error.message : `exit ${probe.status}`})`,
      );
    } catch (err) {
      lastPythonTried.push(`${candidate.command} (${err?.message || "error"})`);
    }
  }
  return null;
}

function resolveAgentDir() {
  const bundled = path.join(__dirname, "..", "agent").replace("app.asar", "app.asar.unpacked");
  const hasUpdate =
    fs.existsSync(path.join(UPDATE_DIR, "agent.py")) &&
    fs.existsSync(path.join(UPDATE_DIR, "face_engine.py"));
  return hasUpdate ? UPDATE_DIR : bundled;
}

function startAgent() {
  stopAgent({ restart: true });
  const cfg = loadConfig();
  const deviceKey = (cfg.deviceKey || "").trim();
  const cloudUrl = (cfg.cloudUrl || DEFAULT_CLOUD_URL).replace(/\/$/, "");

  if (!deviceKey) {
    agentStatus = {
      state: "configuration_required",
      message: "ยังไม่ได้ตั้งรหัสเครื่อง",
      lastError: "",
      startedAt: null,
    };
    return false;
  }

  // Files spawned by a child process must live outside the asar archive.
  const bundledAgentDir = path
    .join(__dirname, "..", "agent")
    .replace("app.asar", "app.asar.unpacked");
  // Prefer the auto-updated copy in user data when it is complete.
  const hasUpdate =
    fs.existsSync(path.join(UPDATE_DIR, "agent.py")) &&
    fs.existsSync(path.join(UPDATE_DIR, "face_engine.py"));
  const agentDir = hasUpdate ? UPDATE_DIR : bundledAgentDir;
  const script = path.join(agentDir, "agent.py");

  if (!fs.existsSync(script)) {
    agentStatus = {
      state: "error",
      message: "ไม่พบไฟล์ตัวประมวลผลใบหน้าในเครื่อง",
      lastError: `missing ${script}`,
      startedAt: null,
    };
    return false;
  }

  const runtimeDir = path.join(process.resourcesPath || path.join(__dirname, ".."), "runtime");
  const resolved = resolvePython(runtimeDir, agentDir);
  if (!resolved) {
    agentStatus = {
      ...agentStatus,
      state: "python_missing",
      message: "ไม่พบโปรแกรม Python ในเครื่องนี้ กรุณาติดตั้ง Python 3.9 ขึ้นไป แล้วกดเปิดใหม่",
      lastError: `python interpreter not found: ${lastPythonTried.join(" | ")}`,
      python: "",
      script,
      startedAt: null,
    };
    try {
      fs.appendFileSync(
        AGENT_LOG_PATH,
        `${new Date().toISOString()} python not found: ${lastPythonTried.join(" | ")}\n`,
      );
    } catch {
      // logging must never break the kiosk
    }
    return false;
  }

  const sitePath = path.join(runtimeDir, "site");
  const modelDir = path.join(runtimeDir, "models");
  const env = {
    ...process.env,
    FACEGATE_DEVICE_KEY: deviceKey,
    FACEGATE_CLOUD_URL: cloudUrl,
    PYTHONUNBUFFERED: "1",
  };
  env.PYTHONPATH = [
    fs.existsSync(sitePath) ? sitePath : null,
    agentDir,
    process.env.PYTHONPATH,
  ]
    .filter(Boolean)
    .join(path.delimiter);
  if (fs.existsSync(modelDir)) {
    env.FACEGATE_MODEL_DIR = modelDir;
  }

  const appendLog = (line) => {
    try {
      fs.appendFileSync(AGENT_LOG_PATH, `${new Date().toISOString()} ${line}\n`);
    } catch {
      // logging must never break the kiosk
    }
  };

  // The Windows embedded Python (python*._pth) runs isolated and IGNORES the
  // PYTHONPATH environment variable, so runtime/site is never found and cv2
  // fails to import. Bootstrap via -c and insert the paths into sys.path
  // directly — that always works, on every interpreter.
  const bootstrap = [
    "import sys, runpy",
    `sys.path.insert(0, ${JSON.stringify(agentDir)})`,
    fs.existsSync(sitePath) ? `sys.path.insert(0, ${JSON.stringify(sitePath)})` : "",
    `sys.argv = [${JSON.stringify(script)}]`,
    `runpy.run_path(${JSON.stringify(script)}, run_name="__main__")`,
  ]
    .filter(Boolean)
    .join("; ");

  try {
    appendLog(`start ${resolved.command} ${[...resolved.args, script].join(" ")}`);
    agentProcess = spawn(resolved.command, [...resolved.args, "-c", bootstrap], {
      env,
      detached: false,
      cwd: agentDir,
      windowsHide: true,
    });
    agentStatus = {
      ...agentStatus,
      state: "starting",
      message: "กำลังเปิดตัวประมวลผลใบหน้า (ครั้งแรกอาจใช้เวลาสักครู่)",
      lastError: "",
      python: `${resolved.command} ${resolved.args.join(" ")}`.trim(),
      script,
      logPath: AGENT_LOG_PATH,
      attempts: (agentStatus.attempts || 0) + 1,
      startedAt: Date.now(),
    };
    startHealthWatch();
    watchRestartRequest();
  } catch (err) {
    console.error("[agent] failed to start", err);
    appendLog(`spawn failed: ${err?.message || err}`);
    agentProcess = null;
    agentStatus = {
      state: "error",
      message: "เปิดตัวประมวลผลใบหน้าไม่สำเร็จ",
      lastError: String(err?.message || err),
      startedAt: null,
    };
    return false;
  }
  agentProcess.on("error", (err) => {
    console.error("[agent] failed to start", err);
    appendLog(`process error: ${err?.message || err}`);
    agentStatus = {
      ...agentStatus,
      state: "error",
      message:
        err && err.code === "ENOENT"
          ? "เรียกโปรแกรม Python ไม่ได้ กรุณาติดตั้ง Python 3.9 ขึ้นไป"
          : "เปิดตัวประมวลผลใบหน้าไม่สำเร็จ",
      lastError: String(err?.message || err),
    };
  });
  agentProcess.stdout.on("data", (data) => {
    const line = data.toString().trim();
    console.log("[agent]", line);
    appendLog(`out: ${line}`);
    if (line.includes("Uvicorn running") || line.includes("face models ready")) {
      agentStatus = { ...agentStatus, state: "running", message: "ตัวประมวลผลใบหน้าพร้อมใช้งาน" };
    }
  });
  agentProcess.stderr.on("data", (data) => {
    const line = data.toString().trim();
    console.error("[agent]", line);
    appendLog(`err: ${line}`);
    if (line.includes("Uvicorn running")) {
      agentStatus = { ...agentStatus, state: "running", message: "ตัวประมวลผลใบหน้าพร้อมใช้งาน" };
    }
    if (/no module named/i.test(line)) {
      agentStatus = {
        ...agentStatus,
        state: "error",
        message: "ยังไม่ได้ติดตั้งไลบรารีที่ตัวประมวลผลต้องใช้ (pip install -r requirements.txt)",
        lastError: line.slice(-500),
      };
    } else if (/error|exception|traceback|missing/i.test(line)) {
      agentStatus = { ...agentStatus, lastError: line.slice(-500) };
    }
  });
  agentProcess.on("close", (code) => {
    console.log(`[agent] process exited with code ${code}`);
    appendLog(`exit code ${code}`);
    const shouldRestart = !appIsQuitting && !agentProcess?._faceGateRestart;
    agentProcess = null;
    agentStatus = {
      ...agentStatus,
      state: "error",
      message: `ตัวประมวลผลหยุดทำงาน (รหัส ${code ?? "ไม่ทราบ"})`,
    };
    if (shouldRestart) {
      agentStatus.message = "ตัวประมวลผลหยุดทำงาน กำลังเปิดใหม่อัตโนมัติ";
      agentRestartTimer = setTimeout(() => {
        agentRestartTimer = null;
        startAgent();
      }, 3000);
    }
  });

  return true;
}

function openKiosk() {
  if (kioskWindow) {
    kioskWindow.focus();
    return;
  }

  const cfg = loadConfig();
  const url = (cfg.cloudUrl || DEFAULT_CLOUD_URL).replace(/\/$/, "") + "/kiosk";

  kioskWindow = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    autoHideMenuBar: true,
    title: "FaceGate",
    backgroundColor: "#0a1424",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Allow the HTTPS cloud page to call the local HTTP agent on 127.0.0.1:8899
      webSecurity: false,
      preload: path.join(__dirname, "preload.cjs"),
      autoplayPolicy: "no-user-gesture-required",
      backgroundThrottling: false,
      spellcheck: false,
      enableWebSQL: false,
    },
  });

  // Camera and microphone are always allowed on the kiosk PC.
  kioskWindow.webContents.session.setPermissionRequestHandler((_wc, _perm, done) => done(true));
  kioskWindow.webContents.setBackgroundThrottling?.(false);

  // Branded loading screen instead of a blank window while the cloud page
  // (or the network) is still coming up.
  kioskWindow.loadFile(path.join(__dirname, "loading.html"));
  kioskWindow.once("ready-to-show", () => {
    if (kioskWindow) kioskWindow.show();
  });
  setTimeout(() => {
    if (kioskWindow) kioskWindow.loadURL(url);
  }, 800);

  // Retry when the kiosk PC boots before the network is ready — keep the
  // branded screen visible between attempts instead of an error page.
  const retryLater = (reason) => {
    if (!kioskWindow) return;
    console.warn(`[kiosk] load problem (${reason}) — retrying`);
    kioskWindow.loadFile(path.join(__dirname, "loading.html"));
    setTimeout(() => {
      if (kioskWindow) kioskWindow.loadURL(url);
    }, 5000);
  };

  kioskWindow.webContents.on("did-fail-load", (_e, code, description) =>
    retryLater(`${code} ${description}`),
  );

  // A server error page (403/404/500) still "loads", so it used to leave a
  // blank window. Treat it as a failure and keep the branded screen instead.
  kioskWindow.webContents.on("did-navigate", (_e, navigatedUrl, httpResponseCode) => {
    if (navigatedUrl.startsWith("file://")) return;
    if (typeof httpResponseCode === "number" && httpResponseCode >= 400) {
      retryLater(`HTTP ${httpResponseCode}`);
    }
  });

  kioskWindow.on("closed", () => {
    kioskWindow = null;
  });
}

function openSettings() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 640,
    height: 600,
    resizable: false,
    autoHideMenuBar: true,
    title: "FaceGate — ตั้งค่าเครื่องตู้สแกน",
    backgroundColor: "#0a1424",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  settingsWindow.loadFile(path.join(__dirname, "settings.html"));

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

/**
 * Check the cloud for a newer version of the scanning engine and the kiosk
 * page. New agent code restarts the background engine; a new web version
 * simply reloads the kiosk window.
 */
async function checkForUpdates({ initial = false } = {}) {
  const cfg = loadConfig();
  const cloudUrl = (cfg.cloudUrl || DEFAULT_CLOUD_URL).replace(/\/$/, "");
  const bundledAgentDir = path
    .join(__dirname, "..", "agent")
    .replace("app.asar", "app.asar.unpacked");

  try {
    const result = await syncAgent(cloudUrl, UPDATE_DIR, bundledAgentDir);
    const versionChanged =
      currentAppVersion !== null && result.appVersion !== currentAppVersion;
    currentAppVersion = result.appVersion;

    if (initial) return;

    if (result.changed) {
      console.log("[update] restarting scanning engine with the new version");
      startAgent();
    }
    if ((versionChanged || result.changed) && kioskWindow) {
      kioskWindow.reload();
    }
  } catch (err) {
    console.warn("[update] check failed:", err.message);
  }
}

// The Python program writes this file when the admin site asks for a restart
// (remote "restart app" button in the power-saving page).
function watchRestartRequest() {
  setInterval(() => {
    try {
      const agentDir = resolveAgentDir();
      if (!agentDir) return;
      const flag = path.join(agentDir, ".restart-requested");
      if (!fs.existsSync(flag)) return;
      fs.unlinkSync(flag);
      console.log("[power] restart requested from the admin site");
      startAgent();
      if (kioskWindow && !kioskWindow.isDestroyed()) kioskWindow.reload();
    } catch {
      // a failed restart must never take the kiosk down
    }
  }, 5000);
}

// IPC exposed to the settings page.
ipcMain.handle("get-config", () => loadConfig());
ipcMain.handle("get-agent-status", () => agentStatus);
ipcMain.handle("restart-agent", () => startAgent());
ipcMain.handle("open-agent-log", async () => {
  try {
    if (!fs.existsSync(AGENT_LOG_PATH)) fs.writeFileSync(AGENT_LOG_PATH, "");
    await shell.openPath(AGENT_LOG_PATH);
  } catch {
    // opening the log must never break the kiosk
  }
});
ipcMain.handle("open-settings", () => openSettings());
ipcMain.handle("save-config", (_event, cfg) => {
  saveConfig(cfg);
  startAgent();
  openKiosk();
  if (settingsWindow) {
    settingsWindow.close();
  }
});
ipcMain.handle("quit", () => {
  app.quit();
});

app.whenReady().then(async () => {
  // The kiosk is full-screen, so keep a reliable escape hatch for correcting
  // a mistyped cloud address. Both shortcuts open the local settings window.
  globalShortcut.register("CommandOrControl+Shift+S", openSettings);
  globalShortcut.register("F10", openSettings);

  const cfg = loadConfig();
  if (!cfg.deviceKey || !cfg.deviceKey.trim()) {
    openSettings();
  } else {
    // Start the engine first: waiting for the update check used to delay the
    // scanner by many seconds on slow or offline networks.
    startAgent();
    openKiosk();
    startHealthWatch();
    void checkForUpdates({ initial: true });
  }
  setInterval(() => {
    void checkForUpdates();
  }, UPDATE_INTERVAL_MS);
});

app.on("window-all-closed", () => {
  appIsQuitting = true;
  stopAgent();
  app.quit();
});

app.on("will-quit", () => {
  appIsQuitting = true;
  stopAgent();
  globalShortcut.unregisterAll();
});
