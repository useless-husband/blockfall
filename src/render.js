// Canvas drawing. Reads colours from CSS custom properties so themes just work.
import { TYPES, SHAPES } from './pieces.js';
import { COLS } from './board.js';

export const BUFFER_ROWS_SHOWN = 1; // one row of the hidden buffer is drawn so spawning is visible
export const SHOWN_ROWS = 20 + BUFFER_ROWS_SHOWN;
const FIRST_ROW = 2 - BUFFER_ROWS_SHOWN;

export function readTheme() {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const v = (n) => cs.getPropertyValue(n).trim();
  const piece = {};
  const ink = {};
  for (const t of TYPES) {
    piece[t] = v(`--p-${t}`);
    ink[t] = luminance(piece[t]) > 0.3 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.85)';
  }
  return {
    board: v('--board'), grid: v('--grid'), buffer: v('--buffer'), fg: v('--fg'), line: v('--line'),
    piece, ink, high: root.dataset.contrast === 'high',
  };
}

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function fitCanvas(canvas, w, h) {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** One cell. Each piece type has its own small pattern so colour is never the only cue. */
export function drawCell(ctx, x, y, s, type, theme, { alpha = 1, patterns = true } = {}) {
  const gap = s >= 18 ? 1 : 0.5;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = theme.piece[type] || '#888';
  ctx.fillRect(x + gap, y + gap, s - gap * 2, s - gap * 2);
  if (theme.high) {
    ctx.strokeStyle = theme.fg;
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.strokeRect(x + gap + 0.5, y + gap + 0.5, s - gap * 2 - 1, s - gap * 2 - 1);
  }
  if (patterns && s >= 10 && type !== 'G') {
    const lw = Math.max(1, s * (theme.high ? 0.13 : 0.08));
    ctx.strokeStyle = theme.ink[type];
    ctx.fillStyle = theme.ink[type];
    ctx.lineWidth = lw;
    ctx.lineCap = 'butt';
    const cx = x + s / 2;
    const cy = y + s / 2;
    const r = s * 0.22;
    ctx.beginPath();
    switch (type) {
      case 'I': ctx.moveTo(x + s * 0.2, cy); ctx.lineTo(x + s * 0.8, cy); ctx.stroke(); break;
      case 'O': ctx.strokeRect(x + s * 0.3, y + s * 0.3, s * 0.4, s * 0.4); break;
      case 'T': ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke(); break;
      case 'S': ctx.moveTo(cx - r, cy + r); ctx.lineTo(cx + r, cy - r); ctx.stroke(); break;
      case 'Z': ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.stroke(); break;
      case 'J': ctx.arc(cx, cy, s * 0.13, 0, Math.PI * 2); ctx.fill(); break;
      case 'L': ctx.arc(cx, cy, s * 0.17, 0, Math.PI * 2); ctx.stroke(); break;
      default: break;
    }
  }
  ctx.globalAlpha = 1;
}

export function drawBoard(ctx, game, theme, cell, { ghost = true, patterns = true } = {}) {
  const w = COLS * cell;
  const h = SHOWN_ROWS * cell;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = theme.board;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = theme.buffer;
  ctx.fillRect(0, 0, w, BUFFER_ROWS_SHOWN * cell);

  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < COLS; x++) {
    ctx.moveTo(x * cell + 0.5, BUFFER_ROWS_SHOWN * cell);
    ctx.lineTo(x * cell + 0.5, h);
  }
  for (let y = BUFFER_ROWS_SHOWN; y < SHOWN_ROWS; y++) {
    ctx.moveTo(0, y * cell + 0.5);
    ctx.lineTo(w, y * cell + 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = theme.line;
  ctx.beginPath();
  ctx.moveTo(0, BUFFER_ROWS_SHOWN * cell + 0.5);
  ctx.lineTo(w, BUFFER_ROWS_SHOWN * cell + 0.5);
  ctx.stroke();

  if (!game) return;
  const rows = game.board.rows;
  for (let y = FIRST_ROW; y < rows.length; y++) {
    for (let x = 0; x < COLS; x++) {
      const t = rows[y][x];
      if (t) drawCell(ctx, x * cell, (y - FIRST_ROW) * cell, cell, t, theme, { patterns });
    }
  }
  const p = game.piece;
  if (!p || game.finished) return;
  if (ghost) {
    const gy = game.ghostY();
    if (gy !== p.y) {
      ctx.strokeStyle = theme.piece[p.type];
      ctx.lineWidth = theme.high ? 3 : 2;
      for (const [cx, cy] of SHAPES[p.type][p.rot]) {
        const yy = gy + cy - FIRST_ROW;
        if (yy < 0) continue;
        ctx.globalAlpha = theme.high ? 1 : 0.75;
        ctx.strokeRect((p.x + cx) * cell + 1.5, yy * cell + 1.5, cell - 3, cell - 3);
        ctx.globalAlpha = 1;
      }
    }
  }
  const lockFade = game.lockTimer > 0 ? 1 - 0.35 * Math.min(1, game.lockTimer / 500) : 1;
  for (const [cx, cy] of SHAPES[p.type][p.rot]) {
    const yy = p.y + cy - FIRST_ROW;
    if (yy < 0) continue;
    drawCell(ctx, (p.x + cx) * cell, yy * cell, cell, p.type, theme, { alpha: lockFade, patterns });
  }
}

/** A piece centred inside a 4 x 3 mini-cell slot whose top-left is (x, y). */
export function drawMini(ctx, type, x, y, pc, theme, { alpha = 1, patterns = true } = {}) {
  const cells = SHAPES[type][0];
  const xs = cells.map((c) => c[0]);
  const ys = cells.map((c) => c[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const wCells = Math.max(...xs) - minX + 1;
  const hCells = Math.max(...ys) - minY + 1;
  const ox = x + ((4 - wCells) / 2) * pc;
  const oy = y + ((3 - hCells) / 2) * pc;
  for (const [cx, cy] of cells) {
    drawCell(ctx, ox + (cx - minX) * pc, oy + (cy - minY) * pc, pc, type, theme, { alpha, patterns });
  }
}

export function drawHold(ctx, game, theme, pc, patterns) {
  ctx.clearRect(0, 0, 4 * pc, 3 * pc);
  if (game && game.hold) {
    drawMini(ctx, game.hold, 0, 0, pc, theme, { alpha: game.holdUsed ? 0.35 : 1, patterns });
  }
}

export function drawNext(ctx, game, theme, pc, patterns) {
  ctx.clearRect(0, 0, 4 * pc, 15 * pc);
  if (!game) return;
  game.preview.forEach((t, i) => drawMini(ctx, t, 0, i * 3 * pc, pc, theme, { patterns }));
}
