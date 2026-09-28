// Touch gestures on the playfield:
//   drag left/right  -> move one column per cell of finger travel
//   tap              -> rotate clockwise
//   slow drag down   -> soft drop while the finger stays low
//   quick flick down -> hard drop

export class TouchControls {
  constructor(el, { cellSize, onAction, isActive }) {
    this.el = el;
    this.cellSize = cellSize;
    this.onAction = onAction;
    this.isActive = isActive;
    this.p = null;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
  }

  down(e) {
    if (e.pointerType === 'mouse' || !this.isActive()) return;
    if (e.target.closest('button, dialog, input, select, a')) return;
    if (this.p) return;
    this.el.setPointerCapture?.(e.pointerId);
    this.p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, ax: e.clientX, moved: false, soft: false };
  }

  move(e) {
    const p = this.p;
    if (!p || e.pointerId !== p.id) return;
    const cell = this.cellSize();
    const step = cell * 0.95;
    while (e.clientX - p.ax >= step) {
      p.ax += step;
      p.moved = true;
      this.tap('right');
    }
    while (p.ax - e.clientX >= step) {
      p.ax -= step;
      p.moved = true;
      this.tap('left');
    }
    const dy = e.clientY - p.y0;
    if (!p.soft && dy > cell * 1.6 && e.timeStamp - p.t0 > 150) {
      p.soft = true;
      p.moved = true;
      this.onAction('softDrop', true);
    } else if (p.soft && dy < cell * 1.0) {
      p.soft = false;
      this.onAction('softDrop', false);
    }
  }

  up(e, cancelled = false) {
    const p = this.p;
    if (!p || e.pointerId !== p.id) return;
    this.p = null;
    if (p.soft) this.onAction('softDrop', false);
    if (cancelled) return;
    const cell = this.cellSize();
    const dx = e.clientX - p.x0;
    const dy = e.clientY - p.y0;
    const dt = e.timeStamp - p.t0;
    if (dy > cell * 2.5 && dt < 280 && dy > Math.abs(dx) * 2) {
      this.onAction('hardDrop', true);
    } else if (!p.moved && Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 350) {
      this.tap('rotateCW');
    }
  }

  tap(action) {
    this.onAction(action, true);
    this.onAction(action, false);
  }
}
