/* ------------------------------------------------------------------
   Data layer. Two modes:
   - "live":    Firebase is configured. Site content is read from Firestore
                (public, read-only) and written by the signed-in owner.
                Cleaning requests can be created by anyone but only read
                by the owner.
   - "preview": Firebase isn't set up yet. Everything is read from and
                saved to this browser only (localStorage).
------------------------------------------------------------------- */
import { FIREBASE_CONFIG, FIREBASE_VERSION, OWNER_EMAILS, isFirebaseConfigured } from "./config.js";
import { DEFAULT_SETTINGS, DEFAULT_AVAILABILITY } from "./defaults.js";

const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

export const mode = isFirebaseConfigured() ? "live" : "preview";

const KEYS = {
  previewSettings: "cpa_preview_settings",
  previewAvailability: "cpa_preview_availability",
  cacheSettings: "cpa_cache_settings",
  cacheAvailability: "cpa_cache_availability",
  previewRequests: "cpa_preview_requests",
};

function readLocal(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeLocal(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const isPlainObject = (v) => v && typeof v === "object" && !Array.isArray(v);

// Objects merge key by key; arrays and plain values replace.
export function merge(base, over) {
  if (!isPlainObject(over)) return structuredClone(base);
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over)) {
    if (isPlainObject(v) && isPlainObject(out[k])) out[k] = merge(out[k], v);
    else if (v !== undefined) out[k] = structuredClone(v);
  }
  return out;
}

/* ---------------- Firebase (loaded only when configured) ---------------- */

let appPromise = null;
function getApp() {
  appPromise ??= import(`${CDN}/firebase-app.js`).then(({ initializeApp }) =>
    initializeApp(FIREBASE_CONFIG)
  );
  return appPromise;
}

let dbPromise = null;
function getDb() {
  dbPromise ??= Promise.all([getApp(), import(`${CDN}/firebase-firestore-lite.js`)]).then(
    ([app, fs]) => ({ db: fs.getFirestore(app), fs })
  );
  return dbPromise;
}

async function readRemote(id) {
  const { db, fs } = await getDb();
  const snap = await fs.getDoc(fs.doc(db, "site", id));
  return snap.exists() ? snap.data() : null;
}

async function writeRemote(id, data) {
  const { db, fs } = await getDb();
  await fs.setDoc(fs.doc(db, "site", id), { ...data, updatedAt: new Date().toISOString() });
}

/* ---------------- Public API ---------------- */

// Instant, synchronous best guess (for painting before the network answers).
export function cachedSettings() {
  const stored = mode === "preview" ? readLocal(KEYS.previewSettings) : readLocal(KEYS.cacheSettings);
  return merge(DEFAULT_SETTINGS, stored);
}
export function cachedAvailability() {
  const stored = mode === "preview" ? readLocal(KEYS.previewAvailability) : readLocal(KEYS.cacheAvailability);
  return merge(DEFAULT_AVAILABILITY, stored);
}

export async function loadSettings() {
  if (mode === "preview") return cachedSettings();
  try {
    const remote = await readRemote("settings");
    if (remote) writeLocal(KEYS.cacheSettings, remote);
    return merge(DEFAULT_SETTINGS, remote);
  } catch (err) {
    console.warn("Using cached settings:", err);
    return cachedSettings();
  }
}

export async function loadAvailability() {
  if (mode === "preview") return cachedAvailability();
  try {
    const remote = await readRemote("availability");
    if (remote) writeLocal(KEYS.cacheAvailability, remote);
    return merge(DEFAULT_AVAILABILITY, remote);
  } catch (err) {
    console.warn("Using cached availability:", err);
    return cachedAvailability();
  }
}

export async function saveSettings(settings) {
  if (mode === "preview") {
    if (!writeLocal(KEYS.previewSettings, settings)) throw new Error("This browser blocked saving.");
    return;
  }
  await writeRemote("settings", settings);
  writeLocal(KEYS.cacheSettings, settings);
}

export async function saveAvailability(availability) {
  if (mode === "preview") {
    if (!writeLocal(KEYS.previewAvailability, availability)) throw new Error("This browser blocked saving.");
    return;
  }
  await writeRemote("availability", availability);
  writeLocal(KEYS.cacheAvailability, availability);
}

export function resetPreview() {
  try {
    window.localStorage.removeItem(KEYS.previewSettings);
    window.localStorage.removeItem(KEYS.previewAvailability);
    window.localStorage.removeItem(KEYS.previewRequests);
  } catch {}
}

/* ---------------- Cleaning requests ---------------- */

// Fields a visitor's request may contain (must match firestore.rules).
export const REQUEST_FIELDS = ["name", "contact", "kind", "water", "size", "city", "day", "time", "code", "notes", "via"];
const MAX_LEN = { notes: 1000, contact: 120 };

function cleanRequest(data) {
  const out = {};
  for (const k of REQUEST_FIELDS) {
    out[k] = String(data[k] ?? "").trim().slice(0, MAX_LEN[k] || 80);
  }
  return out;
}

const toMillis = (v) => (v?.toMillis ? v.toMillis() : Number(v) || 0);

export async function submitRequest(data) {
  const req = cleanRequest(data);
  if (mode === "preview") {
    const list = readLocal(KEYS.previewRequests) || [];
    list.unshift({ id: Math.random().toString(36).slice(2, 10), ...req, status: "new", createdAt: Date.now() });
    writeLocal(KEYS.previewRequests, list.slice(0, 200));
    return;
  }
  const { db, fs } = await getDb();
  await fs.addDoc(fs.collection(db, "requests"), { ...req, status: "new", createdAt: fs.serverTimestamp() });
}

// Owner only. Newest first. createdAt/contactedAt/doneAt come back as milliseconds.
export async function listRequests() {
  if (mode === "preview") return readLocal(KEYS.previewRequests) || [];
  const { db, fs } = await getDb();
  const q = fs.query(fs.collection(db, "requests"), fs.orderBy("createdAt", "desc"), fs.limit(200));
  const snap = await fs.getDocs(q);
  return snap.docs.map((d) => {
    const v = d.data();
    return { id: d.id, ...v, createdAt: toMillis(v.createdAt), contactedAt: toMillis(v.contactedAt), doneAt: toMillis(v.doneAt) };
  });
}

// Owner only. patch may contain status, contactedAt, doneAt (millis).
export async function updateRequest(id, patch) {
  if (mode === "preview") {
    const list = readLocal(KEYS.previewRequests) || [];
    const item = list.find((r) => r.id === id);
    if (item) Object.assign(item, patch);
    writeLocal(KEYS.previewRequests, list);
    return;
  }
  const { db, fs } = await getDb();
  const out = { ...patch };
  for (const k of ["contactedAt", "doneAt"]) if (k in out) out[k] = out[k] ? fs.Timestamp.fromMillis(out[k]) : null;
  await fs.updateDoc(fs.doc(db, "requests", id), out);
}

export async function deleteRequest(id) {
  if (mode === "preview") {
    writeLocal(KEYS.previewRequests, (readLocal(KEYS.previewRequests) || []).filter((r) => r.id !== id));
    return;
  }
  const { db, fs } = await getDb();
  await fs.deleteDoc(fs.doc(db, "requests", id));
}

/* ---------------- Owner sign-in (live mode only) ---------------- */

let authPromise = null;
function getAuthKit() {
  authPromise ??= Promise.all([getApp(), import(`${CDN}/firebase-auth.js`)]).then(
    ([app, a]) => ({ auth: a.getAuth(app), a })
  );
  return authPromise;
}

export const isOwnerEmail = (email) =>
  Boolean(email) && OWNER_EMAILS.map((e) => e.toLowerCase()).includes(email.toLowerCase());

export async function watchAuth(callback) {
  const { auth, a } = await getAuthKit();
  return a.onAuthStateChanged(auth, callback);
}

export async function signIn() {
  const { auth, a } = await getAuthKit();
  const provider = new a.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return a.signInWithPopup(auth, provider);
}

export async function signOutOwner() {
  const { auth, a } = await getAuthKit();
  return a.signOut(auth);
}
