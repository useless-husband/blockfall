import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRecords, submitRecord, isBetter, loadSettings, saveSettings, sanitizeSettings, safeStorage } from '../src/storage.js';
import { DEFAULT_KEYS, actionForKey, rebind, keyLabel, ACTION_LABELS } from '../src/keys.js';
import { DEFAULT_SETTINGS } from '../src/engine.js';

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};
const DEFAULTS = { ...DEFAULT_SETTINGS, sound: true, contrast: false, patterns: true, ghost: true, theme: 'auto', keys: DEFAULT_KEYS };
const res = (o) => ({ mode: 'marathon', status: 'over', score: 0, lines: 0, timeMs: 0, ...o });

test('no records at first', () => {
  assert.deepEqual(loadRecords(mem()), {});
});

test('the first score becomes the best', () => {
  const s = mem();
  const r = submitRecord(s, 'marathon', res({ score: 1200, lines: 8, timeMs: 50000 }));
  assert.equal(r.isNew, true);
  assert.equal(loadRecords(s).marathon.score, 1200);
});

test('a lower score does not replace the best; a higher one does', () => {
  const s = mem();
  submitRecord(s, 'ultra', res({ score: 5000 }));
  assert.equal(submitRecord(s, 'ultra', res({ score: 4000 })).isNew, false);
  assert.equal(loadRecords(s).ultra.score, 5000);
  assert.equal(submitRecord(s, 'ultra', res({ score: 6000 })).isNew, true);
  assert.equal(loadRecords(s).ultra.score, 6000);
});

test('sprint keeps the fastest time', () => {
  const s = mem();
  submitRecord(s, 'sprint', res({ status: 'won', timeMs: 90000, lines: 40 }));
  assert.equal(submitRecord(s, 'sprint', res({ status: 'won', timeMs: 95000, lines: 40 })).isNew, false);
  assert.equal(submitRecord(s, 'sprint', res({ status: 'won', timeMs: 80000, lines: 40 })).isNew, true);
  assert.equal(loadRecords(s).sprint.timeMs, 80000);
});

test('an unfinished sprint is not a record', () => {
  const s = mem();
  assert.equal(submitRecord(s, 'sprint', res({ status: 'over', timeMs: 1000, lines: 12 })).isNew, false);
  assert.deepEqual(loadRecords(s), {});
});

test('zero scores are not saved', () => {
  const s = mem();
  assert.equal(submitRecord(s, 'zen', res({ score: 0 })).isNew, false);
});

test('modes are stored separately', () => {
  const s = mem();
  submitRecord(s, 'zen', res({ score: 300 }));
  submitRecord(s, 'marathon', res({ score: 900 }));
  const r = loadRecords(s);
  assert.equal(r.zen.score, 300);
  assert.equal(r.marathon.score, 900);
});

test('isBetter compares by mode', () => {
  assert.equal(isBetter('sprint', { timeMs: 5 }, { timeMs: 6 }), true);
  assert.equal(isBetter('marathon', { score: 5 }, { score: 6 }), false);
  assert.equal(isBetter('marathon', { score: 5 }, null), true);
});

test('corrupt saved data is ignored', () => {
  const s = mem();
  s.setItem('blockfall.records.v1', '{oops');
  assert.deepEqual(loadRecords(s), {});
  s.setItem('blockfall.settings.v1', '[[[');
  assert.deepEqual(loadSettings(s, DEFAULTS), DEFAULTS);
});

test('a storage that throws does not crash saving', () => {
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.deepEqual(loadRecords(bad), {});
  assert.doesNotThrow(() => submitRecord(bad, 'zen', res({ score: 10 })));
  assert.equal(saveSettings(bad, DEFAULTS), false);
});

test('settings round-trip', () => {
  const s = mem();
  const custom = { ...DEFAULTS, das: 90, arr: 0, softDrop: 40, theme: 'dark', sound: false };
  saveSettings(s, custom);
  assert.deepEqual(loadSettings(s, DEFAULTS), custom);
});

test('settings are clamped and validated', () => {
  const out = sanitizeSettings({ das: 9999, arr: -5, softDrop: 7, theme: 'neon', sound: 'yes', keys: { left: 'x' } }, DEFAULTS);
  assert.equal(out.das, 400);
  assert.equal(out.arr, 0);
  assert.equal(out.softDrop, DEFAULTS.softDrop);
  assert.equal(out.theme, 'auto');
  assert.equal(out.sound, true);
  assert.deepEqual(out.keys.left, ['ArrowLeft']);
});

test('safeStorage always returns something usable', () => {
  const s = safeStorage();
  s.setItem('k', 'v');
  assert.equal(s.getItem('k'), 'v');
});

// ---------- key bindings ----------
test('default keys resolve to actions', () => {
  assert.equal(actionForKey(DEFAULT_KEYS, 'ArrowLeft'), 'left');
  assert.equal(actionForKey(DEFAULT_KEYS, 'Space'), 'hardDrop');
  assert.equal(actionForKey(DEFAULT_KEYS, 'KeyX'), 'rotateCW');
  assert.equal(actionForKey(DEFAULT_KEYS, 'Escape'), 'pause');
  assert.equal(actionForKey(DEFAULT_KEYS, 'KeyQ'), null);
});

test('every action has a label and at least one default key', () => {
  for (const a of Object.keys(DEFAULT_KEYS)) {
    assert.ok(ACTION_LABELS[a]);
    assert.ok(DEFAULT_KEYS[a].length >= 1);
  }
});

test('rebinding moves a key away from its old action', () => {
  const k = rebind(DEFAULT_KEYS, 'hold', 'KeyX');
  assert.deepEqual(k.hold, ['KeyX']);
  assert.ok(!k.rotateCW.includes('KeyX'));
  assert.equal(actionForKey(k, 'KeyX'), 'hold');
  assert.deepEqual(DEFAULT_KEYS.hold, ['KeyC', 'ShiftLeft']); // original untouched
});

test('key labels are readable', () => {
  assert.equal(keyLabel('ArrowUp'), '↑');
  assert.equal(keyLabel('KeyZ'), 'Z');
  assert.equal(keyLabel('Digit5'), '5');
  assert.equal(keyLabel('Space'), '空白鍵');
});
