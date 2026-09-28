import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, ACTIONS } from '../src/engine.js';
import { mulberry32 } from '../src/rng.js';
import { makeReplay, ReplayPlayer, playReplay, verifyReplay, validateReplay } from '../src/replay.js';

/** Plays a game with pseudo-random inputs; the "player" has its own seeded RNG. */
function autoplay(opts, inputSeed, frames) {
  const rand = mulberry32(inputSeed);
  const g = new Game(opts);
  for (let f = 0; f < frames && g.status === 'playing'; f++) {
    const n = rand() < 0.35 ? 1 + Math.floor(rand() * 2) : 0;
    for (let i = 0; i < n; i++) {
      const a = ACTIONS[Math.floor(rand() * ACTIONS.length)];
      g.input(a, rand() < 0.6);
    }
    g.step();
  }
  return g;
}

const CASES = [
  [{ seed: 1, mode: 'marathon' }, 11],
  [{ seed: 2, mode: 'sprint' }, 12],
  [{ seed: 3, mode: 'ultra' }, 13],
  [{ seed: 4, mode: 'zen' }, 14],
  [{ seed: 123456, mode: 'marathon', settings: { das: 90, arr: 0, softDrop: 0, allow180: false } }, 15],
];

for (const [opts, is] of CASES) {
  test(`replay reproduces the exact game (${opts.mode}, seed ${opts.seed})`, () => {
    const g = autoplay(opts, is, 3000);
    assert.ok(g.log.length > 50);
    const replay = makeReplay(g);
    const h = playReplay(replay);
    assert.equal(h.stateHash(), g.stateHash());
    assert.equal(h.score, g.score);
    assert.equal(h.lines, g.lines);
    assert.equal(h.frame, g.frame);
    assert.deepEqual(h.board.toStrings(), g.board.toStrings());
    assert.deepEqual(h.result(), g.result());
    assert.ok(verifyReplay(replay));
  });
}

test('the same seed and inputs give identical games twice', () => {
  const a = autoplay({ seed: 77, mode: 'marathon' }, 5, 2500);
  const b = autoplay({ seed: 77, mode: 'marathon' }, 5, 2500);
  assert.equal(a.stateHash(), b.stateHash());
  assert.deepEqual(a.log, b.log);
});

test('a different seed with the same inputs diverges', () => {
  const a = autoplay({ seed: 77, mode: 'marathon' }, 5, 2500);
  const b = autoplay({ seed: 78, mode: 'marathon' }, 5, 2500);
  assert.notEqual(a.stateHash(), b.stateHash());
});

test('a tampered input log no longer verifies', () => {
  const g = autoplay({ seed: 9, mode: 'marathon' }, 21, 2000);
  const r = makeReplay(g);
  r.events[Math.floor(r.events.length / 2)][1] = 'hardDrop';
  assert.equal(verifyReplay(r), false);
});

test('replays survive a JSON round trip', () => {
  const g = autoplay({ seed: 31, mode: 'ultra' }, 3, 1500);
  const r = JSON.parse(JSON.stringify(makeReplay(g)));
  assert.ok(verifyReplay(r));
});

test('a finished game replay ends with the same status', () => {
  const g = autoplay({ seed: 4, mode: 'marathon' }, 8, 20000);
  assert.equal(g.status, 'over');
  const h = playReplay(makeReplay(g));
  assert.equal(h.status, 'over');
  assert.equal(h.reason, g.reason);
});

test('the player can step frame by frame and pause anywhere', () => {
  const g = autoplay({ seed: 5, mode: 'marathon' }, 2, 1200);
  const r = makeReplay(g);
  const p = new ReplayPlayer(r);
  for (let i = 0; i < 300; i++) p.stepFrame();
  assert.equal(p.game.frame, 300);
  const mid = p.game.stateHash();
  // "paused": not stepping changes nothing
  assert.equal(p.game.stateHash(), mid);
  while (p.stepFrame()) { /* run */ }
  assert.equal(p.game.stateHash(), g.stateHash());
  assert.equal(p.progress, 1);
});

test('restarting the player gives the same run again', () => {
  const g = autoplay({ seed: 6, mode: 'sprint' }, 4, 1000);
  const p = new ReplayPlayer(makeReplay(g));
  p.runToEnd();
  const first = p.game.stateHash();
  p.reset();
  assert.equal(p.game.frame, 0);
  p.runToEnd();
  assert.equal(p.game.stateHash(), first);
});

test('state at a given frame is identical when reached by different chunking', () => {
  const g = autoplay({ seed: 12, mode: 'marathon' }, 9, 1500);
  const r = makeReplay(g);
  const a = new ReplayPlayer(r);
  const b = new ReplayPlayer(r);
  for (let i = 0; i < 700; i++) a.stepFrame();
  for (let k = 0; k < 7; k++) for (let i = 0; i < 100; i++) b.stepFrame();
  assert.equal(a.game.stateHash(), b.game.stateHash());
});

test('validateReplay accepts good replays and rejects bad ones', () => {
  const g = autoplay({ seed: 1, mode: 'zen' }, 1, 300);
  const r = makeReplay(g);
  assert.doesNotThrow(() => validateReplay(r));
  assert.throws(() => validateReplay(null));
  assert.throws(() => validateReplay({ ...r, v: 99 }));
  assert.throws(() => validateReplay({ ...r, seed: 'x' }));
  assert.throws(() => validateReplay({ ...r, events: [[0, 'fly', 1]] }));
  assert.throws(() => validateReplay({ ...r, events: [[5, 'left', 1], [2, 'left', 0]] }));
  assert.throws(() => validateReplay({ ...r, frames: -1 }));
});
