import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, MODES, STEP_MS } from '../src/engine.js';
import { setup, QUAD_PIECE } from './helpers.js';

const dropQuad = (g) => {
  g.board = setup(['X.........', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.']).board;
  g.setPiece(...QUAD_PIECE);
  g.hardDrop();
};

test('all four modes exist', () => {
  assert.deepEqual(Object.keys(MODES).sort(), ['marathon', 'sprint', 'ultra', 'zen']);
});

test('marathon: level rises every 10 lines', () => {
  const g = new Game({ mode: 'marathon', seed: 1 });
  dropQuad(g);
  dropQuad(g);
  assert.equal(g.lines, 8);
  assert.equal(g.level, 1);
  dropQuad(g);
  assert.equal(g.lines, 12);
  assert.equal(g.level, 2);
  assert.ok(g.drainEvents().some((e) => e.type === 'levelUp' && e.level === 2));
});

test('marathon: points after a level-up use the new level', () => {
  const g = new Game({ mode: 'marathon', seed: 1 });
  dropQuad(g); dropQuad(g); dropQuad(g);
  const before = g.score;
  dropQuad(g);
  assert.ok(g.score - before >= 1600);
});

test('marathon: reaching 150 lines wins and level is capped at 15', () => {
  const g = new Game({ mode: 'marathon', seed: 1 });
  g.lines = 148;
  g.board = setup(['X.........', 'XXXXXXXXX.', 'XXXXXXXXX.']).board;
  g.setPiece('I', 7, 18, 1);
  g.hardDrop();
  assert.equal(g.status, 'won');
  assert.equal(g.reason, 'goal');
  assert.equal(g.level, 15);
});

test('sprint: 40 lines ends the run and reports the time', () => {
  const g = new Game({ mode: 'sprint', seed: 1 });
  for (let i = 0; i < 9; i++) dropQuad(g);
  assert.equal(g.status, 'playing');
  for (let i = 0; i < 300; i++) g.step();
  dropQuad(g);
  assert.equal(g.lines, 40);
  assert.equal(g.status, 'won');
  const r = g.result();
  assert.equal(r.timeMs, Math.round(300 * STEP_MS));
  assert.equal(r.frames, 300);
});

test('sprint: level stays at 1', () => {
  const g = new Game({ mode: 'sprint', seed: 1 });
  for (let i = 0; i < 5; i++) dropQuad(g);
  assert.equal(g.level, 1);
});

test('ultra: ends after exactly two minutes', () => {
  const g = new Game({ mode: 'ultra', seed: 1 });
  for (let i = 0; i < 7199; i++) {
    if (i % 500 === 0) g.board.clear(); // keep the idle stack from topping out
    g.step();
  }
  assert.equal(g.status, 'playing');
  g.step();
  assert.equal(g.status, 'won');
  assert.equal(g.reason, 'time');
  assert.equal(g.frame, 7200);
  assert.equal(g.result().timeMs, 120000);
});

test('ultra: the game stops advancing once time is up', () => {
  const g = new Game({ mode: 'ultra', seed: 1 });
  for (let i = 0; i < 7200; i++) {
    if (i % 500 === 0) g.board.clear();
    g.step();
  }
  g.step();
  assert.equal(g.frame, 7200);
});

test('ultra: clears made before the limit count', () => {
  const g = new Game({ mode: 'ultra', seed: 1 });
  dropQuad(g);
  for (let i = 0; i < 7300 && g.status === 'playing'; i++) g.step();
  assert.ok(g.score >= 800);
});

test('zen: no goal and no time limit', () => {
  const g = new Game({ mode: 'zen', seed: 1 });
  for (let i = 0; i < 8000; i++) {
    if (i % 100 === 0) g.hardDrop();
    g.step();
  }
  assert.equal(g.status, 'playing');
});

test('zen: lots of hard drops never end the game', () => {
  const g = new Game({ mode: 'zen', seed: 5 });
  for (let i = 0; i < 400; i++) g.hardDrop();
  assert.equal(g.status, 'playing');
  assert.equal(g.pieces, 400);
});

test('marathon: spamming hard drops eventually tops out', () => {
  const g = new Game({ mode: 'marathon', seed: 5 });
  for (let i = 0; i < 100 && g.status === 'playing'; i++) g.hardDrop();
  assert.equal(g.status, 'over');
});

test('result() summarizes the run', () => {
  const g = new Game({ mode: 'sprint', seed: 1 });
  dropQuad(g);
  const r = g.result();
  assert.equal(r.mode, 'sprint');
  assert.equal(r.lines, 4);
  assert.equal(r.score, 800);
  assert.equal(r.pieces, 1);
});
