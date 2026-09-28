// Browser glue: input, rendering, menus, sound, persistence.
// All game rules live in engine.js; this file only feeds it inputs and draws it.
import { Game, MODES, DEFAULT_SETTINGS, MAX_LOCK_RESETS } from './engine.js';
import { FixedLoop } from './loop.js';
import { makeReplay, ReplayPlayer, validateReplay } from './replay.js';
import { safeStorage, loadRecords, submitRecord, loadSettings, saveSettings } from './storage.js';
import { DEFAULT_KEYS, ACTION_LABELS, actionForKey, rebind, keyLabel } from './keys.js';
import { readTheme, fitCanvas, drawBoard, drawHold, drawNext, SHOWN_ROWS } from './render.js';
import { COLS } from './board.js';
import { Sfx } from './audio.js';
import { TouchControls } from './touch.js';

const $ = (id) => document.getElementById(id);
const storage = safeStorage();
const LAST_REPLAY_KEY = 'blockfall.lastReplay.v1';
const LAST_MODE_KEY = 'blockfall.mode.v1';

const DEFAULTS = {
  ...DEFAULT_SETTINGS,
  sound: true,
  contrast: false,
  patterns: true,
  ghost: true,
  theme: 'auto',
  keys: DEFAULT_KEYS,
};
let settings = loadSettings(storage, DEFAULTS);

const MODE_TEXT = {
  marathon: '等級隨消行上升，消 150 行過關',
  sprint: '盡快消 40 行，比誰的時間短',
  ultra: '2 分鐘內拿到最高分',
  zen: '不會輸，慢慢玩，想結束再結束',
};
const MODE_ORDER = ['marathon', 'sprint', 'ultra', 'zen'];

const sfx = new Sfx();
sfx.enabled = settings.sound;

// ---------- state ----------
let state = 'menu'; // menu | playing | paused | over | replay
let mode = (() => {
  try {
    const m = storage.getItem(LAST_MODE_KEY);
    return MODES[m] ? m : 'marathon';
  } catch { return 'marathon'; }
})();
let game = null; // live game
let player = null; // replay player
let replayPaused = false;
let replaySpeed = 1;
let lastReplay = null;
let lastResult = null;
let theme = null;
let cell = 28;
let pc = 18;
let bannerUntil = 0;
let capturing = null; // action being rebound

try {
  const raw = storage.getItem(LAST_REPLAY_KEY);
  if (raw) lastReplay = validateReplay(JSON.parse(raw));
} catch { lastReplay = null; }

const els = {
  board: $('c-board'), hold: $('c-hold'), next: $('c-next'),
  overlay: $('overlay'), banner: $('banner'), badge: $('badge'),
};
let ctxBoard; let ctxHold; let ctxNext;

// ---------- loop ----------
let stepFn = () => {};
const loop = new FixedLoop(() => stepFn());

function viewGame() {
  if (state === 'replay' && player) return player.game;
  return game;
}

let lastT = performance.now();
function frame(now) {
  const dt = now - lastT;
  lastT = now;
  if (state === 'playing') {
    stepFn = () => game.step();
    loop.advance(dt);
    consumeEvents(game);
    if (game.finished) finishGame();
  } else if (state === 'replay' && !replayPaused) {
    stepFn = () => player.stepFrame();
    loop.advance(dt, replaySpeed);
    consumeEvents(player.game);
    if (player.done) endReplay(true);
  }
  render(now);
  requestAnimationFrame(frame);
}

// ---------- events -> sound and text ----------
function consumeEvents(g) {
  for (const e of g.drainEvents()) {
    switch (e.type) {
      case 'move': sfx.play('move'); break;
      case 'rotate': sfx.play('rotate'); break;
      case 'hold': sfx.play('hold'); break;
      case 'hardDrop': sfx.play('hardDrop'); break;
      case 'lock': sfx.play('lock'); break;
      case 'levelUp': sfx.play('levelUp'); showBanner([`等級 ${e.level}`]); break;
      case 'clear': onClear(e); break;
      case 'gameOver': sfx.play('gameOver'); break;
      case 'win': sfx.play('win'); break;
      default: break;
    }
  }
}

function onClear(e) {
  const lines = [];
  if (e.label) lines.push(e.label);
  if (e.b2b) lines.push('Back-to-Back');
  if (e.combo >= 1) lines.push(`${e.combo} Combo`);
  if (e.pc) lines.push('Perfect Clear');
  lines.push({ pts: `+${e.points.toLocaleString('en-US')}` });
  showBanner(lines);
  if (e.pc) sfx.play('pc');
  else if (e.tspin) sfx.play('tspin');
  else sfx.play('clear', e.lines);
}

function showBanner(lines) {
  const b = els.banner;
  b.replaceChildren();
  for (const l of lines) {
    const s = document.createElement('span');
    if (typeof l === 'string') s.textContent = l;
    else { s.textContent = l.pts; s.className = 'pts'; }
    b.append(s);
  }
  b.classList.add('show');
  bannerUntil = performance.now() + 1500;
}

// ---------- layout and drawing ----------
function layout() {
  const narrow = window.innerWidth < 720;
  const dpr = window.devicePixelRatio || 1;
  void dpr;
  if (narrow) {
    const availW = window.innerWidth - 24 - 16 - 16;
    const byW = Math.floor(availW / (10 + 8 * 0.55));
    const byH = Math.floor((window.innerHeight - 250) / SHOWN_ROWS);
    cell = Math.max(14, Math.min(30, byW, byH));
    pc = Math.max(8, Math.floor(cell * 0.55));
  } else {
    const byH = Math.floor((window.innerHeight - 110) / SHOWN_ROWS);
    cell = Math.max(18, Math.min(34, byH));
    pc = Math.max(12, Math.floor(cell * 0.62));
  }
  ctxBoard = fitCanvas(els.board, COLS * cell, SHOWN_ROWS * cell);
  ctxHold = fitCanvas(els.hold, 4 * pc, 3 * pc);
  ctxNext = fitCanvas(els.next, 4 * pc, 15 * pc);
}

function applyAppearance() {
  const root = document.documentElement;
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  if (settings.contrast) root.dataset.contrast = 'high';
  else delete root.dataset.contrast;
  theme = readTheme();
  sfx.enabled = settings.sound;
  const sb = $('btn-sound');
  sb.textContent = settings.sound ? '音效：開' : '音效：關';
  sb.setAttribute('aria-pressed', String(settings.sound));
  renderKeysHelp();
}

const shown = {};
function setText(id, text) {
  if (shown[id] === text) return;
  shown[id] = text;
  $(id).textContent = text;
}

export function fmtTime(ms) {
  const total = Math.max(0, Math.floor(ms / 10));
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function bestText(m, recs) {
  const r = recs[m];
  if (!r) return '—';
  return m === 'sprint' ? fmtTime(r.timeMs) : `${r.score.toLocaleString('en-US')} 分`;
}

function render(now) {
  const g = viewGame();
  drawBoard(ctxBoard, g, theme, cell, { ghost: settings.ghost, patterns: settings.patterns });
  drawHold(ctxHold, g, theme, pc, settings.patterns);
  drawNext(ctxNext, g, theme, pc, settings.patterns);

  if (bannerUntil && now > bannerUntil) {
    els.banner.classList.remove('show');
    bannerUntil = 0;
  }

  const m = g ? g.mode : mode;
  setText('st-score', g ? g.score.toLocaleString('en-US') : '0');
  setText('st-lines', g ? String(g.lines) : '0');
  setText('st-level', g ? String(g.level) : '1');
  if (g && MODES[m].timeFrames) {
    setText('st-time-label', '剩餘');
    setText('st-time', fmtTime(Math.max(0, (MODES[m].timeFrames - g.frame) * (1000 / 60))));
  } else {
    setText('st-time-label', '時間');
    setText('st-time', fmtTime(g ? g.timeMs : 0));
  }
  let goal = '—';
  if (MODES[m].goalLines) goal = `${g ? g.lines : 0} / ${MODES[m].goalLines} 行`;
  else if (MODES[m].timeFrames) goal = '2 分鐘';
  else goal = '無限制';
  setText('in-goal', goal);
  setText('in-combo', g && g.combo >= 1 ? String(g.combo) : '—');
  setText('in-b2b', g && g.b2b ? '進行中' : '—');
  setText('in-best', bestText(m, loadRecordsCached()));

  if (state === 'replay') {
    setText('rp-progress', `${Math.round(player.progress * 100)}%`);
  }
}

let recCache = null;
function loadRecordsCached() {
  if (!recCache) recCache = loadRecords(storage);
  return recCache;
}
function invalidateRecords() { recCache = null; }

// ---------- overlay / screens ----------
function showOverlay(which) {
  els.overlay.classList.toggle('gone', which === null);
  for (const id of ['ov-menu', 'ov-pause', 'ov-result']) $(id).hidden = id !== which;
}

function buildModeList() {
  const recs = loadRecordsCached();
  const list = $('mode-list');
  list.replaceChildren();
  for (const m of MODE_ORDER) {
    const label = document.createElement('label');
    label.className = 'mode';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'mode';
    input.value = m;
    input.checked = m === mode;
    input.addEventListener('change', () => {
      mode = m;
      try { storage.setItem(LAST_MODE_KEY, m); } catch { /* ignore */ }
    });
    const name = document.createElement('b');
    name.textContent = MODES[m].name;
    const best = document.createElement('span');
    best.className = 'best';
    best.textContent = bestText(m, recs);
    const small = document.createElement('small');
    small.textContent = MODE_TEXT[m];
    label.append(input, name, best, small);
    list.append(label);
  }
}

function goMenu() {
  state = 'menu';
  game = null;
  player = null;
  $('replaybar').hidden = true;
  els.badge.hidden = true;
  invalidateRecords();
  buildModeList();
  $('btn-replay-last').disabled = !lastReplay;
  showOverlay('ov-menu');
  $('btn-pause').disabled = true;
  els.banner.classList.remove('show');
}

function newSeed() {
  const a = new Uint32Array(1);
  (globalThis.crypto || { getRandomValues: (x) => { x[0] = Math.floor(Math.random() * 2 ** 32); return x; } }).getRandomValues(a);
  return a[0];
}

function startGame(m = mode) {
  mode = m;
  sfx.unlock();
  game = new Game({
    seed: newSeed(),
    mode,
    settings: { das: settings.das, arr: settings.arr, softDrop: settings.softDrop, allow180: settings.allow180 },
  });
  state = 'playing';
  loop.reset();
  showOverlay(null);
  $('replaybar').hidden = true;
  els.badge.hidden = true;
  $('btn-pause').disabled = false;
  els.banner.classList.remove('show');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

function finishGame() {
  state = 'over';
  lastResult = game.result();
  lastReplay = makeReplay(game);
  try { storage.setItem(LAST_REPLAY_KEY, JSON.stringify(lastReplay)); } catch { /* too big or blocked */ }
  const rec = submitRecord(storage, game.mode, lastResult);
  invalidateRecords();
  showResult(lastResult, rec.isNew);
  $('btn-pause').disabled = true;
}

function showResult(r, isNew) {
  const won = r.status === 'won';
  $('res-title').textContent = won ? (r.mode === 'ultra' ? '時間到' : '完成') : (r.reason === 'quit' ? '本局結束' : '遊戲結束');
  const rec = $('res-record');
  rec.hidden = !isNew;
  rec.textContent = '新紀錄';
  const rows = [['模式', MODES[r.mode].name], ['分數', r.score.toLocaleString('en-US')], ['行數', String(r.lines)],
    ['等級', String(r.level)], ['方塊數', String(r.pieces)], ['時間', fmtTime(r.timeMs)]];
  const list = $('res-list');
  list.replaceChildren();
  for (const [k, v] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    list.append(dt, dd);
  }
  showOverlay('ov-result');
}

function pauseGame() {
  if (state !== 'playing') return;
  game.releaseAll();
  state = 'paused';
  showOverlay('ov-pause');
  $('btn-quit').textContent = mode === 'zen' ? '結束並看結果' : '結束本局';
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  loop.reset();
  lastT = performance.now();
  showOverlay(null);
}

function quitGame() {
  if (state !== 'paused' && state !== 'playing') return;
  if (mode === 'zen' && game.score > 0) {
    game.quit();
    finishGame();
  } else {
    goMenu();
  }
}

// ---------- replay ----------
function startReplay(r) {
  try {
    player = new ReplayPlayer(r);
  } catch {
    alert('這個重播檔無法使用。');
    return;
  }
  sfx.unlock();
  state = 'replay';
  replayPaused = false;
  replaySpeed = 1;
  loop.reset();
  showOverlay(null);
  $('replaybar').hidden = false;
  els.badge.hidden = false;
  els.badge.textContent = '重播';
  $('rp-toggle').textContent = '暫停';
  setSpeedButtons();
  $('btn-pause').disabled = true;
  els.banner.classList.remove('show');
}

function setSpeedButtons() {
  for (const b of document.querySelectorAll('#replaybar [data-speed]')) {
    b.classList.toggle('on', Number(b.dataset.speed) === replaySpeed);
  }
}

function endReplay(finished) {
  if (finished) {
    replayPaused = true;
    $('rp-toggle').textContent = '重新播放';
    els.badge.textContent = '重播結束';
  } else {
    goMenu();
  }
}

// ---------- keyboard ----------
function isGameKey(e) {
  return !$('settings').open && capturing === null && !(e.target instanceof HTMLInputElement && e.target.type !== 'checkbox' && e.target.type !== 'radio') && !(e.target instanceof HTMLSelectElement);
}

window.addEventListener('keydown', (e) => {
  if (capturing !== null) {
    e.preventDefault();
    finishCapture(e.code);
    return;
  }
  if ($('settings').open) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const action = actionForKey(settings.keys, e.code);
  if (state === 'menu' || state === 'over') {
    if (e.code === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      if (state === 'menu') startGame(mode);
      else startGame(game ? game.mode : mode);
    }
    return;
  }
  if (!action || !isGameKey(e)) return;
  if (action === 'pause') {
    e.preventDefault();
    if (e.repeat) return;
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
    else if (state === 'replay') toggleReplayPause();
    return;
  }
  e.preventDefault();
  if (state === 'playing' && !e.repeat) {
    sfx.unlock();
    game.input(action, true);
  }
});

window.addEventListener('keyup', (e) => {
  if (capturing !== null) return;
  const action = actionForKey(settings.keys, e.code);
  if (!action || action === 'pause') return;
  if (state === 'playing') {
    if (isGameKey(e) || action === 'left' || action === 'right' || action === 'softDrop') game.input(action, false);
    if (e.code === 'Space') e.preventDefault();
  }
});

function autoPause() {
  if (state === 'playing') pauseGame();
  else if (state === 'replay' && !replayPaused) toggleReplayPause();
}
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });

function toggleReplayPause() {
  if (player.done) {
    player.reset();
    replayPaused = false;
    els.badge.textContent = '重播';
    loop.reset();
  } else {
    replayPaused = !replayPaused;
  }
  $('rp-toggle').textContent = replayPaused ? '播放' : '暫停';
  if (!replayPaused) lastT = performance.now();
}

// ---------- touch ----------
const touch = new TouchControls($('game'), {
  cellSize: () => cell,
  isActive: () => state === 'playing',
  onAction: (a, down) => {
    if (state !== 'playing') return;
    sfx.unlock();
    game.input(a, down);
  },
});
void touch;

for (const b of document.querySelectorAll('#touchbar [data-act]')) {
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const a = b.dataset.act;
    if (a === 'pause') {
      if (state === 'playing') pauseGame();
      else if (state === 'paused') resumeGame();
      return;
    }
    if (state === 'playing') {
      sfx.unlock();
      game.input(a, true);
      game.input(a, false);
    }
  });
}

// ---------- buttons ----------
$('btn-start').addEventListener('click', () => startGame(mode));
$('btn-pause').addEventListener('click', () => { if (state === 'playing') pauseGame(); else if (state === 'paused') resumeGame(); });
$('btn-resume').addEventListener('click', resumeGame);
$('btn-restart').addEventListener('click', () => startGame(mode));
$('btn-quit').addEventListener('click', quitGame);
$('btn-again').addEventListener('click', () => startGame(lastResult ? lastResult.mode : mode));
$('btn-menu').addEventListener('click', goMenu);
$('btn-watch').addEventListener('click', () => { if (lastReplay) startReplay(lastReplay); });
$('btn-replay-last').addEventListener('click', () => { if (lastReplay) startReplay(lastReplay); });
$('rp-toggle').addEventListener('click', toggleReplayPause);
$('rp-exit').addEventListener('click', () => endReplay(false));
for (const b of document.querySelectorAll('#replaybar [data-speed]')) {
  b.addEventListener('click', () => { replaySpeed = Number(b.dataset.speed); setSpeedButtons(); });
}

$('btn-sound').addEventListener('click', () => {
  settings.sound = !settings.sound;
  sfx.unlock();
  saveSettings(storage, settings);
  applyAppearance();
});

$('btn-export').addEventListener('click', () => {
  if (!lastReplay) return;
  const blob = new Blob([JSON.stringify(lastReplay)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `blockfall-${lastReplay.mode}-${lastReplay.seed}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('btn-import').addEventListener('click', () => $('file-import').click());
$('file-import').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const r = validateReplay(JSON.parse(await f.text()));
    lastReplay = r;
    startReplay(r);
  } catch {
    alert('這個檔案不是有效的 Blockfall 重播檔。');
  }
});

// ---------- settings ----------
const dlg = $('settings');
function openSettings() {
  if (state === 'playing') pauseGame();
  syncSettingsUI();
  if (!dlg.open) dlg.showModal();
}
$('btn-settings').addEventListener('click', openSettings);
dlg.addEventListener('close', () => { capturing = null; saveSettings(storage, settings); });

function syncSettingsUI() {
  $('set-das').value = settings.das;
  $('out-das').textContent = `${settings.das} ms`;
  $('set-arr').value = settings.arr;
  $('out-arr').textContent = `${settings.arr} ms`;
  $('set-soft').value = String(settings.softDrop);
  $('set-180').checked = settings.allow180;
  $('set-theme').value = settings.theme;
  $('set-contrast').checked = settings.contrast;
  $('set-patterns').checked = settings.patterns;
  $('set-ghost').checked = settings.ghost;
  $('set-sound').checked = settings.sound;
  buildKeyTable();
}

function bindSetting(id, key, read) {
  $(id).addEventListener('input', (e) => {
    settings[key] = read(e.target);
    saveSettings(storage, settings);
    syncSettingsUI();
    applyAppearance();
  });
}
bindSetting('set-das', 'das', (el) => Number(el.value));
bindSetting('set-arr', 'arr', (el) => Number(el.value));
bindSetting('set-soft', 'softDrop', (el) => Number(el.value));
bindSetting('set-180', 'allow180', (el) => el.checked);
bindSetting('set-theme', 'theme', (el) => el.value);
bindSetting('set-contrast', 'contrast', (el) => el.checked);
bindSetting('set-patterns', 'patterns', (el) => el.checked);
bindSetting('set-ghost', 'ghost', (el) => el.checked);
bindSetting('set-sound', 'sound', (el) => el.checked);

function buildKeyTable() {
  const t = $('key-table');
  t.replaceChildren();
  for (const action of Object.keys(DEFAULT_KEYS)) {
    const label = document.createElement('span');
    label.textContent = ACTION_LABELS[action];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = capturing === action ? '請按新按鍵…' : (settings.keys[action].map(keyLabel).join(' / ') || '（未設定）');
    btn.classList.toggle('capturing', capturing === action);
    btn.addEventListener('click', () => { capturing = action; buildKeyTable(); });
    t.append(label, btn);
  }
}

function finishCapture(code) {
  const action = capturing;
  capturing = null;
  if (code !== 'Escape') {
    settings.keys = rebind(settings.keys, action, code);
    saveSettings(storage, settings);
  }
  buildKeyTable();
  renderKeysHelp();
}

$('keys-reset').addEventListener('click', () => {
  settings.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS));
  saveSettings(storage, settings);
  buildKeyTable();
  renderKeysHelp();
});

function renderKeysHelp() {
  const ul = $('keys-help');
  ul.replaceChildren();
  for (const action of Object.keys(DEFAULT_KEYS)) {
    const li = document.createElement('li');
    const s = document.createElement('span');
    s.textContent = ACTION_LABELS[action];
    const k = document.createElement('kbd');
    k.textContent = settings.keys[action].map(keyLabel).join(' ');
    li.append(s, k);
    ul.append(li);
  }
}

// ---------- boot ----------
window.addEventListener('resize', () => { layout(); theme = readTheme(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyAppearance);
layout();
applyAppearance();
goMenu();
requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(frame); });

// Small hook so tests and screenshots can drive the page without keyboard tricks.
window.__blockfall = {
  get game() { return game; },
  get state() { return state; },
  start: startGame,
  pause: pauseGame,
  MAX_LOCK_RESETS,
};
