// Fixed-timestep accumulator. Rendering runs at the display rate, the game
// logic runs in constant 1/60 s steps. Time comes from the caller, so tests
// can drive it with a fake clock.

import { STEP_MS } from './engine.js';

export class FixedLoop {
  constructor(step, { stepMs = STEP_MS, maxSteps = 64 } = {}) {
    this.stepFn = step;
    this.stepMs = stepMs;
    this.maxSteps = maxSteps;
    this.acc = 0;
  }

  /** Feed elapsed real milliseconds. Returns the number of logic steps run. */
  advance(elapsedMs, speed = 1) {
    if (!(elapsedMs > 0)) return 0;
    // Cap huge gaps (tab was hidden) so the game never fast-forwards.
    this.acc += Math.min(elapsedMs, 250) * speed;
    let n = 0;
    while (this.acc + 1e-9 >= this.stepMs && n < this.maxSteps) {
      this.stepFn();
      this.acc -= this.stepMs;
      n++;
    }
    if (n === this.maxSteps) this.acc = 0;
    return n;
  }

  reset() {
    this.acc = 0;
  }

  /** 0..1 progress towards the next step (for interpolation if wanted). */
  get alpha() {
    return this.acc / this.stepMs;
  }
}
