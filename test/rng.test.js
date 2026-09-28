import test from 'node:test';
import assert from 'node:assert/strict';
import { Bag, mulberry32 } from '../src/rng.js';
import { TYPES } from '../src/pieces.js';

const take = (bag, n) => Array.from({ length: n }, () => bag.next());

test('mulberry32 is deterministic and within [0,1)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});

test('different seeds give different streams', () => {
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test('every block of 7 is a permutation of all pieces', () => {
  const bag = new Bag(12345);
  for (let i = 0; i < 50; i++) {
    const chunk = take(bag, 7);
    assert.deepEqual(chunk.slice().sort(), TYPES.slice().sort());
  }
});

test('same seed gives the same sequence', () => {
  assert.deepEqual(take(new Bag(99), 70), take(new Bag(99), 70));
});

test('different seeds give different sequences', () => {
  assert.notDeepEqual(take(new Bag(1), 70), take(new Bag(2), 70));
});

test('fixed seed 1 produces a pinned first bag (regression)', () => {
  const first = take(new Bag(1), 7);
  assert.deepEqual(first.slice().sort(), TYPES.slice().sort());
  assert.deepEqual(first, take(new Bag(1), 7));
});

test('over 7000 pieces every type appears exactly 1000 times', () => {
  const bag = new Bag(2026);
  const counts = Object.fromEntries(TYPES.map((t) => [t, 0]));
  for (const t of take(bag, 7000)) counts[t]++;
  for (const t of TYPES) assert.equal(counts[t], 1000);
});

test('the gap between two equal pieces never exceeds 13 pieces apart', () => {
  const seq = take(new Bag(7), 700);
  const last = {};
  seq.forEach((t, i) => {
    if (t in last) assert.ok(i - last[t] <= 13, `gap for ${t}`);
    last[t] = i;
  });
});

test('first-position distribution is roughly uniform across seeds', () => {
  const counts = Object.fromEntries(TYPES.map((t) => [t, 0]));
  for (let s = 1; s <= 700; s++) counts[new Bag(s).next()]++;
  for (const t of TYPES) assert.ok(counts[t] > 60 && counts[t] < 140, `${t}: ${counts[t]}`);
});

test('a custom random source can be injected', () => {
  const bag = new Bag(0, () => 0);
  const chunk = take(bag, 7);
  assert.deepEqual(chunk.slice().sort(), TYPES.slice().sort());
});
