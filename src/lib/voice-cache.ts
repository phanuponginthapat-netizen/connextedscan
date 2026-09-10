/**
 * Offline voice clips for the kiosk.
 *
 * Every spoken sentence is downloaded once and then stored on the device
 * (IndexedDB, which the FaceGate desktop app keeps between restarts).
 * After the first time a sentence is heard it plays instantly with no
 * network use at all.
 */

const DB_NAME = "facegate-voice";
const STORE = "clips";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readClip(key: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    return await new Promise<Blob | null>((resolve) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as Blob) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeClip(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, key);
  } catch {
    /* storage unavailable — the clip is simply fetched again next time */
  }
}

/** Returns the audio for a sentence, from the device when possible. */
export async function getVoiceClip(text: string): Promise<Blob> {
  const key = text.trim();
  const cached = await readClip(key);
  if (cached) return cached;

  const res = await fetch("/api/public/kiosk/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: key }),
  });
  if (!res.ok) throw new Error("tts failed");
  const blob = await res.blob();
  void writeClip(key, blob);
  return blob;
}

/** Downloads sentences ahead of time so scanning never waits for the network. */
export async function prewarmVoiceClips(texts: string[]): Promise<void> {
  for (const text of texts) {
    try {
      await getVoiceClip(text);
    } catch {
      /* keep going: a missing clip just falls back to a live request */
    }
  }
}
