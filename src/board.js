// The playfield: 10 columns, 20 visible rows plus 2 hidden rows on top.

export const COLS = 10;
export const VISIBLE = 20;
export const HIDDEN = 2;
export const ROWS = VISIBLE + HIDDEN;

export class Board {
  constructor() {
    this.rows = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  /** Build from strings, aligned to the bottom. Any char except '.' or ' ' is a block. */
  static fromStrings(lines) {
    const b = new Board();
    lines.forEach((line, i) => {
      const y = ROWS - lines.length + i;
      for (let x = 0; x < COLS; x++) {
        const ch = line[x];
        b.rows[y][x] = ch && ch !== '.' && ch !== ' ' ? (ch === 'X' ? 'G' : ch) : null;
      }
    });
    return b;
  }

  toStrings() {
    return this.rows.map((r) => r.map((c) => (c ? (c === 'G' ? 'X' : c) : '.')).join(''));
  }

  clone() {
    const b = new Board();
    b.rows = this.rows.map((r) => r.slice());
    return b;
  }

  inBounds(x, y) {
    return x >= 0 && x < COLS && y >= 0 && y < ROWS;
  }

  /** Out-of-bounds cells count as solid. */
  isFree(x, y) {
    return this.inBounds(x, y) && this.rows[y][x] === null;
  }

  get(x, y) {
    return this.inBounds(x, y) ? this.rows[y][x] : undefined;
  }

  /** cells: [[dx, dy], ...] relative to (x, y). */
  collides(cells, x, y) {
    for (const [cx, cy] of cells) {
      if (!this.isFree(x + cx, y + cy)) return true;
    }
    return false;
  }

  place(cells, x, y, type) {
    for (const [cx, cy] of cells) this.rows[y + cy][x + cx] = type;
  }

  /** Removes full rows, returns how many were removed. */
  clearLines() {
    const kept = this.rows.filter((r) => r.some((c) => c === null));
    const n = ROWS - kept.length;
    if (n > 0) {
      const empty = Array.from({ length: n }, () => Array(COLS).fill(null));
      this.rows = empty.concat(kept);
    }
    return n;
  }

  isEmpty() {
    return this.rows.every((r) => r.every((c) => c === null));
  }

  clear() {
    this.rows = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }
}
