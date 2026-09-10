/**
 * FaceGate auto-update
 * --------------------
 * Downloads the newest agent code from the cloud into the writable user-data
 * folder. The kiosk page itself always comes from the cloud, so refreshing the
 * window is enough to pick up web updates.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function sha256File(file) {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}

async function fetchManifest(cloudUrl) {
  const res = await fetch(`${cloudUrl}/api/public/agent/manifest.json`, {
    headers: { "cache-control": "no-cache" },
  });
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  return res.json();
}

/**
 * Sync agent files into `targetDir`.
 * Returns { agentDir, changed, appVersion } — agentDir is null when nothing
 * could be downloaded (offline first run), so the bundled copy is used.
 */
async function syncAgent(cloudUrl, targetDir, bundledDir) {
  const manifest = await fetchManifest(cloudUrl.replace(/\/$/, ""));
  fs.mkdirSync(targetDir, { recursive: true });

  let changed = false;
  for (const [name, hash] of Object.entries(manifest.files || {})) {
    const dest = path.join(targetDir, name);
    if (sha256File(dest) === hash) continue;

    // Fall back to the bundled file when it already matches the cloud hash.
    const bundled = path.join(bundledDir, name);
    if (sha256File(bundled) === hash) {
      fs.copyFileSync(bundled, dest);
      changed = true;
      continue;
    }

    const res = await fetch(`${manifest.baseUrl}/${name}`, {
      headers: { "cache-control": "no-cache" },
    });
    if (!res.ok) throw new Error(`download ${name} ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, body);
    changed = true;
    console.log(`[update] updated ${name}`);
  }

  return { agentDir: targetDir, changed, appVersion: manifest.appVersion };
}

module.exports = { syncAgent };
