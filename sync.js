const syncEndpoint = "https://prodaptsolution.co.zw/prodapt-sync/api.php";
const syncKeyStorage = "prodapt.invoice.studio.server-key.v1";
const syncBaseStorage = "prodapt.invoice.studio.server-base.v1";
const syncBackupStorage = "prodapt.invoice.studio.before-server-sync.v1";
const syncCore = window.ProdaptSyncCore;

let serverKey = localStorage.getItem(syncKeyStorage) || "";
let syncBase = readSyncBase();
let syncGeneration = 0;
let syncPromise = null;
let syncTimer = null;
let syncPending = false;
let suppressSync = false;

function readSyncBase() {
  try {
    const saved = JSON.parse(localStorage.getItem(syncBaseStorage));
    return saved && Number.isInteger(saved.revision) && saved.state ? saved : null;
  } catch {
    return null;
  }
}

function setSyncStatus(message, tone = "neutral") {
  const element = document.querySelector("#syncStatus");
  element.textContent = message;
  element.dataset.tone = tone;
  document.querySelector("#syncNow").disabled = !serverKey;
  document.querySelector("#syncConnectFields").hidden = Boolean(serverKey);
  document.querySelector("#copyPhoneLink").hidden = !serverKey;
}

async function serverRequest(method, payload, key = serverKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(syncEndpoint, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(payload ? { "Content-Type": "application/json" } : {})
      },
      body: payload ? JSON.stringify(payload) : undefined,
      cache: "no-store",
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || `Server returned ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

function ensureBeforeSyncBackup() {
  if (localStorage.getItem(syncBackupStorage)) return;
  try {
    localStorage.setItem(syncBackupStorage, JSON.stringify(state));
  } catch {
    throw new Error("Storage is full. Download a backup before connecting this device.");
  }
}

function storeSyncBase(snapshot) {
  localStorage.setItem(syncBaseStorage, JSON.stringify({ revision: snapshot.revision, state: snapshot.state }));
  syncBase = { revision: snapshot.revision, state: clone(snapshot.state) };
}

function applyServerSnapshot(snapshot, generationAtStart, localAtStart) {
  storeSyncBase(snapshot);
  const current = clone(state);
  const merged = generationAtStart === syncGeneration
    ? clone(snapshot.state)
    : syncCore.mergeChanges(snapshot.state, localAtStart, current);
  merged.currentDocumentId = current.currentDocumentId;
  merged.migrations = { ...merged.migrations, ...current.migrations };

  if (!syncCore.same(merged, current)) {
    state = normalizeState(merged);
    const saved = state.documents.find((entry) => entry.id === draft.id);
    const before = localAtStart.documents.find((entry) => entry.id === draft.id);
    if (saved && before && draft.number === before.number && saved.number !== before.number) {
      draft.number = saved.number;
    }
    suppressSync = true;
    try {
      saveState();
    } finally {
      suppressSync = false;
    }
    renderAll();
  }
  if (generationAtStart !== syncGeneration) scheduleSync(0);
  window.dispatchEvent(new Event("prodapt:server-snapshot"));
  setSyncStatus(`Synced at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, "success");
}

async function performSync(initialSnapshot = null) {
  setSyncStatus("Syncing with server", "pending");
  ensureBeforeSyncBackup();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const snapshot = initialSnapshot || await serverRequest("GET");
    initialSnapshot = null;
    const generationAtStart = syncGeneration;
    const localAtStart = clone(state);
    const merged = !snapshot.state
      ? localAtStart
      : syncBase
        ? syncCore.mergeChanges(snapshot.state, syncBase.state, localAtStart)
        : syncCore.mergeInitial(snapshot.state, localAtStart);

    if (snapshot.state && syncCore.same(merged, snapshot.state)) {
      applyServerSnapshot(snapshot, generationAtStart, localAtStart);
      return true;
    }
    try {
      const saved = await serverRequest("PUT", { revision: snapshot.revision, state: merged });
      applyServerSnapshot(saved, generationAtStart, localAtStart);
      return true;
    } catch (error) {
      if (error.status !== 409 || attempt === 3) throw error;
    }
  }
  return false;
}

async function syncNow(initialSnapshot = null) {
  if (!serverKey) {
    setSyncStatus("This device is saving locally only", "warning");
    return false;
  }
  if (syncPromise) {
    try {
      await syncPromise;
    } catch {
      // The active request reports its own error before this retry.
    }
    return syncNow();
  }
  syncPromise = performSync(initialSnapshot);
  try {
    return await syncPromise;
  } catch (error) {
    setSyncStatus(`Saved on this device; server sync failed: ${error.message}`, "error");
    return false;
  } finally {
    syncPromise = null;
    if (syncPending) {
      syncPending = false;
      scheduleSync(0);
    }
  }
}

function scheduleSync(delay = 600) {
  if (!serverKey) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncNow(); }, delay);
}

function downloadStateBackup() {
  const content = JSON.stringify({ exportedAt: new Date().toISOString(), app: "PRODAPT Invoice Studio", state }, null, 2);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `PRODAPT-backup-${today()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  showNotice("Backup downloaded. Keep it private; it includes customer and business records.");
}

document.querySelector("#downloadBackup").addEventListener("click", downloadStateBackup);
document.querySelector("#syncNow").addEventListener("click", () => { syncNow(); });
document.querySelector("#copyPhoneLink").addEventListener("click", async () => {
  const url = `${window.location.origin}${window.location.pathname}#connect=${encodeURIComponent(serverKey)}`;
  try {
    await navigator.clipboard.writeText(url);
    showNotice("Phone link copied. Keep it private; it grants access to your records.");
  } catch {
    showNotice("Could not copy the phone link. Use the access key on the other device.");
  }
});

async function connectDevice(key) {
  if (!key) {
    setSyncStatus("Enter the access key for this device", "warning");
    return;
  }
  setSyncStatus("Checking access key", "pending");
  try {
    const snapshot = await serverRequest("GET", null, key);
    if (key !== serverKey) {
      localStorage.removeItem(syncBaseStorage);
      syncBase = null;
    }
    serverKey = key;
    localStorage.setItem(syncKeyStorage, key);
    document.querySelector("#syncAccessKey").value = "";
    await syncNow(snapshot);
  } catch (error) {
    setSyncStatus(`Could not connect: ${error.message}`, "error");
  }
}

document.querySelector("#connectSync").addEventListener("click", () => {
  connectDevice(document.querySelector("#syncAccessKey").value.trim());
});
document.querySelector("#syncAccessKeyFile").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    await connectDevice((await file.text()).trim());
  } catch (error) {
    setSyncStatus(`Could not read access key file: ${error.message}`, "error");
  } finally {
    event.target.value = "";
  }
});

window.addEventListener("prodapt:state-saved", () => {
  if (suppressSync) return;
  syncGeneration += 1;
  if (syncPromise) syncPending = true;
  scheduleSync();
});
window.addEventListener("online", () => scheduleSync(0));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) scheduleSync(0);
});
setInterval(() => scheduleSync(0), 30000);

window.prodaptServerSync = { flush: syncNow, backup: downloadStateBackup };
const pairHash = new URLSearchParams(window.location.hash.slice(1));
if (pairHash.has("connect")) {
  const pairKey = pairHash.get("connect") || "";
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  connectDevice(pairKey);
} else if (serverKey) syncNow();
else setSyncStatus("This device is saving locally only", "warning");
