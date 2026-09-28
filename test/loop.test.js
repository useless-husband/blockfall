import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedLoop } from '../src/loop.js';
import { Game, STEP_MS } from '../src/engine.js';
import { setup } from './helpers.js';

/** A clock the test controls. */
class FakeClock {
  constructor() { this.now = 0; }
  tick(ms) { this.now += ms; return this.now; }
}

test('runs one step per 1/60 s no matter how the time is sliced', () => {
  for (const slice of [1, 5, 16, 16.6667, 33, 100]) {
    let n = 0;
    const loop = new FixedLoop(() => n++);
    const total = 2000;
    for (let t = 0; t < total; t += slice) loop.advance(slice);
    assert.ok(Math.abs(n - total / STEP_MS) <= 2, `slice ${slice}: ${n}`);
  }
});

test('irregular frame times still add up', () => {
  let n = 0;
  const loop = new FixedLoop(() => n++);
  const clock = new FakeClock();
  let last = 0;
  const deltas = [7, 22, 9, 31, 16, 16, 40, 3, 12, 25];
  let total = 0;
  for (let i = 0; i < 100; i++) {
    const d = deltas[i % deltas.length];
    total += d;
    loop.advance(clock.tick(d) - last);
    last = clock.now;
  }
  assert.equal(n, Math.floor(total / STEP_MS + 1e-9));
});

test('long pauses are capped so the game does not fast-forward', () => {
  let n = 0;
  const loop = new FixedLoop(() => n++);
  loop.advance(60000);
  assert.ok(n <= Math.ceil(250 / STEP_MS));
});

test('speed multiplier scales the step count', () => {
  let a = 0;
  let b = 0;
  const l1 = new FixedLoop(() => a++);
  const l2 = new FixedLoop(() => b++);
  for (let i = 0; i < 60; i++) { l1.advance(STEP_MS, 1); l2.advance(STEP_MS, 2); }
  assert.ok(Math.abs(b - 2 * a) <= 2);
});

test('half speed runs half as many steps', () => {
  let a = 0;
  const l = new FixedLoop(() => a++);
  for (let i = 0; i < 120; i++) l.advance(STEP_MS, 0.5);
  assert.ok(Math.abs(a - 60) <= 1);
});

test('zero or negative elapsed time does nothing', () => {
  let n = 0;
  const loop = new FixedLoop(() => n++);
  assert.equal(loop.advance(0), 0);
  assert.equal(loop.advance(-5), 0);
  assert.equal(n, 0);
});

test('reset clears leftover time', () => {
  let n = 0;
  const loop = new FixedLoop(() => n++);
  loop.advance(10);
  loop.reset();
  loop.advance(10);
  assert.equal(n, 0);
});

test('DAS/ARR through the loop with a fake clock, 144 Hz display', () => {
  const g = setup([], ['T', 5, 5, 0], { settings: { das: 150, arr: 50 } });
  const loop = new FixedLoop(() => g.step());
  const clock = new FakeClock();
  let last = 0;
  g.input('left', true);
  const positions = [];
  for (let i = 0; i < 60; i++) {
    loop.advance(clock.tick(1000 / 144) - last);
    last = clock.now;
    positions.push([Math.round(clock.now), g.piece.x]);
  }
  // nothing before ~150 ms, then one column every ~50 ms
  assert.ok(positions.filter(([t]) => t < 140).every(([, x]) => x === 4));
  const at = (ms) => positions.find(([t]) => t >= ms)[1];
  assert.equal(at(180), 3);
  assert.equal(at(230), 2);
  assert.equal(at(280), 1);
  assert.equal(at(340), 0);
});

test('display rate does not change game results', () => {
  const run = (hz) => {
    const g = new Game({ seed: 3 });
    const loop = new FixedLoop(() => g.step());
    g.input('softDrop', true);
    const dt = 1000 / hz;
    for (let t = 0; t < 3000; t += dt) loop.advance(dt);
    return g.frame;
  };
  assert.ok(Math.abs(run(60) - run(144)) <= 2);
  assert.ok(Math.abs(run(60) - run(30)) <= 2);
});
