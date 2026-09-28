// Deterministic game engine. No DOM, no real clock, no Math.random.
// Time only moves when step() is called (one step = 1/60 s).
// Inputs are applied between steps with input(action, down) and are logged,
// so (seed + options + log) reproduces a game exactly.

import { Board, COLS, HIDDEN } from './board.js';
import { SHAPES, kickTests, SPAWN_X, SPAWN_Y } from './pieces.js';
import { Bag } from './rng.js';
import {
  classifyClear, perfectClearBase, comboBonus, applyB2B, gravityPerFrame,
  SOFT_DROP_POINTS, HARD_DROP_POINTS,
} from './scoring.js';

export const STEP_MS = 1000 / 60;
export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;
export const PREVIEW_COUNT = 5;
const EPS = 1e-6;

export const DEFAULT_SETTINGS = {
  das: 150, // ms before auto-repeat starts
  arr: 30, // ms between repeats (0 = instant)
  softDrop: 20, // multiplier of gravity (0 = instant)
  allow180: true,
};

export const MODES = {
  marathon: { name: '馬拉松', goalLines: 150, levelUp: true },
  sprint: { name: '40 行競速', goalLines: 40, levelUp: false },
  ultra: { name: '2 分鐘限時', timeFrames: 7200, levelUp: false },
  zen: { name: '禪模式', levelUp: false, endless: true },
};

export const ACTIONS = ['left', 'right', 'softDrop', 'hardDrop', 'rotateCW', 'rotateCCW', 'rotate180', 'hold'];

export class Game {
  /**
   * opts: { seed, mode, settings, sequence (forced first pieces, mainly for tests) }
   */
  constructor(opts = {}) {
    this.seed = opts.seed ?? 1;
    this.mode = opts.mode ?? 'marathon';
    if (!MODES[this.mode]) throw new Error(`unknown mode: ${this.mode}`);
    this.modeInfo = MODES[this.mode];
    this.settings = { ...DEFAULT_SETTINGS, ...(opts.settings || {}) };
    this.bag = new Bag(this.seed);
    this.forced = (opts.sequence || []).slice();

    this.board = new Board();
    this.frame = 0;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.status = 'playing'; // 'playing' | 'won' | 'over'
    this.reason = null; // 'goal' | 'time' | 'block out' | 'lock out' | 'quit'
    this.finishFrame = null;

    this.queue = [];
    this.hold = null;
    this.holdUsed = false;

    this.combo = -1;
    this.b2b = false;
    this.pieces = 0;
    this.perfectClears = 0;

    this.held = { left: false, right: false };
    this.softHeld = false;
    this.dasDir = 0;
    this.dasTime = 0;
    this.dasCharged = false;
    this.arrAcc = 0;
    this.gravAcc = 0;

    this.log = [];
    this.events = [];
    this.lastClear = null;
    this.piece = null;

    this._fillQueue();
    this._spawn(this._nextType());
  }

  get timeMs() {
    return this.frame * STEP_MS;
  }

  get finished() {
    return this.status !== 'playing';
  }

  // ---------- input ----------

  input(action, down = true) {
    if (this.status !== 'playing') return;
    this.log.push([this.frame, action, down ? 1 : 0]);
    this._apply(action, down);
  }

  _apply(action, down) {
    switch (action) {
      case 'left':
      case 'right': {
        const dir = action === 'left' ? -1 : 1;
        if (down) {
          if (this.held[action]) return;
          this.held[action] = true;
          this.dasDir = dir;
          this.dasTime = 0;
          this.dasCharged = false;
          this.arrAcc = 0;
          this._move(dir);
        } else {
          this.held[action] = false;
          if (this.dasDir === dir) {
            const other = dir === -1 ? 'right' : 'left';
            if (this.held[other]) {
              this.dasDir = -dir;
              this.arrAcc = 0;
            } else {
              this.dasDir = 0;
              this.dasTime = 0;
              this.dasCharged = false;
            }
          }
        }
        break;
      }
      case 'softDrop':
        this.softHeld = down;
        break;
      case 'hardDrop':
        if (down) this.hardDrop();
        break;
      case 'rotateCW':
        if (down) this.rotate(1);
        break;
      case 'rotateCCW':
        if (down) this.rotate(3);
        break;
      case 'rotate180':
        if (down) this.rotate(2);
        break;
      case 'hold':
        if (down) this.holdPiece();
        break;
      default:
        break;
    }
  }

  /** Release every held key (used when pausing or losing focus). */
  releaseAll() {
    for (const a of ['left', 'right', 'softDrop']) {
      const isDown = a === 'softDrop' ? this.softHeld : this.held[a];
      if (isDown) this.input(a, false);
    }
  }

  // ---------- time ----------

  step() {
    if (this.status !== 'playing') return;
    this.frame++;
    this._stepDas();
    if (this.status !== 'playing') return;
    this._stepGravity();
    this._stepLock();
    if (this.status !== 'playing') return;
    if (this.modeInfo.timeFrames && this.frame >= this.modeInfo.timeFrames) {
      this._finish('won', 'time');
    }
  }

  _stepDas() {
    if (!this.dasDir) return;
    this.dasTime += STEP_MS;
    const { das, arr } = this.settings;
    if (this.dasTime + EPS < das) return;
    if (!this.dasCharged) {
      this.dasCharged = true;
      this.arrAcc = arr;
    } else {
      this.arrAcc += STEP_MS;
    }
    if (arr <= 0) {
      while (this._move(this.dasDir)) { /* slide to the wall */ }
      this.arrAcc = 0;
      return;
    }
    while (this.arrAcc + EPS >= arr) {
      this.arrAcc -= arr;
      if (!this._move(this.dasDir)) {
        this.arrAcc = 0;
        break;
      }
    }
  }

  _stepGravity() {
    if (!this.piece) return;
    const g = gravityPerFrame(this.level);
    if (this.softHeld) {
      const f = this.settings.softDrop;
      if (f <= 0) {
        while (this._tryDown()) this.score += SOFT_DROP_POINTS;
        this.gravAcc = 0;
        return;
      }
      this.gravAcc += Math.max(g * f, g);
    } else {
      this.gravAcc += g;
    }
    let guard = 0;
    while (this.gravAcc >= 1 - EPS && guard++ < 60) {
      this.gravAcc -= 1;
      if (this._tryDown()) {
        if (this.softHeld) this.score += SOFT_DROP_POINTS;
      } else {
        this.gravAcc = 0;
        break;
      }
    }
  }

  _stepLock() {
    if (!this.piece) return;
    if (this._onGround()) {
      this.lockTimer += STEP_MS;
      if (this.lockTimer + EPS >= LOCK_DELAY_MS) this._lock();
    } else {
      this.lockTimer = 0;
    }
  }

  // ---------- piece helpers ----------

  get cells() {
    return SHAPES[this.piece.type][this.piece.rot];
  }

  _fits(rot, x, y) {
    return !this.board.collides(SHAPES[this.piece.type][rot], x, y);
  }

  _onGround() {
    return !this._fits(this.piece.rot, this.piece.x, this.piece.y + 1);
  }

  ghostY() {
    let y = this.piece.y;
    while (this._fits(this.piece.rot, this.piece.x, y + 1)) y++;
    return y;
  }

  /** World coordinates of the current piece. */
  pieceCells(rot = this.piece.rot, x = this.piece.x, y = this.piece.y) {
    return SHAPES[this.piece.type][rot].map(([cx, cy]) => [x + cx, y + cy]);
  }

  _move(dir) {
    const p = this.piece;
    if (!p || !this._fits(p.rot, p.x + dir, p.y)) return false;
    p.x += dir;
    this.rotated = false;
    this._resetLock();
    this.events.push({ type: 'move' });
    return true;
  }

  _tryDown() {
    const p = this.piece;
    if (!this._fits(p.rot, p.x, p.y + 1)) return false;
    p.y++;
    this.rotated = false;
    if (p.y > this.lowestY) {
      this.lowestY = p.y;
      this.lockResets = 0;
      this.lockTimer = 0;
    }
    return true;
  }

  // Called after a successful sideways move or rotation.
  _resetLock() {
    if (this._onGround() && this.lockResets < MAX_LOCK_RESETS) {
      this.lockResets++;
      this.lockTimer = 0;
    }
  }

  rotate(dir) {
    const p = this.piece;
    if (!p || this.status !== 'playing') return false;
    if (dir === 2 && !this.settings.allow180) return false;
    const to = (p.rot + dir) % 4;
    const tests = kickTests(p.type, p.rot, to, dir === 2);
    for (let i = 0; i < tests.length; i++) {
      const [dx, dy] = tests[i];
      if (this._fits(to, p.x + dx, p.y + dy)) {
        p.rot = to;
        p.x += dx;
        p.y += dy;
        this.rotated = true;
        this.kickIndex = i;
        this._resetLock();
        this.events.push({ type: 'rotate' });
        return true;
      }
    }
    return false;
  }

  hardDrop() {
    const p = this.piece;
    if (!p || this.status !== 'playing') return 0;
    const y = this.ghostY();
    const dist = y - p.y;
    if (dist > 0) {
      p.y = y;
      this.rotated = false;
      this.score += dist * HARD_DROP_POINTS;
    }
    this.events.push({ type: 'hardDrop', dist });
    this._lock();
    return dist;
  }

  holdPiece() {
    if (!this.piece || this.holdUsed || this.status !== 'playing') return false;
    this.holdUsed = true;
    const cur = this.piece.type;
    const incoming = this.hold;
    this.hold = cur;
    this.events.push({ type: 'hold' });
    this._spawn(incoming || this._nextType());
    return true;
  }

  // ---------- spawn / queue ----------

  _fillQueue() {
    while (this.queue.length < PREVIEW_COUNT + 7) {
      this.queue.push(this.forced.length ? this.forced.shift() : this.bag.next());
    }
  }

  _nextType() {
    const t = this.queue.shift();
    this._fillQueue();
    return t;
  }

  get preview() {
    return this.queue.slice(0, PREVIEW_COUNT);
  }

  _spawn(type) {
    this.piece = { type, rot: 0, x: SPAWN_X, y: SPAWN_Y };
    this.gravAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = this.piece.y;
    this.rotated = false;
    this.kickIndex = -1;
    if (!this._fits(0, this.piece.x, this.piece.y)) {
      if (this.mode === 'zen') {
        this.board.clear();
        this.events.push({ type: 'zenReset' });
      } else {
        this._finish('over', 'block out');
      }
    }
  }

  /** Test/debug helper: replace the current piece. */
  setPiece(type, x, y, rot = 0) {
    this.piece = { type, rot, x, y };
    this.gravAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = y;
    this.rotated = false;
    this.kickIndex = -1;
  }

  // ---------- locking and scoring ----------

  _detectTSpin() {
    const p = this.piece;
    if (p.type !== 'T' || !this.rotated) return null;
    const { x, y, rot } = p;
    const occ = (cx, cy) => !this.board.isFree(cx, cy);
    const corners = { tl: occ(x, y), tr: occ(x + 2, y), bl: occ(x, y + 2), br: occ(x + 2, y + 2) };
    const count = Object.values(corners).filter(Boolean).length;
    if (count < 3) return null;
    const front = [
      ['tl', 'tr'], // pointing up
      ['tr', 'br'], // pointing right
      ['bl', 'br'], // pointing down
      ['tl', 'bl'], // pointing left
    ][rot];
    const frontBoth = corners[front[0]] && corners[front[1]];
    if (frontBoth || this.kickIndex === 4) return 'full';
    return 'mini';
  }

  _lock() {
    const p = this.piece;
    const cells = this.pieceCells();
    const tspin = this._detectTSpin();
    const lockOut = cells.every(([, cy]) => cy < HIDDEN);
    this.board.place(SHAPES[p.type][p.rot], p.x, p.y, p.type);
    this.pieces++;
    this.events.push({ type: 'lock' });

    const lines = this.board.clearLines();
    const level = this.level;
    let gained = 0;
    let b2bApplied = false;
    let label = '';
    let pc = false;

    if (lines > 0 || tspin) {
      const c = classifyClear(lines, tspin);
      label = c.label;
      let base = c.base;
      if (lines > 0) {
        if (c.difficult) {
          if (this.b2b) {
            base = applyB2B(base);
            b2bApplied = true;
          }
          this.b2b = true;
        } else {
          this.b2b = false;
        }
      }
      gained += base * level;
    }

    if (lines > 0) {
      this.combo++;
      gained += comboBonus(this.combo, level);
      if (this.board.isEmpty()) {
        pc = true;
        this.perfectClears++;
        gained += perfectClearBase(lines, b2bApplied) * level;
      }
      this.lines += lines;
      if (this.modeInfo.levelUp) {
        const nl = Math.min(15, 1 + Math.floor(this.lines / 10));
        if (nl > this.level) {
          this.level = nl;
          this.events.push({ type: 'levelUp', level: nl });
        }
      }
    } else {
      this.combo = -1;
    }
    this.score += gained;

    if (label || pc) {
      this.lastClear = {
        frame: this.frame, lines, label, tspin, b2b: b2bApplied,
        combo: lines > 0 ? this.combo : 0, pc, points: gained,
      };
      this.events.push({ type: 'clear', ...this.lastClear });
    }

    this.holdUsed = false;
    this.piece = null;

    if (this.modeInfo.goalLines && this.lines >= this.modeInfo.goalLines) {
      this._finish('won', 'goal');
      return;
    }
    if (lockOut && lines === 0) {
      if (this.mode === 'zen') {
        this.board.clear();
        this.events.push({ type: 'zenReset' });
      } else {
        this._finish('over', 'lock out');
        return;
      }
    }
    this._spawn(this._nextType());
  }

  _finish(status, reason) {
    this.status = status;
    this.reason = reason;
    this.finishFrame = this.frame;
    this.events.push({ type: status === 'won' ? 'win' : 'gameOver', reason });
  }

  /** Player ends the run (used for zen mode). */
  quit() {
    if (this.status === 'playing') this._finish('over', 'quit');
  }

  // ---------- results ----------

  result() {
    return {
      mode: this.mode,
      status: this.status,
      reason: this.reason,
      score: this.score,
      lines: this.lines,
      level: this.level,
      pieces: this.pieces,
      frames: this.frame,
      timeMs: Math.round(this.frame * STEP_MS),
    };
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Stable fingerprint of the full visible state (for determinism checks). */
  stateHash() {
    const s = JSON.stringify([
      this.board.toStrings(), this.score, this.lines, this.level, this.frame, this.status,
      this.hold, this.queue, this.piece, this.combo, this.b2b, this.pieces,
    ]);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }
}

export { COLS };
