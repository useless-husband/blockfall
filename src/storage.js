// Safe localStorage wrapper plus records and settings persistence.
// A storage object only needs getItem/setItem, so tests can pass a fake.

export function safeStorage() {
  try {
    const s = globalThis.localStorage;
    const k = '__blockfall_probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    const mem = new Map();
    return { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  }
}

const RECORDS_KEY = 'blockfall.records.v1';
const SETTINGS_KEY = 'blockfall.settings.v1';

function readJSON(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadRecords(storage) {
  const r = readJSON(storage, RECORDS_KEY);
  return r && typeof r === 'object' ? r : {};
}

/** Is `a` a better result than `b` (null = nothing yet) for this mode? */
export function isBetter(mode, a, b) {
  if (!b) return true;
  if (mode === 'sprint') return a.timeMs < b.timeMs;
  return a.score > b.score;
}

/**
 * Store the result if it beats the saved best.
 * Sprint only counts finished runs. Returns { isNew, best }.
 */
export function submitRecord(storage, mode, result) {
  const records = loadRecords(storage);
  const prev = records[mode] || null;
  if (mode === 'sprint' && result.status !== 'won') return { isNew: false, best: prev };
  if (mode !== 'sprint' && result.score <= 0) return { isNew: false, best: prev };
  const entry = { score: result.score, lines: result.lines, timeMs: result.timeMs };
  if (isBetter(mode, entry, prev)) {
    records[mode] = entry;
    writeJSON(storage, RECORDS_KEY, records);
    return { isNew: true, best: entry };
  }
  return { isNew: false, best: prev };
}

export function loadSettings(storage, defaults) {
  const s = readJSON(storage, SETTINGS_KEY);
  return sanitizeSettings(s, defaults);
}

export function saveSettings(storage, settings) {
  return writeJSON(storage, SETTINGS_KEY, settings);
}

function clampNum(v, lo, hi, dflt) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt;
}

export function sanitizeSettings(s, d) {
  const o = s && typeof s === 'object' ? s : {};
  const out = {
    das: clampNum(o.das, 40, 400, d.das),
    arr: clampNum(o.arr, 0, 100, d.arr),
    softDrop: [0, 5, 10, 20, 40].includes(o.softDrop) ? o.softDrop : d.softDrop,
    allow180: typeof o.allow180 === 'boolean' ? o.allow180 : d.allow180,
    sound: typeof o.sound === 'boolean' ? o.sound : d.sound,
    contrast: typeof o.contrast === 'boolean' ? o.contrast : d.contrast,
    patterns: typeof o.patterns === 'boolean' ? o.patterns : d.patterns,
    ghost: typeof o.ghost === 'boolean' ? o.ghost : d.ghost,
    theme: ['auto', 'light', 'dark'].includes(o.theme) ? o.theme : d.theme,
    keys: sanitizeKeys(o.keys, d.keys),
  };
  return out;
}

function sanitizeKeys(k, d) {
  const out = {};
  for (const action of Object.keys(d)) {
    const v = k && Array.isArray(k[action]) ? k[action].filter((c) => typeof c === 'string' && c.length < 24) : null;
    out[action] = v ? v.slice(0, 3) : d[action].slice();
  }
  return out;
}
