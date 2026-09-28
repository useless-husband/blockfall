// Replays: seed + options + input log reproduce a whole game.
import { Game, ACTIONS } from './engine.js';

export const REPLAY_VERSION = 1;

export function makeReplay(game) {
  return {
    v: REPLAY_VERSION,
    seed: game.seed,
    mode: game.mode,
    settings: { ...game.settings },
    events: game.log.map((e) => e.slice()),
    frames: game.frame,
    result: game.result(),
    hash: game.stateHash(),
  };
}

/** Throws if the object is not a usable replay. */
export function validateReplay(r) {
  if (!r || typeof r !== 'object') throw new Error('not a replay');
  if (r.v !== REPLAY_VERSION) throw new Error('unsupported replay version');
  if (!Number.isInteger(r.seed)) throw new Error('bad seed');
  if (typeof r.mode !== 'string') throw new Error('bad mode');
  if (!Number.isInteger(r.frames) || r.frames < 0 || r.frames > 10_000_000) throw new Error('bad frame count');
  if (!Array.isArray(r.events)) throw new Error('bad events');
  let last = 0;
  for (const e of r.events) {
    if (!Array.isArray(e) || e.length !== 3) throw new Error('bad event');
    const [f, a, d] = e;
    if (!Number.isInteger(f) || f < last || f > r.frames) throw new Error('bad event frame');
    if (!ACTIONS.includes(a)) throw new Error('bad action');
    if (d !== 0 && d !== 1) throw new Error('bad event state');
    last = f;
  }
  return r;
}

/** Steps a game from a replay one frame at a time. */
export class ReplayPlayer {
  constructor(replay) {
    validateReplay(replay);
    this.replay = replay;
    this.reset();
  }

  reset() {
    const r = this.replay;
    this.game = new Game({ seed: r.seed, mode: r.mode, settings: r.settings });
    this.index = 0;
    this.ended = false;
  }

  get done() {
    return this.ended;
  }

  get progress() {
    return this.replay.frames ? Math.min(1, this.game.frame / this.replay.frames) : 1;
  }

  _applyDue() {
    const ev = this.replay.events;
    while (this.index < ev.length && ev[this.index][0] <= this.game.frame) {
      const [, a, d] = ev[this.index++];
      this.game.input(a, d === 1);
    }
  }

  /** Advance exactly one logic step. Returns false once the replay is over. */
  stepFrame() {
    if (this.ended) return false;
    this._applyDue();
    if (this.game.finished || this.game.frame >= this.replay.frames) {
      if (this.replay.result && this.replay.result.reason === 'quit') this.game.quit();
      this.ended = true;
      return false;
    }
    this.game.step();
    return true;
  }

  /** Run until the end, then apply any trailing events at the final frame. */
  runToEnd() {
    while (this.stepFrame()) { /* keep going */ }
    return this.game;
  }
}

export function playReplay(replay) {
  return new ReplayPlayer(replay).runToEnd();
}

/** Did the replay reproduce the recorded outcome exactly? */
export function verifyReplay(replay) {
  const g = playReplay(replay);
  return g.stateHash() === replay.hash;
}
