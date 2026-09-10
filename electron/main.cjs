/**
 * FaceGate Electron shell
 * -------------------------
 * Bundles the browser kiosk and the local Python/ArcFace agent into one
 * desktop program. On launch it starts the agent in the background and opens
 * the cloud kiosk page in full-screen mode.
 */

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { syncAgent } = require("./updater.cjs");

const CONFIG_PATH = path.join(app.getPath("userData"), "facegate-config.json");
const UPDATE_DIR = path.join(app.getPath("userData"), "agent");
const UPDATE_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_CLOUD_URL =
  "https://project--8a2237fd-d733-4dca-9c68-fe5d05c002f8.lovable.app";

let kioskWindow = null;
let settingsWindow = null;
let agentProcess = null;
let currentAppVersion = null;

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return { cloudUrl: DEFAULT_CLOUD_URL, deviceKey: "" };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function stopAgent() {
  if (agentProcess) {
    try {
      agentProcess.kill();
    } catch {
      // ignore
    }
    agentProcess = null;
  }
}

function startAgent() {
  stopAgent();
  const cfg = loadConfig();
  const deviceKey = (cfg.deviceKey || "").trim();
  const cloudUrl = (cfg.cloudUrl || DEFAULT_CLOUD_URL).replace(/\/$/, "");

  if (!deviceKey) {
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

  // The packaged build ships its own Python runtime + libraries next to the
  // executable, so nothing has to be installed on the kiosk PC.
  const runtimeDir = path.join(process.resourcesPath || path.join(__dirname, ".."), "runtime");
  const bundledPython =
    process.platform === "win32"
      ? path.join(runtimeDir, "python", "python.exe")
      : path.join(runtimeDir, "python", "bin", "python3");
  const hasBundledPython = fs.existsSync(bundledPython);
  const python = hasBundledPython
    ? bundledPython
    : process.platform === "win32"
      ? "python"
      : "python3";

  const sitePath = path.join(runtimeDir, "site");
  const modelDir = path.join(runtimeDir, "models");
  const env = {
    ...process.env,
    FACEGATE_DEVICE_KEY: deviceKey,
    FACEGATE_CLOUD_URL: cloudUrl,
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

  try {
    agentProcess = spawn(python, [script], { env, detached: false, cwd: agentDir });
  } catch (err) {
    console.error("[agent] failed to start", err);
    agentProcess = null;
    return false;
  }
  agentProcess.on("error", (err) => {
    console.error("[agent] failed to start", err);
  });
  agentProcess.stdout.on("data", (data) => {
    console.log("[agent]", data.toString().trim());
  });
  agentProcess.stderr.on("data", (data) => {
    console.error("[agent]", data.toString().trim());
  });
  agentProcess.on("close", (code) => {
    console.log(`[agent] process exited with code ${code}`);
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
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Allow the HTTPS cloud page to call the local HTTP agent on 127.0.0.1:8899
      webSecurity: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  kioskWindow.loadURL(url);

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
    width: 560,
    height: 460,
    resizable: false,
    autoHideMenuBar: true,
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

// IPC exposed to the settings page.
ipcMain.handle("get-config", () => loadConfig());
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

app.whenReady().then(() => {
  const cfg = loadConfig();
  if (!cfg.deviceKey || !cfg.deviceKey.trim()) {
    openSettings();
  } else {
    startAgent();
    openKiosk();
  }
});

app.on("window-all-closed", () => {
  stopAgent();
  app.quit();
});
