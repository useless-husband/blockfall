import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, STEP_MS, LOCK_DELAY_MS, MAX_LOCK_RESETS, PREVIEW_COUNT } from '../src/engine.js';
import { SPAWN_X, SPAWN_Y } from '../src/pieces.js';
import { Board } from '../src/board.js';
import { gravityPerFrame, secondsPerRow } from '../src/scoring.js';
import { setup, steps, tap } from './helpers.js';

// ---------- basics ----------
test('a new game spawns a piece at the top and has a 5 piece preview', () => {
  const g = new Game({ seed: 5 });
  assert.equal(g.piece.x, SPAWN_X);
  assert.equal(g.piece.y, SPAWN_Y);
  assert.equal(g.piece.rot, 0);
  assert.equal(g.preview.length, PREVIEW_COUNT);
  assert.equal(g.status, 'playing');
  assert.equal(g.level, 1);
});

test('unknown mode is rejected', () => {
  assert.throws(() => new Game({ mode: 'nope' }));
});

test('the queue follows the 7-bag: first 7 pieces are distinct', () => {
  const g = new Game({ seed: 11 });
  const seen = [g.piece.type, ...g.preview.slice(0, 5)];
  assert.equal(new Set(seen).size, 6);
});

test('forced sequence controls the first pieces', () => {
  const g = new Game({ seed: 1, sequence: ['I', 'O', 'T'] });
  assert.equal(g.piece.type, 'I');
  assert.deepEqual(g.preview.slice(0, 2), ['O', 'T']);
});

test('pieces spawn in order from the queue after a lock', () => {
  const g = new Game({ seed: 4 });
  const next = g.preview[0];
  g.hardDrop();
  assert.equal(g.piece.type, next);
});

// ---------- movement ----------
test('left and right move one cell', () => {
  const g = setup([], ['T', 3, 5, 0]);
  tap(g, 'left');
  assert.equal(g.piece.x, 2);
  tap(g, 'right');
  tap(g, 'right');
  assert.equal(g.piece.x, 4);
});

test('walls stop sideways movement', () => {
  const g = setup([], ['T', 0, 5, 0]);
  tap(g, 'left');
  assert.equal(g.piece.x, 0);
  g.setPiece('T', 7, 5, 0);
  tap(g, 'right');
  assert.equal(g.piece.x, 7);
});

test('blocks stop sideways movement', () => {
  const g = setup([], ['T', 3, 20, 0]);
  g.board.rows[21][2] = 'G';
  tap(g, 'left');
  assert.equal(g.piece.x, 3);
});

// ---------- gravity ----------
test('level 1 gravity is one row per second', () => {
  const g = setup([], ['O', 3, 5, 0]);
  steps(g, 59);
  assert.equal(g.piece.y, 5);
  steps(g, 1);
  assert.equal(g.piece.y, 6);
  steps(g, 60);
  assert.equal(g.piece.y, 7);
});

test('gravity formula follows (0.8 - (L-1)*0.007)^(L-1)', () => {
  assert.equal(secondsPerRow(1), 1);
  assert.ok(Math.abs(secondsPerRow(2) - 0.793) < 1e-9);
  assert.ok(Math.abs(secondsPerRow(5) - Math.pow(0.772, 4)) < 1e-9);
  assert.ok(Math.abs(gravityPerFrame(1) - 1 / 60) < 1e-12);
});

test('gravity only ever gets faster from level 1 to 15', () => {
  for (let l = 1; l < 15; l++) assert.ok(gravityPerFrame(l + 1) > gravityPerFrame(l));
  assert.ok(gravityPerFrame(15) > 2);
});

test('high levels drop several rows per frame', () => {
  const g = setup([], ['O', 3, 1, 0]);
  g.level = 15;
  steps(g, 1);
  assert.ok(g.piece.y >= 3);
});

test('soft drop is faster than gravity and scores 1 point per row', () => {
  const g = setup([], ['O', 3, 2, 0]);
  g.input('softDrop', true);
  steps(g, 30);
  assert.equal(g.piece.y, 12); // 20x gravity = 20 rows per second
  assert.equal(g.score, 10);
});

test('soft drop factor can be infinite (instant)', () => {
  const g = setup([], ['O', 3, 2, 0], { settings: { softDrop: 0 } });
  g.input('softDrop', true);
  steps(g, 1);
  assert.equal(g.piece.y, 20);
  assert.equal(g.score, 18);
});

test('releasing soft drop returns to normal gravity', () => {
  const g = setup([], ['O', 3, 2, 0]);
  g.input('softDrop', true);
  steps(g, 3);
  g.input('softDrop', false);
  const y = g.piece.y;
  steps(g, 30);
  assert.equal(g.piece.y, y);
});

test('hard drop goes to the floor, scores 2 per row and locks at once', () => {
  const g = setup([], ['O', 3, 5, 0]);
  const next = g.preview[0];
  const d = g.hardDrop();
  assert.equal(d, 15);
  assert.equal(g.score, 30);
  assert.equal(g.board.rows[21][4], 'O');
  assert.equal(g.board.rows[20][5], 'O');
  assert.equal(g.piece.type, next);
});

test('ghost is where a hard drop would land', () => {
  const g = setup(['XXXX......'], ['T', 3, 3, 0]);
  const gy = g.ghostY();
  g.hardDrop();
  assert.equal(g.board.rows[gy + 1][4], 'T');
});

// ---------- lock delay ----------
const floorI = () => setup([], ['I', 3, 20, 0]);

test('lock delay is 0.5 s', () => {
  assert.equal(LOCK_DELAY_MS, 500);
  const g = floorI();
  steps(g, 29);
  assert.equal(g.pieces, 0);
  steps(g, 1);
  assert.equal(g.pieces, 1);
});

test('a grounded piece does not lock while airborne', () => {
  const g = setup([], ['I', 3, 5, 0]);
  steps(g, 30);
  assert.equal(g.pieces, 0);
});

test('moving on the ground resets the lock timer', () => {
  const g = floorI();
  steps(g, 20);
  tap(g, 'left');
  assert.equal(g.lockTimer, 0);
  steps(g, 29);
  assert.equal(g.pieces, 0);
  steps(g, 1);
  assert.equal(g.pieces, 1);
});

test('rotating on the ground resets the lock timer too', () => {
  const g = setup([], ['T', 3, 19, 0]);
  steps(g, 20);
  g.input('rotateCW', true);
  assert.equal(g.lockTimer, 0);
});

test('at most 15 move resets are allowed', () => {
  assert.equal(MAX_LOCK_RESETS, 15);
  const g = floorI();
  for (let i = 0; i < 15; i++) {
    steps(g, 1);
    tap(g, i % 2 ? 'right' : 'left');
    assert.equal(g.lockTimer, 0, `reset ${i + 1}`);
  }
  steps(g, 1);
  tap(g, 'left');
  assert.ok(g.lockTimer > 0, 'the 16th move must not reset');
  assert.equal(g.lockResets, 15);
});

test('after 15 resets the piece locks within 0.5 s no matter what', () => {
  const g = floorI();
  for (let i = 0; i < 15; i++) tap(g, i % 2 ? 'right' : 'left');
  let n = 0;
  while (g.pieces === 0 && n < 100) {
    if (n % 5 === 0) tap(g, n % 10 ? 'left' : 'right');
    steps(g, 1);
    n++;
  }
  assert.ok(n <= 30, `locked after ${n} steps`);
});

test('landing on a lower row gives the resets back', () => {
  const g = setup(['XXXXX.....'], ['O', 2, 19, 0]);
  tap(g, 'right'); // x=3, still on the ledge
  assert.equal(g.lockResets, 1);
  tap(g, 'right'); // x=4, cells at cols 5,6: nothing below
  steps(g, 60);
  assert.equal(g.piece.y, 20);
  assert.equal(g.lockResets, 0);
  assert.ok(g.lockTimer <= STEP_MS + 1e-6);
});

// ---------- hold ----------
test('hold stores the piece and brings the next one', () => {
  const g = new Game({ seed: 8, sequence: ['T', 'I', 'O'] });
  assert.equal(g.hold, null);
  g.input('hold', true);
  assert.equal(g.hold, 'T');
  assert.equal(g.piece.type, 'I');
  assert.deepEqual([g.piece.x, g.piece.y, g.piece.rot], [SPAWN_X, SPAWN_Y, 0]);
});

test('hold can only be used once per piece', () => {
  const g = new Game({ seed: 8, sequence: ['T', 'I', 'O'] });
  g.input('hold', true);
  g.input('hold', true);
  assert.equal(g.hold, 'T');
  assert.equal(g.piece.type, 'I');
});

test('hold is available again after the piece locks', () => {
  const g = new Game({ seed: 8, sequence: ['T', 'I', 'O', 'S'] });
  g.input('hold', true);
  g.hardDrop();
  assert.equal(g.holdUsed, false);
  g.input('hold', true);
  assert.equal(g.hold, 'O');
  assert.equal(g.piece.type, 'T');
});

test('swapping hold returns the held piece in its spawn orientation', () => {
  const g = new Game({ seed: 8, sequence: ['J', 'L', 'S', 'Z'] });
  g.input('hold', true);
  g.hardDrop();
  g.piece.rot = 2;
  g.input('hold', true);
  assert.equal(g.piece.type, 'J');
  assert.equal(g.piece.rot, 0);
  assert.equal(g.hold, 'S');
});

// ---------- DAS / ARR with exact frame counts ----------
const dasGame = (settings) => setup([], ['T', 5, 5, 0], { settings });
const px = (g) => g.piece.x;

test('DAS: nothing happens until the delay passes, then ARR repeats', () => {
  const g = dasGame({ das: 150, arr: 50 });
  g.input('left', true);
  assert.equal(px(g), 4);
  steps(g, 8); // 133 ms
  assert.equal(px(g), 4);
  steps(g, 1); // 150 ms -> first repeat
  assert.equal(px(g), 3);
  steps(g, 2);
  assert.equal(px(g), 3);
  steps(g, 1); // +50 ms
  assert.equal(px(g), 2);
  steps(g, 3);
  assert.equal(px(g), 1);
  steps(g, 3);
  assert.equal(px(g), 0);
  steps(g, 30);
  assert.equal(px(g), 0);
});

test('ARR of 0 slides to the wall in a single step', () => {
  const g = dasGame({ das: 100, arr: 0 });
  g.input('left', true);
  steps(g, 5);
  assert.equal(px(g), 4);
  steps(g, 1); // 100 ms reached at step 6
  assert.equal(px(g), 0);
});

test('DAS to the right stops at the right wall', () => {
  const g = dasGame({ das: 100, arr: 0 });
  g.input('right', true);
  steps(g, 6);
  assert.equal(px(g), 7);
});

test('releasing the key cancels the auto repeat', () => {
  const g = dasGame({ das: 100, arr: 30 });
  g.input('left', true);
  steps(g, 3);
  g.input('left', false);
  steps(g, 60);
  assert.equal(px(g), 4);
});

test('a key tapped quickly moves exactly one cell', () => {
  const g = dasGame({ das: 150, arr: 30 });
  tap(g, 'left');
  steps(g, 30);
  assert.equal(px(g), 4);
});

test('ARR that is not a whole number of frames averages out (20 ms)', () => {
  const g = setup([], ['O', -1, 5, 0], { settings: { das: 100, arr: 20 } });
  g.input('right', true); // x = 0
  steps(g, 6); // charged at 100 ms: first repeat
  assert.equal(px(g), 1);
  steps(g, 6); // 100 ms at 20 ms per repeat = 5 more
  assert.equal(px(g), 6);
});

test('pressing the other direction switches immediately, and the first one resumes on release', () => {
  const g = dasGame({ das: 100, arr: 50 });
  g.input('left', true);
  g.input('right', true);
  assert.equal(px(g), 5); // left then right
  steps(g, 6);
  assert.ok(px(g) > 5);
  g.input('right', false);
  const x = px(g);
  steps(g, 6);
  assert.ok(px(g) < x);
});

test('DAS charge carries over to the next piece while the key stays down', () => {
  const g = setup([], ['O', 3, 18, 0], { settings: { das: 100, arr: 0 } });
  g.input('left', true);
  steps(g, 10);
  g.hardDrop();
  assert.equal(g.piece.x, SPAWN_X);
  steps(g, 1); // still charged: the new piece slides at once
  assert.ok(g.piece.x <= 0);
});

test('releaseAll lets go of every held control', () => {
  const g = dasGame({ das: 100, arr: 30 });
  g.input('left', true);
  g.input('softDrop', true);
  g.releaseAll();
  assert.equal(g.held.left, false);
  assert.equal(g.softHeld, false);
  assert.equal(g.dasDir, 0);
});

// ---------- game over ----------
test('block out: a new piece that overlaps the stack ends the game', () => {
  const g = setup([], ['O', 0, 5, 0]);
  for (let x = 3; x <= 6; x++) g.board.rows[2][x] = 'G';
  g.hardDrop();
  assert.equal(g.status, 'over');
  assert.equal(g.reason, 'block out');
});

test('lock out: locking completely inside the hidden rows ends the game', () => {
  const g = setup([], ['O', -1, 0, 0]);
  for (let y = 2; y < 22; y++) g.board.rows[y][0] = 'G';
  g.board.rows[2][1] = 'G';
  g.hardDrop();
  assert.equal(g.status, 'over');
  assert.equal(g.reason, 'lock out');
});

test('locking with part of the piece in view is not a lock out', () => {
  const g = setup([], ['O', -1, 0, 0]);
  for (let y = 3; y < 22; y++) g.board.rows[y][0] = 'G';
  g.hardDrop();
  assert.equal(g.status, 'playing');
});

test('input is ignored after the game ends', () => {
  const g = setup([], ['O', 0, 5, 0]);
  for (let x = 3; x <= 6; x++) g.board.rows[2][x] = 'G';
  g.hardDrop();
  const frame = g.frame;
  g.step();
  g.input('left', true);
  assert.equal(g.frame, frame);
  assert.equal(g.log.length, 0);
});

test('zen mode never loses: the board is cleared instead', () => {
  const g = setup([], ['O', 0, 5, 0], { mode: 'zen' });
  for (let x = 3; x <= 6; x++) g.board.rows[2][x] = 'G';
  g.hardDrop();
  assert.equal(g.status, 'playing');
  assert.ok(g.board.rows.slice(0, 20).every((r) => r.every((c) => c === null)));
  assert.ok(g.drainEvents().some((e) => e.type === 'zenReset'));
});

test('zen mode also survives a lock out', () => {
  const g = setup([], ['O', -1, 0, 0], { mode: 'zen' });
  for (let y = 2; y < 22; y++) g.board.rows[y][0] = 'G';
  g.board.rows[2][1] = 'G';
  g.hardDrop();
  assert.equal(g.status, 'playing');
});

test('zen quit() ends the run', () => {
  const g = new Game({ mode: 'zen' });
  g.quit();
  assert.equal(g.status, 'over');
  assert.equal(g.reason, 'quit');
});

// ---------- lines and gravity of the stack ----------
test('clearing a line drops everything above it', () => {
  const g = setup(['X.........', 'XXXXXXXXX.'], ['I', 7, 18, 1]);
  g.hardDrop();
  assert.deepEqual(g.board.toStrings().slice(20), ['.........I', 'X........I']);
  assert.equal(g.lines, 1);
});

test('events are queued and drained', () => {
  const g = new Game({ seed: 2 });
  g.hardDrop();
  const ev = g.drainEvents();
  assert.ok(ev.some((e) => e.type === 'hardDrop'));
  assert.ok(ev.some((e) => e.type === 'lock'));
  assert.deepEqual(g.drainEvents(), []);
});

test('timeMs advances by 1/60 s per step', () => {
  const g = new Game({ seed: 2 });
  steps(g, 60);
  assert.ok(Math.abs(g.timeMs - 1000) < 1e-6);
  assert.equal(STEP_MS, 1000 / 60);
});
