const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Lets the kiosk page know it runs inside FaceGate, where audio may start
  // on its own without the person tapping an "enable sound" button.
  isFaceGate: true,
  autoplayAllowed: true,
  getConfig: () => ipcRenderer.invoke("get-config"),
  getAgentStatus: () => ipcRenderer.invoke("get-agent-status"),
  restartAgent: () => ipcRenderer.invoke("restart-agent"),
  openAgentLog: () => ipcRenderer.invoke("open-agent-log"),
  openSettings: () => ipcRenderer.invoke("open-settings"),
  saveConfig: (cfg) => ipcRenderer.invoke("save-config", cfg),
  quit: () => ipcRenderer.invoke("quit"),
});
