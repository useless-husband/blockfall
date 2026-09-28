import { Game } from '../src/engine.js';
import { Board } from '../src/board.js';

/** Game with a hand-made board (strings, bottom aligned) and a chosen active piece. */
export function setup(rows, piece, opts = {}) {
  const g = new Game({ seed: 7, mode: 'marathon', ...opts });
  g.board = Board.fromStrings(rows);
  if (piece) g.setPiece(...piece);
  return g;
}

export function steps(g, n) {
  for (let i = 0; i < n; i++) g.step();
}

export function tap(g, action) {
  g.input(action, true);
  g.input(action, false);
}

/** Four full rows with a one-wide well on the right, plus an I piece ready to drop in. */
export const QUAD_ROWS = Array(4).fill('XXXXXXXXX.');
export const QUAD_PIECE = ['I', 7, 18, 1];
