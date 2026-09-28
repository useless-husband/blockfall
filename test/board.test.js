import test from 'node:test';
import assert from 'node:assert/strict';
import { Board, COLS, ROWS, VISIBLE, HIDDEN } from '../src/board.js';

test('board is 10 wide with 20 visible + 2 hidden rows', () => {
  const b = new Board();
  assert.equal(COLS, 10);
  assert.equal(VISIBLE, 20);
  assert.equal(HIDDEN, 2);
  assert.equal(ROWS, 22);
  assert.equal(b.rows.length, 22);
  assert.ok(b.rows.every((r) => r.length === 10));
  assert.ok(b.isEmpty());
});

test('walls, floor and ceiling are solid', () => {
  const b = new Board();
  assert.equal(b.isFree(-1, 5), false);
  assert.equal(b.isFree(10, 5), false);
  assert.equal(b.isFree(5, 22), false);
  assert.equal(b.isFree(5, -1), false);
  assert.equal(b.isFree(0, 0), true);
  assert.equal(b.isFree(9, 21), true);
});

test('fromStrings aligns to the bottom and round-trips', () => {
  const b = Board.fromStrings(['X.........', '.X........']);
  assert.equal(b.rows[20][0], 'G');
  assert.equal(b.rows[21][1], 'G');
  assert.deepEqual(b.toStrings().slice(20), ['X.........', '.X........']);
});

test('clearLines removes only full rows and drops the rest', () => {
  const b = Board.fromStrings(['X.........', 'XXXXXXXXXX', '.X........', 'XXXXXXXXXX']);
  assert.equal(b.clearLines(), 2);
  assert.deepEqual(b.toStrings().slice(20), ['X.........', '.X........']);
  assert.equal(b.rows.length, 22);
});

test('clearing four non-adjacent-looking rows works', () => {
  const b = Board.fromStrings(['XXXXXXXXXX', 'XXXXXXXXXX', 'XXXXXXXXXX', 'XXXXXXXXXX']);
  assert.equal(b.clearLines(), 4);
  assert.ok(b.isEmpty());
});

test('collides and place work with relative cells', () => {
  const b = new Board();
  const cells = [[0, 0], [1, 0]];
  assert.equal(b.collides(cells, 8, 21), false);
  assert.equal(b.collides(cells, 9, 21), true);
  b.place(cells, 0, 21, 'T');
  assert.equal(b.collides(cells, 1, 21), true);
  assert.equal(b.get(0, 21), 'T');
});

test('clone is independent', () => {
  const a = new Board();
  const c = a.clone();
  c.rows[0][0] = 'I';
  assert.equal(a.rows[0][0], null);
});

test('clear() empties the board', () => {
  const b = Board.fromStrings(['XXXXXXXXX.']);
  b.clear();
  assert.ok(b.isEmpty());
});
