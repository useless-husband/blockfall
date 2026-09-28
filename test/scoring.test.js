import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { classifyClear, perfectClearBase, comboBonus } from '../src/scoring.js';
import { setup, QUAD_ROWS, QUAD_PIECE } from './helpers.js';

const quad = (g) => {
  g.board = setup(['X.........', ...QUAD_ROWS]).board; // leftover block: not a perfect clear
  g.setPiece(...QUAD_PIECE);
  g.hardDrop();
};
const oneLine = (g) => {
  g.board = setup(['X.........', 'XXXXXXXXX.']).board;
  g.setPiece('I', 7, 18, 1);
  return g.hardDrop();
};

// ---------- pure tables ----------
test('line clear base points: 100 / 300 / 500 / 800', () => {
  assert.deepEqual([1, 2, 3, 4].map((n) => classifyClear(n, null).base), [100, 300, 500, 800]);
});

test('line clear names', () => {
  assert.deepEqual([1, 2, 3, 4].map((n) => classifyClear(n, null).label), ['Single', 'Double', 'Triple', 'Quad']);
});

test('T-Spin base points: 400 / 800 / 1200 / 1600', () => {
  assert.deepEqual([0, 1, 2, 3].map((n) => classifyClear(n, 'full').base), [400, 800, 1200, 1600]);
});

test('T-Spin Mini base points: 100 / 200 / 400', () => {
  assert.deepEqual([0, 1, 2].map((n) => classifyClear(n, 'mini').base), [100, 200, 400]);
});

test('T-Spin labels', () => {
  assert.equal(classifyClear(0, 'full').label, 'T-Spin');
  assert.equal(classifyClear(2, 'full').label, 'T-Spin Double');
  assert.equal(classifyClear(0, 'mini').label, 'T-Spin Mini');
  assert.equal(classifyClear(1, 'mini').label, 'T-Spin Mini Single');
});

test('only Quads and T-Spin clears are "difficult"', () => {
  assert.equal(classifyClear(4, null).difficult, true);
  assert.equal(classifyClear(3, null).difficult, false);
  assert.equal(classifyClear(1, 'full').difficult, true);
  assert.equal(classifyClear(0, 'full').difficult, false);
});

test('perfect clear bonus table', () => {
  assert.deepEqual([1, 2, 3, 4].map((n) => perfectClearBase(n, false)), [800, 1200, 1800, 2000]);
  assert.equal(perfectClearBase(4, true), 3200);
});

test('combo bonus is 50 x combo x level, zero on the first clear', () => {
  assert.equal(comboBonus(0, 5), 0);
  assert.equal(comboBonus(1, 1), 50);
  assert.equal(comboBonus(3, 2), 300);
});

// ---------- line clears in the engine ----------
test('a single scores 100 at level 1', () => {
  const g = new Game({ seed: 1 });
  oneLine(g);
  assert.equal(g.lastClear.label, 'Single');
  assert.equal(g.score, 100);
});

test('points are multiplied by the level', () => {
  const g = new Game({ seed: 1 });
  g.level = 4;
  quad(g);
  assert.equal(g.score, 3200);
});

test('a quad scores 800', () => {
  const g = new Game({ seed: 1 });
  quad(g);
  assert.equal(g.score, 800);
  assert.equal(g.lines, 4);
  assert.equal(g.lastClear.label, 'Quad');
});

test('double and triple', () => {
  for (const [n, pts] of [[2, 300], [3, 500]]) {
    const g = setup(Array(n).fill('XXXXXXXXX.'), ['I', 7, 18, 1]);
    g.hardDrop();
    assert.equal(g.lines, n);
    assert.equal(g.score, pts);
  }
});

test('soft and hard drop points are added to line points', () => {
  const g = setup(['XXXXXXXXX.'], ['I', 7, 10, 1]);
  g.hardDrop(); // I vertical rows 10..13 -> falls 8 to rows 18..21
  assert.equal(g.score, 16 + 100);
});

// ---------- back to back ----------
test('the first quad has no bonus, the second gets x1.5', () => {
  const g = new Game({ seed: 1 });
  quad(g);
  assert.equal(g.score, 800);
  assert.equal(g.b2b, true);
  quad(g);
  assert.equal(g.lastClear.b2b, true);
  // 800 + (1200 back-to-back) + combo 1 x 50
  assert.equal(g.score, 800 + 1200 + 50);
});

test('a single breaks back-to-back', () => {
  const g = new Game({ seed: 1 });
  quad(g);
  oneLine(g);
  assert.equal(g.b2b, false);
  quad(g);
  assert.equal(g.lastClear.b2b, false);
});

test('locking without clearing lines does not break back-to-back', () => {
  const g = new Game({ seed: 1 });
  quad(g);
  g.board = setup([]).board;
  g.setPiece('O', 3, 5, 0);
  g.hardDrop();
  assert.equal(g.b2b, true);
});

// ---------- combo ----------
test('combo counts consecutive clears and pays 50 x combo x level', () => {
  const g = new Game({ seed: 1 });
  oneLine(g);
  assert.equal(g.combo, 0);
  assert.equal(g.score, 100);
  oneLine(g);
  assert.equal(g.combo, 1);
  assert.equal(g.score, 100 + 100 + 50);
  oneLine(g);
  assert.equal(g.combo, 2);
  assert.equal(g.score, 250 + 100 + 100);
});

test('a lock without a clear resets the combo', () => {
  const g = new Game({ seed: 1 });
  oneLine(g);
  oneLine(g);
  g.board = setup([]).board;
  g.setPiece('O', 3, 5, 0);
  g.hardDrop();
  assert.equal(g.combo, -1);
  oneLine(g);
  assert.equal(g.combo, 0);
});

// ---------- perfect clear ----------
test('a perfect clear single scores 800 on top of the line', () => {
  const g = setup(['XXXXXX....'], ['I', 6, 20, 0]);
  g.hardDrop();
  assert.equal(g.lastClear.pc, true);
  assert.equal(g.perfectClears, 1);
  assert.equal(g.score, 100 + 800);
});

test('a perfect clear quad scores 2000 + 800', () => {
  const g = setup(QUAD_ROWS, QUAD_PIECE);
  g.hardDrop();
  assert.equal(g.lastClear.pc, true);
  assert.equal(g.score, 800 + 2000);
});

test('back-to-back perfect clear quad scores 3200 (+1.5x quad)', () => {
  const g = setup(QUAD_ROWS, QUAD_PIECE);
  g.b2b = true;
  g.hardDrop();
  assert.equal(g.score, 1200 + 3200);
});

test('no perfect clear when blocks remain', () => {
  const g = setup(['X.........', 'XXXXXXXXX.'], ['I', 7, 18, 1]);
  g.hardDrop();
  assert.equal(g.lastClear.pc, false);
});

// ---------- T-Spin ----------
// Classic double: slot in column 4, one overhang at the top-left.
const TSD_ROWS = [
  '...X......',
  'XXX...XXXX',
  'XXXX.XXXXX',
];
// T points right (state 1) above the slot; rotating clockwise puts it in pointing down.
const TSD_PIECE = ['T', 3, 19, 1];

test('T-Spin Double (rotate into a slot) scores 1200', () => {
  const g = setup(TSD_ROWS, TSD_PIECE);
  assert.equal(g.rotate(1), true);
  g.hardDrop();
  assert.equal(g.lastClear.label, 'T-Spin Double');
  assert.equal(g.lastClear.tspin, 'full');
  assert.equal(g.score, 1200);
  assert.equal(g.lines, 2);
});

test('the same drop without rotating is just a Double', () => {
  const g = setup(TSD_ROWS, ['T', 3, 19, 2]);
  g.hardDrop();
  assert.equal(g.lastClear.label, 'Double');
  assert.equal(g.score, 300);
});

test('a move after the rotation cancels the T-Spin', () => {
  const g = setup([], ['T', 3, 10, 0]);
  g.rotate(1);
  assert.equal(g.rotated, true);
  g.input('right', true);
  assert.equal(g.rotated, false);
});

test('gravity after the rotation cancels the T-Spin flag as well', () => {
  const g = setup([], ['T', 3, 10, 0]);
  g.rotate(1);
  for (let i = 0; i < 61; i++) g.step();
  assert.equal(g.rotated, false);
});

test('T-Spin with no lines: "T-Spin" for 400 and back-to-back is untouched', () => {
  const g = setup(['...X......', 'XXX...XXX.', 'XXXX.XXX.X'], TSD_PIECE);
  g.b2b = true;
  g.rotate(1);
  g.hardDrop();
  assert.equal(g.lastClear.label, 'T-Spin');
  assert.equal(g.lines, 0);
  assert.equal(g.score, 400);
  assert.equal(g.b2b, true);
  assert.equal(g.combo, -1);
});

test('T-Spin Single scores 800', () => {
  const g = setup(['...X......', 'XXX...XXX.', 'XXXX.XXXXX'], TSD_PIECE);
  g.rotate(1);
  g.hardDrop();
  assert.equal(g.lastClear.label, 'T-Spin Single');
  assert.equal(g.score, 800);
});

test('T-Spin Mini Single scores 200', () => {
  const g = setup(['...X.X....', 'XXX...XXXX', 'XXXX..XXXX'], TSD_PIECE);
  g.rotate(1);
  g.hardDrop();
  assert.equal(g.lastClear.tspin, 'mini');
  assert.equal(g.lastClear.label, 'T-Spin Mini Single');
  assert.equal(g.score, 200);
});

test('a T-Spin Double after a Quad gets the back-to-back bonus', () => {
  const g = new Game({ seed: 1 });
  quad(g);
  g.board = setup(TSD_ROWS).board;
  g.setPiece(...TSD_PIECE);
  g.rotate(1);
  g.hardDrop();
  assert.equal(g.lastClear.b2b, true);
  assert.equal(g.score, 800 + 1800 + 50);
});

// T-Spin Triple: rotates in with the fifth kick.
const TST_ROWS = [
  '....X.....', // overhang
  '..........',
  'XXXX.XXXXX',
  'XXXX..XXXX',
  'XXXX.XXXXX',
];
const TST_PIECE = ['T', 4, 17, 0];

test('T-Spin Triple through the fifth kick scores 1600', () => {
  const g = setup(TST_ROWS, TST_PIECE);
  assert.equal(g.rotate(1), true);
  assert.equal(g.kickIndex, 4);
  g.hardDrop();
  assert.equal(g.lastClear.label, 'T-Spin Triple');
  assert.equal(g.score, 1600);
  assert.equal(g.lines, 3);
});

test('fifth-kick T-Spin is upgraded from Mini to full', () => {
  // Same shape but the bottom row lacks the corner square in front of the piece.
  const rows = TST_ROWS.slice(0, 4).concat(['XXXX.....X']);
  const g = setup(rows, TST_PIECE);
  assert.equal(g.rotate(1), true);
  assert.equal(g.kickIndex, 4);
  g.hardDrop();
  assert.equal(g.lastClear.tspin, 'full');
  assert.equal(g.lastClear.label, 'T-Spin Double');
  assert.equal(g.score, 1200);
});

test('a T rotated in the open has fewer than three corners: no T-Spin', () => {
  const g = setup([], ['T', 3, 10, 0]);
  g.rotate(1);
  g.hardDrop();
  assert.equal(g.lastClear, null);
});

test('other pieces never score T-Spins', () => {
  const g = setup(TSD_ROWS, ['L', 3, 19, 1]);
  g.rotate(1);
  g.hardDrop();
  assert.ok(!g.lastClear || !g.lastClear.tspin);
});

test('walls and floor count as corners', () => {
  // T pointing right, sitting in the left-wall notch on the floor.
  const g = setup([], null);
  g.board.rows[19][1] = 'G';
  g.setPiece('T', -1, 19, 1);
  g.rotated = true;
  g.hardDrop();
  assert.equal(g.lastClear.label, 'T-Spin Mini');
  assert.equal(g.score, 100);
});
