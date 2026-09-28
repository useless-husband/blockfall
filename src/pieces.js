// Piece shapes and SRS kick tables.
// Coordinates: x grows to the right, y grows DOWNWARD (board coordinates).
// The kick tables below are written the way the public SRS wiki writes them
// (y grows UPWARD); kickTests() converts them to board coordinates.

export const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// Spawn state (rotation 0) cells inside the piece's bounding box.
const BASE = {
  I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { n: 4, cells: [[1, 0], [2, 0], [1, 1], [2, 1]] },
  T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};

export const BOX = Object.fromEntries(TYPES.map((t) => [t, BASE[t].n]));

function rotateCW(cells, n) {
  return cells.map(([x, y]) => [n - 1 - y, x]);
}

function build() {
  const out = {};
  for (const t of TYPES) {
    const { n, cells } = BASE[t];
    const states = [cells];
    for (let i = 1; i < 4; i++) {
      // The O piece looks identical in every state and never shifts.
      states.push(t === 'O' ? cells : rotateCW(states[i - 1], n));
    }
    out[t] = states;
  }
  return out;
}

// SHAPES[type][rotation] -> [[x, y], ...] (rotation: 0 spawn, 1 R, 2 180, 3 L)
export const SHAPES = build();

export const ROT_NAMES = ['0', 'R', '2', 'L'];

// Wiki style (y up). Key = from + to as rotation indices.
export const KICKS_JLSTZ = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

export const KICKS_I = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

// 180-degree rotation kicks (the extension used by several modern games).
export const KICKS_180 = {
  '02': [[0, 0], [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0]],
  '20': [[0, 0], [0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0]],
  '13': [[0, 0], [1, 0], [1, 2], [1, 1], [0, 2], [0, 1]],
  '31': [[0, 0], [-1, 0], [-1, 2], [-1, 1], [0, 2], [0, 1]],
};

/** Kick offsets to try, in board coordinates ([dx, dy] with y down). */
export function kickTests(type, from, to, is180 = false) {
  if (type === 'O') return [[0, 0]];
  const key = `${from}${to}`;
  let table;
  if (is180) table = KICKS_180[key];
  else table = type === 'I' ? KICKS_I[key] : KICKS_JLSTZ[key];
  return table.map(([dx, dy]) => [dx, -dy]);
}

export const SPAWN_X = 3;
export const SPAWN_Y = 1;
