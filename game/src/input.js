// Keyboard and mouse input: held keys, one-shot actions, and camera look deltas.
// Pointer lock gives the mouse to the camera; dragging works as a fallback.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let lookDX = 0, lookDY = 0, dragging = false, lastX = 0, lastY = 0;
  let mouseDown = false, mouseClicked = false;

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onMouseMove(e) {
    if (document.pointerLockElement === canvas) { lookDX += e.movementX; lookDY += e.movementY; }
    else if (dragging) { lookDX += e.clientX - lastX; lookDY += e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; }
  }
  function onMouseDown(e) {
    mouseDown = true; mouseClicked = true; dragging = true; lastX = e.clientX; lastY = e.clientY;
    if (e.button === 0 && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
  }
  function onMouseUp() { mouseDown = false; dragging = false; }
  function onBlur() { keys.clear(); mouseDown = false; dragging = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousedown', onMouseDown);

  return {
    down(code) { return keys.has(code); },
    // True once for each key press; consumed after the frame reads it.
    take(code) { if (pressed.has(code)) { pressed.delete(code); return true; } return false; },
    clearPressed() { pressed.clear(); },
    get firing() { return mouseDown; },
    takeClick() { const c = mouseClicked; mouseClicked = false; return c; },
    takeLook() { const d = { x: lookDX, y: lookDY }; lookDX = 0; lookDY = 0; return d; },
    // Movement axes from WASD/arrows: x = strafe right, y = forward.
    axes() {
      let x = 0, y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
      return { x, y };
    },
    get sprint() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    get handbrake() { return keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
    get locked() { return document.pointerLockElement === canvas; },
  };
}
