/**
 * On-screen touch controls: left joystick for movement, drag anywhere on the
 * right half to look, and buttons for fire / interact / weapon swap / reload /
 * sprint / pause. Everything feeds the same Input state the keyboard uses.
 */
export function setupTouch(input) {
  const ui = document.getElementById('touch-ui');
  ui.classList.remove('hidden');
  const $ = (id) => document.getElementById(id);

  /* ---- joystick ---- */
  const base = $('joystick');
  const knob = $('joystick-knob');
  const MAX = 46;
  let joyId = null;
  let center = { x: 0, y: 0 };

  const setKnob = (t) => {
    let dx = t.clientX - center.x;
    let dy = t.clientY - center.y;
    const len = Math.hypot(dx, dy);
    if (len > MAX) {
      dx *= MAX / len;
      dy *= MAX / len;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // Screen up (negative dy) is forward.
    input.move.x = (input.invertX ? -1 : 1) * (dx / MAX);
    input.move.y = (input.invertY ? 1 : -1) * (dy / MAX);
  };
  base.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (joyId !== null || !input.enabled) return;
    const t = e.changedTouches[0];
    joyId = t.identifier;
    const r = base.getBoundingClientRect();
    center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    setKnob(t);
  }, { passive: false });
  base.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === joyId) setKnob(t);
  }, { passive: false });
  const joyEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        joyId = null;
        input.move.x = 0;
        input.move.y = 0;
        knob.style.transform = '';
      }
    }
  };
  base.addEventListener('touchend', joyEnd);
  base.addEventListener('touchcancel', joyEnd);

  /* ---- look area (right half) ---- */
  const look = $('look-area');
  const LOOK_GAIN = 2.4;
  let lookId = null;
  let last = { x: 0, y: 0 };
  look.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (lookId !== null || !input.enabled) return;
    const t = e.changedTouches[0];
    lookId = t.identifier;
    last = { x: t.clientX, y: t.clientY };
  }, { passive: false });
  look.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId) continue;
      input.mouseDX += (t.clientX - last.x) * LOOK_GAIN;
      input.mouseDY += (t.clientY - last.y) * LOOK_GAIN * (input.invertLook ? -1 : 1);
      last = { x: t.clientX, y: t.clientY };
    }
  }, { passive: false });
  const lookEnd = (e) => {
    for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
  };
  look.addEventListener('touchend', lookEnd);
  look.addEventListener('touchcancel', lookEnd);

  /* ---- buttons ---- */
  const hold = (id, onDown, onUp) => {
    const el = $(id);
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (!input.enabled) return;
      el.classList.add('down');
      onDown();
    }, { passive: false });
    const up = (e) => {
      e.preventDefault();
      el.classList.remove('down');
      onUp?.();
    };
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
  };
  const tap = (id, code) => hold(id, () => input.pressedThisFrame.add(code));

  hold('btn-fire', () => {
    input.mouseDown = true;
    input.pressedThisFrame.add('Mouse0');
  }, () => {
    input.mouseDown = false;
  });
  tap('btn-interact', 'KeyE');
  tap('btn-swap', 'KeyQ');
  tap('btn-reload', 'KeyR');

  const sprint = $('btn-sprint');
  sprint.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!input.enabled) return;
    const on = !sprint.classList.contains('active');
    sprint.classList.toggle('active', on);
    if (on) input.keys.add('ShiftLeft');
    else input.keys.delete('ShiftLeft');
  }, { passive: false });

  $('btn-pause').addEventListener('touchstart', (e) => {
    e.preventDefault();
    input.onPauseRequest?.();
  }, { passive: false });

  /** Show/hide the interact button depending on whether a chest is in range. */
  return {
    setInteract(visible) {
      $('btn-interact').classList.toggle('available', visible);
    },
    reset() {
      sprint.classList.remove('active');
      input.move.x = input.move.y = 0;
      knob.style.transform = '';
      joyId = lookId = null;
    },
  };
}
