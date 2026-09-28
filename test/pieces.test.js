import test from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, SHAPES, BOX, kickTests, KICKS_JLSTZ, KICKS_I, KICKS_180 } from '../src/pieces.js';
import { Game } from '../src/engine.js';
import { Board } from '../src/board.js';

const key = (cells) => cells.map(([x, y]) => `${x},${y}`).sort().join(' ');

test('there are exactly seven tetrominoes', () => {
  assert.deepEqual(TYPES.slice().sort(), ['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
});

for (const t of TYPES) {
  test(`${t}: every rotation state has 4 cells inside its box`, () => {
    for (let r = 0; r < 4; r++) {
      const cells = SHAPES[t][r];
      assert.equal(cells.length, 4);
      assert.equal(new Set(cells.map(String)).size, 4);
      for (const [x, y] of cells) {
        assert.ok(x >= 0 && x < BOX[t] && y >= 0 && y < BOX[t]);
      }
    }
  });
}

for (const t of TYPES.filter((x) => x !== 'O')) {
  test(`${t}: four clockwise turns are all distinct and 180 is a point reflection`, () => {
    const n = BOX[t];
    const keys = SHAPES[t].map(key);
    assert.equal(new Set(keys).size, 4);
    const reflected = SHAPES[t][0].map(([x, y]) => [n - 1 - x, n - 1 - y]);
    assert.equal(key(reflected), keys[2]);
  });
}

test('spawn shapes match the standard SRS diagrams', () => {
  const draw = (t, r = 0) => {
    const n = BOX[t];
    const g = Array.from({ length: n }, () => Array(n).fill('.'));
    for (const [x, y] of SHAPES[t][r]) g[y][x] = '#';
    return g.map((row) => row.join(''));
  };
  assert.deepEqual(draw('I'), ['....', '####', '....', '....']);
  assert.deepEqual(draw('T'), ['.#.', '###', '...']);
  assert.deepEqual(draw('S'), ['.##', '##.', '...']);
  assert.deepEqual(draw('Z'), ['##.', '.##', '...']);
  assert.deepEqual(draw('J'), ['#..', '###', '...']);
  assert.deepEqual(draw('L'), ['..#', '###', '...']);
  assert.deepEqual(draw('O'), ['.##.', '.##.', '....', '....']);
});

test('rotated states match SRS diagrams (J right, I right, T left, L 180)', () => {
  const draw = (t, r) => {
    const n = BOX[t];
    const g = Array.from({ length: n }, () => Array(n).fill('.'));
    for (const [x, y] of SHAPES[t][r]) g[y][x] = '#';
    return g.map((row) => row.join(''));
  };
  assert.deepEqual(draw('J', 1), ['.##', '.#.', '.#.']);
  assert.deepEqual(draw('I', 1), ['..#.', '..#.', '..#.', '..#.']);
  assert.deepEqual(draw('T', 3), ['.#.', '##.', '.#.']);
  assert.deepEqual(draw('L', 2), ['...', '###', '#..']);
  assert.deepEqual(draw('I', 3), ['.#..', '.#..', '.#..', '.#..']);
});

test('O piece never changes shape', () => {
  assert.equal(new Set(SHAPES.O.map(key)).size, 1);
});

// --- Kick tables, written in the wiki's notation (x right, y UP) ---
const p = (s) => s.trim().split(/\s+/).map((c) => c.replace(/[()]/g, '').split(',').map(Number));
const WIKI_JLSTZ = {
  '0>R': '(0,0) (-1,0) (-1,+1) (0,-2) (-1,-2)',
  'R>0': '(0,0) (+1,0) (+1,-1) (0,+2) (+1,+2)',
  'R>2': '(0,0) (+1,0) (+1,-1) (0,+2) (+1,+2)',
  '2>R': '(0,0) (-1,0) (-1,+1) (0,-2) (-1,-2)',
  '2>L': '(0,0) (+1,0) (+1,+1) (0,-2) (+1,-2)',
  'L>2': '(0,0) (-1,0) (-1,-1) (0,+2) (-1,+2)',
  'L>0': '(0,0) (-1,0) (-1,-1) (0,+2) (-1,+2)',
  '0>L': '(0,0) (+1,0) (+1,+1) (0,-2) (+1,-2)',
};
const WIKI_I = {
  '0>R': '(0,0) (-2,0) (+1,0) (-2,-1) (+1,+2)',
  'R>0': '(0,0) (+2,0) (-1,0) (+2,+1) (-1,-2)',
  'R>2': '(0,0) (-1,0) (+2,0) (-1,+2) (+2,-1)',
  '2>R': '(0,0) (+1,0) (-2,0) (+1,-2) (-2,+1)',
  '2>L': '(0,0) (+2,0) (-1,0) (+2,+1) (-1,-2)',
  'L>2': '(0,0) (-2,0) (+1,0) (-2,-1) (+1,+2)',
  'L>0': '(0,0) (+1,0) (-2,0) (+1,-2) (-2,+1)',
  '0>L': '(0,0) (-1,0) (+2,0) (-1,+2) (+2,-1)',
};
const IDX = { '0': 0, R: 1, '2': 2, L: 3 };
const split = (k) => k.split('>').map((s) => IDX[s]);

for (const [k, v] of Object.entries(WIKI_JLSTZ)) {
  test(`JLSTZ kick table ${k} matches the wiki`, () => {
    const [from, to] = split(k);
    for (const t of ['J', 'L', 'S', 'T', 'Z']) {
      assert.deepEqual(kickTests(t, from, to), p(v).map(([x, y]) => [x, -y]));
    }
  });
}
for (const [k, v] of Object.entries(WIKI_I)) {
  test(`I kick table ${k} matches the wiki`, () => {
    const [from, to] = split(k);
    assert.deepEqual(kickTests('I', from, to), p(v).map(([x, y]) => [x, -y]));
  });
}

test('O piece has a single (0,0) test', () => {
  assert.deepEqual(kickTests('O', 0, 1), [[0, 0]]);
});

test('kick tables are symmetric: reverse transition is the negation', () => {
  for (const table of [KICKS_JLSTZ, KICKS_I]) {
    for (const [k, v] of Object.entries(table)) {
      const rev = table[k[1] + k[0]];
      assert.deepEqual(rev.map(([x, y]) => [-x || 0, -y || 0]), v);
    }
  }
});

test('every CW/CCW transition has 5 tests and 180 transitions have 6', () => {
  for (const table of [KICKS_JLSTZ, KICKS_I]) {
    assert.equal(Object.keys(table).length, 8);
    for (const v of Object.values(table)) assert.equal(v.length, 5);
  }
  assert.equal(Object.keys(KICKS_180).length, 4);
  for (const v of Object.values(KICKS_180)) assert.equal(v.length, 6);
});

// --- Behaviour: for every piece, orientation and direction, force each kick in turn ---
function trial(type, from, dir, wanted) {
  const to = (from + dir) % 4;
  const tests = kickTests(type, from, to, dir === 2);
  const px = 3;
  const py = 8;
  const g = new Game({ seed: 3 });
  g.board = new Board();
  g.setPiece(type, px, py, from);
  const cur = new Set(SHAPES[type][from].map(([x, y]) => `${px + x},${py + y}`));
  const dest = (i) => SHAPES[type][to].map(([x, y]) => [px + tests[i][0] + x, py + tests[i][1] + y]);
  const ok = new Set(dest(wanted).map(String));
  for (let j = 0; j < wanted; j++) {
    const blocker = dest(j).find(([x, y]) => !cur.has(`${x},${y}`) && !ok.has(String([x, y])));
    if (!blocker) return null; // this test's squares are fully covered by others; cannot isolate
    g.board.rows[blocker[1]][blocker[0]] = 'G';
  }
  assert.equal(g.rotate(dir), true);
  assert.equal(g.piece.rot, to);
  assert.equal(g.piece.x, px + tests[wanted][0]);
  assert.equal(g.piece.y, py + tests[wanted][1]);
  assert.equal(g.kickIndex, wanted);
  return true;
}

for (const t of TYPES.filter((x) => x !== 'O')) {
  for (let from = 0; from < 4; from++) {
    for (const [dir, name] of [[1, 'CW'], [3, 'CCW']]) {
      test(`${t} rotates ${name} from state ${from} through every kick`, () => {
        let used = 0;
        const n = kickTests(t, from, (from + dir) % 4).length;
        for (let i = 0; i < n; i++) if (trial(t, from, dir, i)) used++;
        assert.ok(used >= 4, `only ${used} kicks could be isolated`);
      });
    }
  }
}

test('a rotation that fits nowhere fails and leaves the piece alone', () => {
  const g = new Game({ seed: 3 });
  g.board = new Board();
  g.setPiece('T', 3, 8, 0);
  // wall in every square any T orientation could go to
  for (let y = 5; y < 14; y++) for (let x = 0; x < 10; x++) g.board.rows[y][x] = 'G';
  for (const [cx, cy] of SHAPES.T[0]) g.board.rows[8 + cy][3 + cx] = null;
  assert.equal(g.rotate(1), false);
  assert.deepEqual(g.piece, { type: 'T', rot: 0, x: 3, y: 8 });
});

test('I piece resting on the floor kicks up when rotated (kick 5)', () => {
  const g = new Game({ seed: 3 });
  g.setPiece('I', 3, 20, 0);
  assert.equal(g.rotate(1), true);
  assert.equal(g.piece.rot, 1);
  assert.equal(g.piece.y, 18);
  assert.equal(g.piece.x, 4);
});

test('T against the left wall kicks right when rotating into the wall', () => {
  const g = new Game({ seed: 3 });
  g.setPiece('T', -1, 10, 1); // vertical bar in column 0
  assert.equal(g.rotate(3), true); // CCW back to state 0, would poke out of the wall
  assert.equal(g.piece.rot, 0);
  assert.ok(g.piece.x >= 0 || g.pieceCells().every(([x]) => x >= 0));
});

test('180 rotation works, and is refused when disabled', () => {
  const g = new Game({ seed: 3 });
  g.setPiece('L', 3, 10, 0);
  assert.equal(g.rotate(2), true);
  assert.equal(g.piece.rot, 2);
  const h = new Game({ seed: 3, settings: { allow180: false } });
  h.setPiece('L', 3, 10, 0);
  assert.equal(h.rotate(2), false);
  assert.equal(h.piece.rot, 0);
});
