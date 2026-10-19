// Keyboard input. `down` is the live state; `pressed`/`released` are edge
// flags that survive until the next fixed update consumes them, so a tap
// that happens between two updates is never lost.
const Input = (() => {
  const BINDINGS = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    jump: ['Space', 'KeyZ', 'KeyK'],
    attack: ['KeyX', 'KeyJ'],
    start: ['Enter', 'NumpadEnter'],
    mute: ['KeyM'],
    pause: ['Escape', 'KeyP'],
  };

  const codeToAction = {};
  for (const action in BINDINGS) {
    for (const code of BINDINGS[action]) codeToAction[code] = action;
  }

  const down = {};
  const pressed = {};
  const released = {};
  const listeners = [];

  window.addEventListener('keydown', (e) => {
    const action = codeToAction[e.code];
    if (!action) return;
    e.preventDefault();
    if (!down[action]) pressed[action] = true;
    down[action] = true;
    for (const fn of listeners) fn(action);
  });

  window.addEventListener('keyup', (e) => {
    const action = codeToAction[e.code];
    if (!action) return;
    e.preventDefault();
    if (down[action]) released[action] = true;
    down[action] = false;
  });

  // Losing focus would otherwise leave keys stuck down.
  window.addEventListener('blur', () => {
    for (const k in down) down[k] = false;
  });

  return {
    down: (a) => !!down[a],
    pressed: (a) => !!pressed[a],
    released: (a) => !!released[a],
    axisX: () => (down.right ? 1 : 0) - (down.left ? 1 : 0),
    onPress: (fn) => listeners.push(fn),
    endFrame() {
      for (const k in pressed) pressed[k] = false;
      for (const k in released) released[k] = false;
    },
  };
})();
