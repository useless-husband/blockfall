// Default key bindings and helpers. Bindings map an action to KeyboardEvent.code values.

export const DEFAULT_KEYS = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  softDrop: ['ArrowDown'],
  hardDrop: ['Space'],
  rotateCW: ['ArrowUp', 'KeyX'],
  rotateCCW: ['KeyZ'],
  rotate180: ['KeyA'],
  hold: ['KeyC', 'ShiftLeft'],
  pause: ['Escape', 'KeyP'],
};

export const ACTION_LABELS = {
  left: '向左移動',
  right: '向右移動',
  softDrop: '軟降',
  hardDrop: '硬降',
  rotateCW: '順時針旋轉',
  rotateCCW: '逆時針旋轉',
  rotate180: '旋轉 180 度',
  hold: '暫存 (Hold)',
  pause: '暫停',
};

/** Which action does this key code trigger? (first match wins) */
export function actionForKey(keys, code) {
  for (const action of Object.keys(keys)) {
    if (keys[action].includes(code)) return action;
  }
  return null;
}

/** Bind a single key to an action, removing it from any other action. Returns a new map. */
export function rebind(keys, action, code) {
  const out = {};
  for (const a of Object.keys(keys)) {
    out[a] = a === action ? [code] : keys[a].filter((c) => c !== code);
    if (out[a].length === 0 && a !== action) out[a] = [];
  }
  return out;
}

export function keyLabel(code) {
  const map = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: '空白鍵',
    Escape: 'Esc', ShiftLeft: '左 Shift', ShiftRight: '右 Shift', ControlLeft: '左 Ctrl',
    ControlRight: '右 Ctrl', Enter: 'Enter', Backspace: 'Backspace', Tab: 'Tab',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}
