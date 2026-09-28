// Deterministic random numbers and the 7-bag randomizer.
import { TYPES } from './pieces.js';

/** mulberry32: small, fast, seedable PRNG. Returns floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 7-bag: every 7 pieces contain each tetromino exactly once. */
export class Bag {
  constructor(seed = 1, rand = null) {
    this.rand = rand || mulberry32(seed);
    this.bag = [];
  }

  refill() {
    const b = TYPES.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    this.bag = b;
  }

  next() {
    if (this.bag.length === 0) this.refill();
    return this.bag.pop();
  }
}
