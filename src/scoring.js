// Pure scoring rules (guideline style). All values are multiplied by level.

const LINE_NAMES = ['', 'Single', 'Double', 'Triple', 'Quad'];
const BASE_LINES = [0, 100, 300, 500, 800];
const BASE_TSPIN = [400, 800, 1200, 1600];
const BASE_MINI = [100, 200, 400, 400];
const BASE_PC = [0, 800, 1200, 1800, 2000];
const BASE_PC_B2B_QUAD = 3200;

export const SOFT_DROP_POINTS = 1;
export const HARD_DROP_POINTS = 2;
export const COMBO_POINTS = 50;

/**
 * tspin: null | 'mini' | 'full'
 * Returns { label, base, difficult } where difficult means it can start/continue Back-to-Back.
 */
export function classifyClear(lines, tspin) {
  if (tspin === 'full') {
    return {
      label: lines === 0 ? 'T-Spin' : `T-Spin ${LINE_NAMES[lines]}`,
      base: BASE_TSPIN[lines],
      difficult: lines > 0,
    };
  }
  if (tspin === 'mini') {
    return {
      label: lines === 0 ? 'T-Spin Mini' : `T-Spin Mini ${LINE_NAMES[lines]}`,
      base: BASE_MINI[lines],
      difficult: lines > 0,
    };
  }
  return { label: LINE_NAMES[lines] || '', base: BASE_LINES[lines], difficult: lines === 4 };
}

export function perfectClearBase(lines, b2bApplied) {
  if (lines === 4 && b2bApplied) return BASE_PC_B2B_QUAD;
  return BASE_PC[lines] || 0;
}

export function comboBonus(combo, level) {
  return combo > 0 ? COMBO_POINTS * combo * level : 0;
}

export function applyB2B(base) {
  return Math.floor(base * 1.5);
}

/** Seconds a piece takes to fall one row (modern guideline formula). */
export function secondsPerRow(level) {
  return Math.pow(0.8 - (level - 1) * 0.007, level - 1);
}

/** Cells per 1/60 s frame. */
export function gravityPerFrame(level) {
  return 1 / (secondsPerRow(level) * 60);
}
